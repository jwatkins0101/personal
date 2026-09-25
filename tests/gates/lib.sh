# Shared helpers for gate scripts. Each gate prints PASS/FAIL lines and exits nonzero on any failure.
fail=0
hookjson() { python3 -c 'import json,sys;print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$1"; }
expect_exit() { # expect_exit <want> <label> <hook> <command>
  local want="$1" label="$2" hook="$3" got
  hookjson "$4" | "$hook" >/dev/null 2>&1; got=$?
  if [ "$got" = "$want" ]; then echo "PASS $label (exit $got)"; else echo "FAIL $label (want $want, got $got)"; fail=1; fi
}
expect_raw_exit() { # expect_raw_exit <want> <label> <hook> <raw stdin>
  local want="$1" label="$2" hook="$3" got
  printf '%s' "$4" | "$hook" >/dev/null 2>&1; got=$?
  if [ "$got" = "$want" ]; then echo "PASS $label (exit $got)"; else echo "FAIL $label (want $want, got $got)"; fail=1; fi
}
