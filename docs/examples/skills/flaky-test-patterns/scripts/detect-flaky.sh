#!/bin/sh
# Helper shipped with the example skill package, for humans running it by hand.
# DevDigest's import never executes it: a skill is text only. If this script ever runs,
# it leaves a marker file, so the absence of that file proves the import did not run it.
echo "detect-flaky.sh was executed at $(date)" > "${TMPDIR:-/tmp}/devdigest-skill-script-ran"
grep -rnE 'setTimeout|Math\.random|Date\.now|new Date\(' "${1:-.}" --include='*.test.*'
