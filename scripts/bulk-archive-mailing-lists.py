#!/usr/bin/env python3
"""
Bulk-archive Gmail messages that have a List-Unsubscribe header.

Strategy:
1. Page through all in:inbox message IDs (resumable)
2. Fetch metadata in parallel; as each archive target is identified,
   stream it to a background archiver that batchModifies in chunks of
   1000 (or every 60s, whichever comes first) — so step 3 runs as
   step 2 processes
3. After step 2 drains, step 3 is a belt-and-suspenders sweep that
   picks up anything the streaming archiver missed (failed batches,
   crash recovery)

Reversible. Never deletes. Skips STARRED.
"""
import json
import queue
import subprocess
import sys
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

WORK_DIR = Path.home() / "Library" / "Application Support" / "assistance" / "bulk-archive"
WORK_DIR.mkdir(parents=True, exist_ok=True)
IDS_FILE = WORK_DIR / "inbox_ids.txt"
TO_ARCHIVE_FILE = WORK_DIR / "to_archive.txt"
ARCHIVED_FILE = WORK_DIR / "archived_done.txt"
PROGRESS_FILE = WORK_DIR / "progress.log"


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(PROGRESS_FILE, "a") as f:
        f.write(line + "\n")


def gws(args, capture=True, timeout=120):
    r = subprocess.run(
        ["gws"] + args,
        capture_output=capture,
        text=True,
        timeout=timeout,
    )
    if r.returncode != 0:
        raise RuntimeError(f"gws failed: {r.stderr[:300]}")
    return r.stdout


def step1_list_inbox_ids():
    """Paginate inbox manually, writing IDs to disk after each page so we can resume."""
    PAGE_TOKEN_FILE = WORK_DIR / "next_page_token.txt"
    if IDS_FILE.exists() and not PAGE_TOKEN_FILE.exists():
        ids = [l.strip() for l in IDS_FILE.read_text().splitlines() if l.strip()]
        log(f"step 1: reusing cached {len(ids)} inbox IDs from {IDS_FILE}")
        return ids
    log("step 1: paging through inbox to collect all IDs (writing incrementally)…")
    next_token = None
    if PAGE_TOKEN_FILE.exists():
        next_token = PAGE_TOKEN_FILE.read_text().strip() or None
        existing_n = sum(1 for _ in open(IDS_FILE)) if IDS_FILE.exists() else 0
        log(f"  resuming from saved token, {existing_n} IDs already on disk")
    page_count = 0
    total = 0
    if IDS_FILE.exists():
        total = sum(1 for _ in open(IDS_FILE))
    out_fp = open(IDS_FILE, "a")
    while True:
        params = {"userId": "me", "q": "in:inbox", "maxResults": 500}
        if next_token:
            params["pageToken"] = next_token
        try:
            raw = gws([
                "gmail", "users", "messages", "list",
                "--params", json.dumps(params),
            ], timeout=60)
        except subprocess.TimeoutExpired:
            log(f"  page {page_count}: timeout, retrying once…")
            try:
                raw = gws([
                    "gmail", "users", "messages", "list",
                    "--params", json.dumps(params),
                ], timeout=120)
            except Exception as e:
                log(f"  page {page_count}: second attempt failed: {e}")
                break
        try:
            page = json.loads(raw)
        except json.JSONDecodeError:
            log(f"  page {page_count}: non-JSON response, stopping")
            break
        msgs = page.get("messages", []) or []
        for m in msgs:
            out_fp.write(m["id"] + "\n")
        total += len(msgs)
        page_count += 1
        next_token = page.get("nextPageToken")
        if not next_token:
            out_fp.flush()
            PAGE_TOKEN_FILE.unlink(missing_ok=True)
            break
        PAGE_TOKEN_FILE.write_text(next_token)
        out_fp.flush()
        if page_count % 20 == 0:
            log(f"  page {page_count}: total {total} IDs so far")
    out_fp.close()
    log(f"step 1 done: {total} IDs written to {IDS_FILE}")
    return [l.strip() for l in IDS_FILE.read_text().splitlines() if l.strip()]


def get_meta_one(mid):
    """Return (mid, has_unsubscribe, starred) — None if API failed."""
    try:
        out = gws([
            "gmail", "users", "messages", "get",
            "--params", json.dumps({
                "userId": "me",
                "id": mid,
                "format": "metadata",
                "metadataHeaders": ["List-Unsubscribe", "List-Id"],
            }),
        ])
    except Exception:
        return mid, None, None
    try:
        d = json.loads(out)
    except json.JSONDecodeError:
        return mid, None, None
    labels = d.get("labelIds", []) or []
    headers = {h["name"].lower(): h["value"] for h in (d.get("payload", {}).get("headers", []) or [])}
    has_list = "list-unsubscribe" in headers or "list-id" in headers
    starred = "STARRED" in labels
    return mid, has_list, starred


ARCHIVE_BATCH_SIZE = 1000
ARCHIVE_FLUSH_SECONDS = 60.0
_SENTINEL = object()


def _flush_archive_batch(batch, archived_lock):
    """batchModify a chunk of ids, then record durably to ARCHIVED_FILE."""
    body = json.dumps({"ids": batch, "removeLabelIds": ["INBOX"]})
    try:
        gws([
            "gmail", "users", "messages", "batchModify",
            "--params", '{"userId":"me"}',
            "--json", body,
        ])
    except Exception as e:
        log(f"  archiver: batchModify failed for {len(batch)} ids: {e}")
        return 0
    with archived_lock, open(ARCHIVED_FILE, "a") as f:
        f.write("\n".join(batch) + "\n")
    log(f"  archiver: flushed {len(batch)}")
    return len(batch)


