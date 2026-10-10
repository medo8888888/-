#!/usr/bin/env bash
# MANARA («منارة») - run every test suite and print ONE verdict line per suite.
#
#   bash tools/manara/run-all.sh                   # everything (about 20 minutes: the browser suites are slow)
#   bash tools/manara/run-all.sh --fast            # skip the slowest browser suites (poster, home, pitch, alert, detect, mission)
#   bash tools/manara/run-all.sh --only fire,sim   # just these (names below, without "test-")
#   bash tools/manara/run-all.sh --skip poster     # everything except these
#   bash tools/manara/run-all.sh -j 3              # run up to 3 suites at once (default 1; the browser suites time-share the CPU)
#   bash tools/manara/run-all.sh -v                # also print the failing lines of every failed suite
#
# Suites (name : command):
#   fire msg sim qatar-data kit        engines and data (Node / Python, no browser)
#   detect mission alert home pitch poster report   one Playwright suite per page (report only if tools/manara/test-report.mjs exists)
#   ui-lint ui-honesty ui-pages ui-flow             the cross-page QA gate: tools/manara/test-ui.mjs --suite lint|honesty|pages|flow
# Any other tools/manara/test-*.mjs / test_*.py that is not listed is picked up automatically, so a new suite can never be forgotten.
# Logs: $MANARA_LOGS (default: a fresh temp directory, printed at the end). Exit code 0 only if every suite passed.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 2
T=tools/manara
LOGS="${MANARA_LOGS:-$(mktemp -d "${TMPDIR:-/tmp}/manara-tests.XXXXXX")}"
mkdir -p "$LOGS"

ONLY=""; SKIP=""; JOBS=1; VERBOSE=0; FAST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="$2"; shift 2 ;;
    --skip) SKIP="$2"; shift 2 ;;
    -j|--jobs) JOBS="$2"; shift 2 ;;
    -v|--verbose) VERBOSE=1; shift ;;
    --fast) FAST=1; shift ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
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
  "ui-lint|node $T/test-ui.mjs --suite lint|engine"
  "detect|node $T/test-detect.mjs|browser"
  "mission|node $T/test-mission.mjs|browser"
  "alert|node $T/test-alert.mjs|browser"
  "home|node $T/test-home.mjs|browser"
  "pitch|node $T/test-pitch.mjs|browser"
  "poster|node $T/test-poster.mjs|browser"
  "ui-honesty|node $T/test-ui.mjs --suite honesty|browser"
  "ui-pages|node $T/test-ui.mjs --suite pages|browser"
  "ui-flow|node $T/test-ui.mjs --suite flow|browser"
)
[ -f "$T/test-report.mjs" ] && SUITES+=("report|node $T/test-report.mjs|browser")
# pick up suites nobody listed yet
for f in "$T"/test-*.mjs "$T"/test_*.py; do
  [ -f "$f" ] || continue
  b="$(basename "$f")"; n="${b#test-}"; n="${n#test_}"; n="${n%.mjs}"; n="${n%.py}"
  case "$n" in ui) continue ;; esac
  known=0; for s in "${SUITES[@]}"; do [ "${s%%|*}" = "$n" ] && known=1; done
  # test_kit.py is "kit"
  [ "$n" = "kit" ] && known=1
  if [ $known -eq 0 ]; then
    case "$f" in *.py) SUITES+=("$n|python3 $f|engine") ;; *) SUITES+=("$n|node $f|browser") ;; esac
  fi
done

want() {  # name -> 0 if it should run
  local n="$1"
  if [ -n "$ONLY" ]; then case ",$ONLY," in *",$n,"*) ;; *) return 1 ;; esac; fi
  case ",$SKIP," in *",$n,"*) return 1 ;; esac
  if [ $FAST -eq 1 ]; then case "$n" in poster|home|pitch|alert|detect|mission|ui-flow) return 1 ;; esac; fi
  return 0
}

run_one() {  # name command  -> writes $LOGS/name.log and $LOGS/name.status ("exit seconds")
  local n="$1" cmd="$2" s e rc
  s=$(date +%s)
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
  [ -z "$l" ] && l=$(grep -E "^(OK|Ran [0-9]+ tests|FAILED)" "$1" | tail -n 1)
  [ -z "$l" ] && l=$(tail -n 1 "$1")
  echo "$l" | sed 's/^ *//; s/  */ /g' | cut -c1-90
}

fail=0; total_checks=0
printf '\n%-6s %-12s %6s  %s\n' "" "suite" "time" "result"
for s in "${selected[@]}"; do
  n="${s%%|*}"
  read -r rc secs < "$LOGS/$n.status" 2>/dev/null || { rc=99; secs=0; }
  sm="$(summary_of "$LOGS/$n.log")"
  p=$(echo "$sm" | grep -oE "^[0-9]+" | head -n 1); [ -n "${p:-}" ] && total_checks=$((total_checks + p))
  if [ "$rc" = "0" ]; then printf '%-6s %-12s %5ss  %s\n' "PASS" "$n" "$secs" "$sm"
  else
    fail=$((fail + 1)); printf '%-6s %-12s %5ss  %s (exit %s)\n' "FAIL" "$n" "$secs" "$sm" "$rc"
  fi
done

if [ $fail -gt 0 ]; then
  echo
  for s in "${selected[@]}"; do
    n="${s%%|*}"; read -r rc secs < "$LOGS/$n.status" 2>/dev/null || rc=99
    [ "$rc" = "0" ] && continue
    echo "---- $n: failing lines ($LOGS/$n.log)"
    if [ $VERBOSE -eq 1 ]; then grep -nE "FAIL|Error|error|  - " "$LOGS/$n.log" | cut -c1-400 | head -40
    else grep -E "FAIL|^  - " "$LOGS/$n.log" | cut -c1-300 | head -8; fi
  done
  echo
  echo "VERDICT: $fail of ${#selected[@]} suites FAILED (${total_checks} checks passed in total). Logs: $LOGS"
  exit 1
fi
echo
echo "VERDICT: all ${#selected[@]} suites passed (${total_checks} checks). Logs: $LOGS"
exit 0
