#!/usr/bin/env python3
"""Rewrite one LaunchAgent plist's program, log paths and working dir (used by deploy-lanes.sh).
usage: set-launchd-lane.py <plist> <log_path> <workdir> [--time HH:MM] -- <program args...>"""
import plistlib, sys
argv = sys.argv[1:]
sep = argv.index("--")
head, prog = argv[:sep], argv[sep + 1:]
plist_path, log_path, workdir = head[:3]
opts = head[3:]
with open(plist_path, "rb") as f:
    d = plistlib.load(f)
d["ProgramArguments"] = prog
d["StandardOutPath"] = log_path
d["StandardErrorPath"] = log_path
d["WorkingDirectory"] = workdir
if "--time" in opts:
    h, m = opts[opts.index("--time") + 1].split(":")
    d["StartCalendarInterval"] = {"Hour": int(h), "Minute": int(m)}
with open(plist_path, "wb") as f:
    plistlib.dump(d, f)
