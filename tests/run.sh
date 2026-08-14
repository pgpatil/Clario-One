#!/bin/sh
# Run the Clario test suite against a local server.
#   sh tests/run.sh            # starts its own server on :8934
#   CLARIO_URL=... sh tests/run.sh
set -e
cd "$(dirname "$0")/.."
PORT=8934
if ! curl -sf -o /dev/null "http://localhost:$PORT/index.html" 2>/dev/null; then
  python3 -m http.server $PORT >/dev/null 2>&1 &
  SRV=$!; trap 'kill $SRV 2>/dev/null' EXIT; sleep 1
fi
export NODE_PATH=${NODE_PATH:-/opt/node22/lib/node_modules}
NODE=$(command -v node || echo /opt/node22/bin/node)
FAIL=0
for t in tests/*.js; do
  echo "───────────────────────────────── $t"
  "$NODE" "$t" || FAIL=1
done
[ $FAIL -eq 0 ] && echo "\nALL SUITES PASS" || echo "\nSUITE FAILURES"
exit $FAIL
