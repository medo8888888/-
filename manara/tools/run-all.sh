#!/usr/bin/env bash
# MANARA («منارة») - run every test suite and print ONE verdict line per suite.
#
#   bash manara/tools/run-all.sh                   # everything (about 20 minutes: the browser suites are slow)
#   bash manara/tools/run-all.sh --fast            # skip the slowest browser suites (poster, home, pitch, alert, detect, mission)
#   bash manara/tools/run-all.sh --only fire,sim   # just these (names below, without "test-")
#   bash manara/tools/run-all.sh --skip poster     # everything except these
#   bash manara/tools/run-all.sh -j 3              # run up to 3 suites at once (default 1; the browser suites time-share the CPU)
#   bash manara/tools/run-all.sh -v                # also print the failing lines of every failed suite
#
# Suites (name : command):
#   fire msg sim qatar-data kit national drone-scene   engines and data (Node / Python, no browser)
#   detect mission control alert robot home pitch poster guide plan report   one Playwright suite per page (control = test-control-room.mjs, robot = test-robot-page.mjs;
#                                                      a suite whose file does not exist yet is listed as MISSING and counts as a failure: it is never silently skipped)
#   ui-lint ui-honesty ui-pages ui-flow             the cross-page QA gate: manara/tools/test-ui.mjs --suite lint|honesty|pages|flow
# Any other manara/tools/test-*.mjs / test_*.py that is not listed is picked up automatically, so a new suite can never be forgotten.
# At the end it prints ONE final table (verdict, suite, time, checks passed, checks failed) and refreshes manara/data/test-counts.js from the logs
# (node manara/tools/update-counts.mjs --from <logs>): the pitch, the report and the poster print their "N checks" numbers from that file, so they cannot go stale.
#   --no-counts   do not touch manara/data/test-counts.js
# Logs: $MANARA_LOGS (default: a fresh temp directory, printed at the end). Exit code 0 only if every suite passed.
set -u
# manara/ is ONE folder and this file is manara/tools/run-all.sh: step into manara/ so it works from any current directory
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2
T=tools
LOGS="${MANARA_LOGS:-$(mktemp -d "${TMPDIR:-/tmp}/manara-tests.XXXXXX")}"
mkdir -p "$LOGS"

ONLY=""; SKIP=""; JOBS=1; VERBOSE=0; FAST=0; COUNTS=1
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="$2"; shift 2 ;;
    --skip) SKIP="$2"; shift 2 ;;
    -j|--jobs) JOBS="$2"; shift 2 ;;
    -v|--verbose) VERBOSE=1; shift ;;
    --fast) FAST=1; shift ;;
    --no-counts) COUNTS=0; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done

# name|command|group   (group: engine = no browser, browser = needs Chromium)
SUITES=(
  "fire|node $T/test-fire.mjs|engine"
  "msg|node $T/test-msg.mjs|engine"
  "qatar-data|node $T/test-qatar-data.mjs|engine"
  "kit|python3 $T/test_kit.py|engine"
  "sim|node $T/test-sim.mjs|engine"
  "national|node $T/test-national.mjs|engine"
  "drone-scene|node $T/test-drone-scene.mjs|engine"
  "ui-lint|node $T/test-ui.mjs --suite lint|engine"
  "detect|node $T/test-detect.mjs|browser"
  "mission|node $T/test-mission.mjs|browser"
  "control|node $T/test-control-room.mjs|browser"
  "control-feeds|node $T/test-control-feeds.mjs|browser"
  "control-panels|node $T/test-control-panels.mjs|browser"
  "control-ai|node $T/test-control-ai.mjs|browser"
  "alert|node $T/test-alert.mjs|browser"
  "robot|node $T/test-robot-page.mjs|browser"
  "home|node $T/test-home.mjs|browser"
  "pitch|node $T/test-pitch.mjs|browser"
  "poster|node $T/test-poster.mjs|browser"
  "chatbot|node $T/test-chatbot.mjs|browser"
  "guide|node $T/test-guide.mjs|browser"
  "plan|node $T/test-plan.mjs|browser"
  "ui-honesty|node $T/test-ui.mjs --suite honesty|browser"
  "ui-pages|node $T/test-ui.mjs --suite pages|browser"
  "ui-flow|node $T/test-ui.mjs --suite flow|browser"
)
[ -f "$T/test-report.mjs" ] && SUITES+=("report|node $T/test-report.mjs|browser")
# pick up suites nobody listed yet (test-<name>.mjs / test_<name>.py), so a new suite can never be forgotten
for f in "$T"/test-*.mjs "$T"/test_*.py; do
  [ -f "$f" ] || continue
  b="$(basename "$f")"; n="${b#test-}"; n="${n#test_}"; n="${n%.mjs}"; n="${n%.py}"
  case "$n" in ui) continue ;; esac
  known=0; for s in "${SUITES[@]}"; do [ "${s%%|*}" = "$n" ] && known=1; done
  # aliases: test_kit.py is "kit", test-control-room.mjs is "control", test-robot-page.mjs is "robot"
  case "$n" in kit|control-room|robot-page) known=1 ;; esac
  if [ $known -eq 0 ]; then
    case "$f" in *.py) SUITES+=("$n|python3 $f|engine") ;; *) SUITES+=("$n|node $f|browser") ;; esac
  fi
done

