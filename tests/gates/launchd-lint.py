#!/usr/bin/env python3
"""gate:launchd-lint (AC-11). Part A: lane wrapper behavior (hermetic). Part B: live LaunchAgents.
PLIST_DIR swaps the LaunchAgents dir (negative validation uses a pre-fix yt plist)."""
import json, os, plistlib, subprocess, sys, tempfile, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HOME = os.path.expanduser("~")
fail = 0
def check(ok, label):
    global fail
    print(("PASS " if ok else "FAIL ") + label)
    if not ok: fail = 1

# ---- Part A: wrapper behavior ----
wrap = os.path.join(ROOT, "cos/bin/lane-run.sh")
with tempfile.TemporaryDirectory() as d:
    env = {**os.environ, "COS_LEDGER_DIR": d, "COS_BACKOFF": "0 0 0 0", "TMPDIR": d}
    def run(lane, *args):
        return subprocess.run(["/bin/bash", wrap, lane, *args], env=env, capture_output=True, text=True).returncode
    def last(lane):
        with open(os.path.join(d, f"{lane}.jsonl")) as f: return json.loads(f.read().strip().split("\n")[-1])
    counter = os.path.join(d, "n")
    flaky = f'n=$(cat {counter} 2>/dev/null || echo 0); n=$((n+1)); echo $n > {counter}; [ $n -ge 3 ]'
    check(run("flaky", "--attempts", "3", "--", "/bin/bash", "-c", flaky) == 0 and last("flaky")["status"] == "ok", "fails twice, succeeds on attempt 3: ok record")
    code = run("broken", "--attempts", "2", "--", "/bin/bash", "-c", "exit 7")
    r = last("broken")
    check(code == 7 and r["status"] == "failed" and "exit_code: 7 after 2 attempt(s)" in r["gaps"], "always failing: failed record with exit gap")
    today = datetime.date.today().isoformat()
    run("art", "--artifact", os.path.join(d, "brief-{date}.html"), "--", "/usr/bin/true")
    r = last("art")
    check(r["status"] == "failed" and f"missing_artifact: {os.path.join(d, 'brief-' + today + '.html')}" in r["gaps"], "{date} artifact expanded; missing file fails the run")
    good = 'jq -n \'{items_in:3, items_out:{a:2,b:1}}\' > "$COS_RUN_SUMMARY"'
    check(run("counts", "--", "/bin/bash", "-c", good) == 0 and last("counts")["items_in"] == 3 and last("counts")["status"] == "ok", "lane summary is recorded")
    bad = 'jq -n \'{items_in:17, items_out:{a:16}}\' > "$COS_RUN_SUMMARY"'
    run("counts", "--", "/bin/bash", "-c", bad)
    check(last("counts")["status"] == "failed", "unreconciled lane summary fails the run")

# ---- Part B: live LaunchAgents ----
# Flight check was removed (D10): its job must stay unloaded.
check(not os.path.exists(os.path.join(os.environ.get("PLIST_DIR", os.path.join(HOME, "Library/LaunchAgents")), "com.assistance.flight-check.plist")) or "PLIST_DIR" in os.environ,
      "com.assistance.flight-check: removed (D10)")
plist_dir = os.environ.get("PLIST_DIR", os.path.join(HOME, "Library/LaunchAgents"))
lanes = json.load(open(os.path.join(ROOT, "cos/lanes.json")))["lanes"]
docs = os.path.join(HOME, "Documents")
seen = set()
for l in lanes:
    label = l["label"]
    if label in seen: continue
    seen.add(label)
    path = os.path.join(plist_dir, f"{label}.plist")
    if not os.path.exists(path):
        if "PLIST_DIR" in os.environ: continue
        check(False, f"{label}: plist missing"); continue
    p = plistlib.load(open(path, "rb"))
    args = p.get("ProgramArguments", [])
    for k in ("StandardOutPath", "StandardErrorPath", "WorkingDirectory"):
        v = p.get(k, "")
        check(bool(v) and v.startswith("/") and not v.startswith(docs), f"{label}: {k} absolute and outside ~/Documents")
    check(bool(args) and args[0] == "/bin/bash", f"{label}: runs via /bin/bash (Full Disk Access)")
    check(not any("/Documents/" in a for a in args), f"{label}: no program argument points into ~/Documents (D11)")
    if label == "com.assistance.cos-morning":
        sci = p.get("StartCalendarInterval")
        days = sorted(x.get("Weekday") for x in sci) if isinstance(sci, list) else []
        check(days == [1, 2, 3, 4, 5] and all((x.get("Hour"), x.get("Minute")) == (7, 30) for x in sci), f"{label}: 07:30 Mon-Fri (AC-17)")
    if label in ("com.assistance.cos-eod", "com.assistance.cos-weekly"):
        sci = p.get("StartCalendarInterval")
        want = ([1, 2, 3, 4, 5], (17, 30)) if label.endswith("eod") else ([5], (15, 0))
        days = sorted(x.get("Weekday") for x in sci) if isinstance(sci, list) else []
        check(days == want[0] and all((x.get("Hour"), x.get("Minute")) == want[1] for x in sci), f"{label}: scheduled {want[1][0]:02d}:{want[1][1]:02d} on {want[0]}")
    if label.startswith("com.assistance.triage-"):
        sci = p.get("StartCalendarInterval")
        hours = sorted(x.get("Hour") for x in sci) if isinstance(sci, list) else []
        check(hours == list(range(7, 22)) and all(x.get("Minute") == 5 for x in sci), f"{label}: hourly at :05, 7am-9pm")
    if label == "com.assistance.cos-eod":
        check(any(a.endswith("/with-sms-snapshot.sh") for a in args), f"{label}: runs with SMS snapshots")
    if label == "com.assistance.task-capture":
        runner = args[1] if len(args) > 1 else ""
        txt = open(runner).read() if os.path.exists(runner) else ""
        check("tasks-email" in txt and "tasks-sms" in txt and "lane-run.sh" in txt, f"{label}: runner wraps tasks-email and tasks-sms")
    else:
        check(len(args) > 2 and args[1].endswith("/cos/bin/lane-run.sh") and args[1].startswith("/") and not args[1].startswith(docs) and args[2] == l["lane"],
              f"{label}: wrapped by lane-run.sh as lane '{l['lane']}'")
# Live board (D16): always-on, bash, logs outside ~/Documents, binds localhost in code.
bp = os.path.join(plist_dir, "com.assistance.cos-board.plist")
if os.path.exists(bp) or "PLIST_DIR" not in os.environ:
    if not os.path.exists(bp):
        check(False, "com.assistance.cos-board: plist missing")
    else:
        b = plistlib.load(open(bp, "rb"))
        check(b.get("KeepAlive") is True and b.get("RunAtLoad") is True, "com.assistance.cos-board: KeepAlive + RunAtLoad")
        check(b.get("ProgramArguments", [""])[0] == "/bin/bash" and "src/cos/cli.ts board" in " ".join(b.get("ProgramArguments", [])), "com.assistance.cos-board: runs the board via /bin/bash")
        check(all(not str(b.get(k, "")).startswith(docs) and str(b.get(k, "")).startswith("/") for k in ("StandardOutPath", "StandardErrorPath", "WorkingDirectory")), "com.assistance.cos-board: logs and working dir outside ~/Documents")
sys.exit(fail)