def archiver_worker(q, archived_lock, stats):
    """Drain q; flush whenever batch hits ARCHIVE_BATCH_SIZE or sits for ARCHIVE_FLUSH_SECONDS."""
    batch = []
    first_added = None
    while True:
        timeout = None if not batch else max(0.5, ARCHIVE_FLUSH_SECONDS - (time.time() - first_added))
        try:
            item = q.get(timeout=timeout)
        except queue.Empty:
            item = None
        if item is _SENTINEL:
            break
        if item is not None:
            if not batch:
                first_added = time.time()
            batch.append(item)
            if len(batch) >= ARCHIVE_BATCH_SIZE:
                stats["archived"] += _flush_archive_batch(batch, archived_lock)
                batch = []
                first_added = None
        elif batch and time.time() - first_added >= ARCHIVE_FLUSH_SECONDS:
            stats["archived"] += _flush_archive_batch(batch, archived_lock)
            batch = []
            first_added = None
    if batch:
        stats["archived"] += _flush_archive_batch(batch, archived_lock)
    log(f"archiver: drained, total archived this run = {stats['archived']}")


def step2_filter(ids):
    if TO_ARCHIVE_FILE.exists() and TO_ARCHIVE_FILE.stat().st_size > 0:
        existing = [l.strip() for l in TO_ARCHIVE_FILE.read_text().splitlines() if l.strip()]
        log(f"step 2: reusing cached {len(existing)} archive targets from {TO_ARCHIVE_FILE}")
        return existing

    already_archived = set()
    if ARCHIVED_FILE.exists():
        already_archived = set(l.strip() for l in ARCHIVED_FILE.read_text().splitlines() if l.strip())
    to_process = [i for i in ids if i not in already_archived]
    if len(to_process) != len(ids):
        log(f"step 2: skipping {len(ids) - len(to_process)} ids already in {ARCHIVED_FILE.name}")

    log(f"step 2: fetching metadata for {len(to_process)} messages with 32-way parallelism, archiving concurrently…")

    archive_q = queue.Queue(maxsize=5000)
    archived_lock = threading.Lock()
    stats = {"archived": 0}
    arch_thread = threading.Thread(
        target=archiver_worker, args=(archive_q, archived_lock, stats), daemon=True
    )
    arch_thread.start()

    keep_count = 0
    starred = 0
    api_errors = 0
    no_list = 0
    n = 0
    t0 = time.time()
    to_archive_fp = open(TO_ARCHIVE_FILE, "a")  # durable list, append as we find them
    try:
        with ThreadPoolExecutor(max_workers=32) as pool:
            futures = {pool.submit(get_meta_one, mid): mid for mid in to_process}
            for fut in as_completed(futures):
                mid, has_list, was_starred = fut.result()
                n += 1
                if has_list is None:
                    api_errors += 1
                elif was_starred:
                    starred += 1
                elif has_list:
                    keep_count += 1
                    to_archive_fp.write(mid + "\n")
                    to_archive_fp.flush()
                    archive_q.put(mid)
                else:
                    no_list += 1
                if n % 500 == 0:
                    elapsed = time.time() - t0
                    rate = n / elapsed
                    eta = (len(to_process) - n) / rate if rate > 0 else 0
                    log(f"  progress: {n}/{len(to_process)} ({rate:.1f}/s, ETA {eta:.0f}s) | queued={keep_count} archived={stats['archived']} skip_starred={starred} skip_no_list={no_list} errors={api_errors}")
    finally:
        to_archive_fp.close()
        archive_q.put(_SENTINEL)
        arch_thread.join(timeout=600)

    log(f"step 2 done: queued={keep_count} archived_inline={stats['archived']} skip_starred={starred} skip_no_list={no_list} errors={api_errors}")
    return [l.strip() for l in TO_ARCHIVE_FILE.read_text().splitlines() if l.strip()]


def step3_archive(ids):
    already = set()
    if ARCHIVED_FILE.exists():
        already = set(l.strip() for l in ARCHIVED_FILE.read_text().splitlines() if l.strip())
    remaining = [i for i in ids if i not in already]
    log(f"step 3: archiving {len(remaining)} (already done: {len(already)})")
    CHUNK = 1000
    for i in range(0, len(remaining), CHUNK):
        chunk = remaining[i:i + CHUNK]
        body = json.dumps({
            "ids": chunk,
            "removeLabelIds": ["INBOX"],
        })
        try:
            gws([
                "gmail", "users", "messages", "batchModify",
                "--params", '{"userId":"me"}',
                "--json", body,
            ])
        except Exception as e:
            log(f"  batch {i}-{i+len(chunk)} failed: {e}")
            continue
        with open(ARCHIVED_FILE, "a") as f:
            f.write("\n".join(chunk) + "\n")
        log(f"  archived {i + len(chunk)}/{len(remaining)}")
    log("step 3 done")


def main():
    log("=== bulk-archive-mailing-lists.py start ===")
    ids = step1_list_inbox_ids()
    to_archive = step2_filter(ids)
    if not to_archive:
        log("nothing to archive — exiting")
        return
    step3_archive(to_archive)
    # Final count
    try:
        out = gws([
            "gmail", "users", "messages", "list",
            "--params", '{"userId":"me","q":"in:inbox","maxResults":1}',
        ])
        d = json.loads(out)
        log(f"inbox resultSizeEstimate now: {d.get('resultSizeEstimate','?')}")
    except Exception as e:
        log(f"final count failed: {e}")
    log("=== done ===")


if __name__ == "__main__":
    main()