want() {  # name -> 0 if it should run
  local n="$1"
  if [ -n "$ONLY" ]; then case ",$ONLY," in *",$n,"*) ;; *) return 1 ;; esac; fi
  case ",$SKIP," in *",$n,"*) return 1 ;; esac
  if [ $FAST -eq 1 ]; then case "$n" in poster|home|pitch|alert|detect|mission|control|control-feeds|robot|ui-flow) return 1 ;; esac; fi
  return 0
}

run_one() {  # name command  -> writes $LOGS/name.log and $LOGS/name.status ("exit seconds")
  local n="$1" cmd="$2" s e rc f
  s=$(date +%s)
  # the script file named in the command must exist: a suite that was never written is a MISSING failure, not a silent skip
  f="$(echo "$cmd" | grep -oE "$T/[A-Za-z0-9_.-]+\.(mjs|py)" | head -n 1)"
  if [ -n "$f" ] && [ ! -f "$f" ]; then
    echo "MISSING: $f does not exist (0 passed, 1 failed)" > "$LOGS/$n.log"; echo "98 0" > "$LOGS/$n.status"; return
  fi
  bash -c "$cmd" > "$LOGS/$n.log" 2>&1; rc=$?
  e=$(date +%s)
  echo "$rc $((e - s))" > "$LOGS/$n.status"
}

selected=()
for s in "${SUITES[@]}"; do n="${s%%|*}"; if want "$n"; then selected+=("$s"); fi; done
[ ${#selected[@]} -eq 0 ] && { echo "no suite selected" >&2; exit 2; }

echo "MANARA test run - ${#selected[@]} suites, ${JOBS} at a time; logs in $LOGS"
pids=()
for s in "${selected[@]}"; do
  n="${s%%|*}"; rest="${s#*|}"; cmd="${rest%|*}"
  while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do sleep 1; done
  run_one "$n" "$cmd" &
  pids+=($!)
  # with -j 1 wait here so the verdicts stream in order
  if [ "$JOBS" -le 1 ]; then wait $!; fi
done
wait

summary_of() {  # last "N passed, M failed" line of a log
  local l
  l=$(grep -E "[0-9]+ passed, [0-9]+ failed" "$1" | tail -n 1)
  [ -z "$l" ] && l=$(grep -E "^(OK|Ran [0-9]+ tests|FAILED|MISSING)" "$1" | tail -n 1)
  [ -z "$l" ] && l=$(tail -n 1 "$1")
  echo "$l" | sed 's/^ *//; s/  */ /g' | cut -c1-90
}
counts_of() {  # "passed failed" from the last "N passed, M failed" line (0 0 if none)
  local l p f
  l=$(grep -oE "[0-9]+ passed, [0-9]+ failed" "$1" | tail -n 1)
  p=$(echo "$l" | grep -oE "^[0-9]+"); f=$(echo "$l" | grep -oE "[0-9]+ failed" | grep -oE "^[0-9]+")
  echo "${p:-0} ${f:-0}"
}

fail=0; total_checks=0; total_failed=0; total_secs=0
printf '\n%-6s %-12s %-8s %7s %7s %8s  %s\n' "" "suite" "group" "time" "passed" "failed" "last line"
printf '%s\n' "------ ------------ -------- ------- ------- --------  ----------------------------------------"
for s in "${selected[@]}"; do
  n="${s%%|*}"; grp="${s##*|}"
  read -r rc secs < "$LOGS/$n.status" 2>/dev/null || { rc=99; secs=0; }
  sm="$(summary_of "$LOGS/$n.log")"
  read -r cp cf <<< "$(counts_of "$LOGS/$n.log")"
  total_checks=$((total_checks + cp)); total_failed=$((total_failed + cf)); total_secs=$((total_secs + secs))
  if [ "$rc" = "0" ]; then printf '%-6s %-12s %-8s %6ss %7s %8s  %s\n' "PASS" "$n" "$grp" "$secs" "$cp" "$cf" "$sm"
  else
    fail=$((fail + 1)); printf '%-6s %-12s %-8s %6ss %7s %8s  %s (exit %s)\n' "FAIL" "$n" "$grp" "$secs" "$cp" "$cf" "$sm" "$rc"
  fi
done
printf '%s\n' "------ ------------ -------- ------- ------- --------  ----------------------------------------"
printf '%-6s %-12s %-8s %6ss %7s %8s\n' "TOTAL" "${#selected[@]} suites" "" "$total_secs" "$total_checks" "$total_failed"

# the pitch, the report and the poster print their "N checks" numbers from manara/data/test-counts.js: refresh it from these logs
if [ $COUNTS -eq 1 ] && command -v node >/dev/null 2>&1; then
  node "$T/update-counts.mjs" --from "$LOGS" | sed 's/^/  /'
fi

if [ $fail -gt 0 ]; then
  echo
  for s in "${selected[@]}"; do
    n="${s%%|*}"; read -r rc secs < "$LOGS/$n.status" 2>/dev/null || rc=99
    [ "$rc" = "0" ] && continue
    echo "---- $n: failing lines ($LOGS/$n.log)"
    if [ $VERBOSE -eq 1 ]; then grep -nE "FAIL|Error|error|  - |MISSING" "$LOGS/$n.log" | cut -c1-400 | head -40
    else grep -E "FAIL|^  - |MISSING" "$LOGS/$n.log" | cut -c1-300 | head -8; fi
  done
  echo
  echo "VERDICT: $fail of ${#selected[@]} suites FAILED (${total_checks} checks passed in total). Logs: $LOGS"
  exit 1
fi
echo
echo "VERDICT: all ${#selected[@]} suites passed (${total_checks} checks). Logs: $LOGS"
exit 0
