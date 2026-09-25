#!/usr/bin/env python3
"""Rewrite (or create) one LaunchAgent plist's program, log paths, working dir and schedule (used by deploy-lanes.sh).
usage: set-launchd-lane.py <plist> <log_path> <workdir> [--time HH:MM] [--weekdays 1-5] [--keepalive] -- <program args...>"""
import os, plistlib, sys
argv = sys.argv[1:]
sep = argv.index("--")
head, prog = argv[:sep], argv[sep + 1:]
plist_path, log_path, workdir = head[:3]
opts = head[3:]
if os.path.exists(plist_path):
    with open(plist_path, "rb") as f:
        d = plistlib.load(f)
else:
    d = {"Label": os.path.basename(plist_path)[:-len(".plist")], "RunAtLoad": False}
d["ProgramArguments"] = prog
d["StandardOutPath"] = log_path
d["StandardErrorPath"] = log_path
d["WorkingDirectory"] = workdir
if "--time" in opts:
    h, m = opts[opts.index("--time") + 1].split(":")
    if "--weekdays" in opts:
        a, b = opts[opts.index("--weekdays") + 1].split("-")
        d["StartCalendarInterval"] = [{"Weekday": w, "Hour": int(h), "Minute": int(m)} for w in range(int(a), int(b) + 1)]
    else:
        d["StartCalendarInterval"] = {"Hour": int(h), "Minute": int(m)}
if "--keepalive" in opts:
    d["KeepAlive"] = True
    d["RunAtLoad"] = True
    d["ThrottleInterval"] = 30
    d.pop("StartCalendarInterval", None)
with open(plist_path, "wb") as f:
    plistlib.dump(d, f)
