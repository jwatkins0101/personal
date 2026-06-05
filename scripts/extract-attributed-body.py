#!/usr/bin/env python3
"""Extract message text from attributedBody blobs in iMessage database.

Messages stored in Apple's Messages app sometimes have their text only in the
binary `attributedBody` column (a typedstream/NSKeyedArchiver blob) rather than
the `text` column. This script extracts those messages for a given handle.

Usage:
    python3 scripts/extract-attributed-body.py "+15027143046" [limit]

Output:
    JSON array of objects matching the MessagesClient Message shape:
    [{ "ROWID": 123, "guid": "...", "text": "extracted text", "date": ..., ... }]
"""

import json
import plistlib
import sqlite3
import struct
import sys
import os


# MESSAGES_DB override lets a scheduled job read a temp copy (made via a direct bash->sqlite3
# call) instead of the TCC-protected original, which the npm->node->python chain can't open.
DB_PATH = os.environ.get("MESSAGES_DB") or os.path.expanduser("~/Library/Messages/chat.db")

APPLE_EPOCH_OFFSET = 978307200  # seconds between 1970 and 2001 epochs


def extract_from_typedstream(blob: bytes) -> str | None:
    """Extract text from a typedstream (streamtyped) format blob.

    In typedstream format, the message text is stored as a length-prefixed
    string after the NSString class marker. The pattern is:
        NSString <marker bytes> 0x2b <length_byte> <utf8_text>
    For strings >= 128 bytes, length is encoded as a multi-byte varint.
    """
    # Find NSString marker - text follows after it
    # Pattern: ...NSString\x01\x9X\x84\x01\x2b<len><text>...
    # The \x2b ('+') byte signals the start of a string value
    markers = [b"NSString\x01\x94\x84\x01+", b"NSString\x01\x95\x84\x01+"]
    for marker in markers:
        idx = blob.find(marker)
        if idx == -1:
            continue

        pos = idx + len(marker)
        if pos >= len(blob):
            continue

        # Read string length (variable-length encoding)
        length = blob[pos]
        pos += 1

        if length == 0x81 and pos + 2 <= len(blob):
            # Two-byte length: 0x81 followed by 2 bytes big-endian
            length = struct.unpack(">H", blob[pos:pos + 2])[0]
            pos += 2
        elif length == 0x82 and pos + 4 <= len(blob):
            # Four-byte length
            length = struct.unpack(">I", blob[pos:pos + 4])[0]
            pos += 4

        if pos + length > len(blob):
            # Clamp to available data
            length = len(blob) - pos

        if length > 0:
            try:
                text = blob[pos:pos + length].decode("utf-8")
                return text
            except UnicodeDecodeError:
                # Try with error replacement
                text = blob[pos:pos + length].decode("utf-8", errors="replace")
                if text and len(text.strip()) > 0:
                    return text

    return None


def extract_from_bplist(blob: bytes) -> str | None:
    """Extract text from a bplist (NSKeyedArchiver) format blob."""
    try:
        plist = plistlib.loads(blob)
        objects = plist.get("$objects", [])

        # Look for NS.string key in dict objects (the proper way)
        for obj in objects:
            if isinstance(obj, dict) and "NS.string" in obj:
                ref = obj["NS.string"]
                # ref might be a UID pointing to another object
                if isinstance(ref, plistlib.UID):
                    target = objects[ref.data]
                    if isinstance(target, str):
                        return target
                elif isinstance(ref, str):
                    return ref

        # Fallback: find the first substantial non-metadata string
        skip = {"$null", "$archiver", "NSKeyedArchiver", "NSString",
                "NSMutableString", "NSAttributedString",
                "NSMutableAttributedString", "NSObject", "NSDictionary",
                "NSArray", "NSMutableArray", "NSMutableDictionary",
                "NSNumber", "NSValue", "NSData"}
        for obj in objects:
            if isinstance(obj, str) and obj not in skip and not obj.startswith("__kIM"):
                if len(obj) > 1:
                    return obj
    except Exception:
        pass

    return None


def extract_text_from_attributed_body(blob: bytes) -> str | None:
    """Extract message text from an attributedBody blob.

    Handles both typedstream and bplist formats.
    """
    if not blob or len(blob) < 10:
        return None

    # Detect format
    if blob[:2] == b"\x04\x0b":
        # typedstream format
        return extract_from_typedstream(blob)
    elif blob[:6] == b"bplist":
        # bplist (NSKeyedArchiver) format
        return extract_from_bplist(blob)
    else:
        # Try both
        result = extract_from_typedstream(blob)
        if result:
            return result
        return extract_from_bplist(blob)


def main():
    import time

    if len(sys.argv) < 2:
        print("Usage: extract-attributed-body.py <handle_id> [limit]", file=sys.stderr)
        print("   or: extract-attributed-body.py --recent <days> [limit]", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(DB_PATH):
        print(json.dumps([]))
        sys.exit(0)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    base_select = """
        SELECT
            m.ROWID,
            m.guid,
            m.attributedBody,
            m.date,
            m.is_from_me,
            m.is_read,
            m.cache_has_attachments,
            m.reply_to_guid,
            m.thread_originator_guid,
            h.id as handle_id
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE (m.text IS NULL OR m.text = '')
          AND m.attributedBody IS NOT NULL
    """

    if sys.argv[1] == "--recent":
        # Recent incoming messages across ALL handles within a date window.
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 5000
        cutoff_ns = int((time.time() - APPLE_EPOCH_OFFSET - days * 86400) * 1_000_000_000)
        cursor = conn.execute(
            base_select
            + " AND m.is_from_me = 0 AND m.date >= ? ORDER BY m.date DESC LIMIT ?",
            (cutoff_ns, limit),
        )
    else:
        # Per-handle mode (used by deep-dive / getAllMessagesForHandle).
        handle_id = sys.argv[1]
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10000
        cursor = conn.execute(
            base_select + " AND h.id = ? ORDER BY m.date DESC LIMIT ?",
            (handle_id, limit),
        )

    results = []
    extracted = 0
    failed = 0

    for row in cursor:
        blob = row["attributedBody"]
        if not blob:
            continue

        text = extract_text_from_attributed_body(blob)
        if text and len(text.strip()) > 0:
            results.append({
                "ROWID": row["ROWID"],
                "guid": row["guid"],
                "text": text.strip(),
                "date": row["date"],
                "is_from_me": row["is_from_me"],
                "is_read": row["is_read"],
                "cache_has_attachments": row["cache_has_attachments"],
                "reply_to_guid": row["reply_to_guid"],
                "thread_originator_guid": row["thread_originator_guid"],
                "handle_id": row["handle_id"],
            })
            extracted += 1
        else:
            failed += 1

    conn.close()

    print(json.dumps(results), end="")

    # Stats to stderr so they don't interfere with JSON output
    print(f"Extracted: {extracted}, Failed: {failed}", file=sys.stderr)


if __name__ == "__main__":
    main()
