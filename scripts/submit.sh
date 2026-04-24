#!/usr/bin/env bash
set -u

ENDPOINT="${ENDPOINT:-https://test.jmadar.workers.dev/update-grade}"
CONTEXT_CODE="${CONTEXT_CODE:-}"
COMMENT="${COMMENT:-testing comment, could be a link to the assignment}"

if [ -z "${CONTEXT_CODE}" ]; then
  read -r -p "Enter contextCode: " CONTEXT_CODE
fi

if [ -z "${CONTEXT_CODE}" ]; then
  echo "contextCode is required."
  exit 1
fi

set +e
PYTEST_OUTPUT="$(pytest -q 2>&1)"
PYTEST_EXIT=$?
set -e

echo "${PYTEST_OUTPUT}"

SUMMARY_LINE="$(printf "%s\n" "${PYTEST_OUTPUT}" | grep -E "(passed|failed|error|errors|skipped|xfailed|xpassed)" | tail -n 1)"

extract_count() {
  local key="$1"
  local line="$2"
  if [[ "${line}" =~ ([0-9]+)[[:space:]]+${key} ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    echo "0"
  fi
}

PASSED="$(extract_count passed "${SUMMARY_LINE}")"
FAILED="$(extract_count failed "${SUMMARY_LINE}")"
ERRORS="$(extract_count errors "${SUMMARY_LINE}")"
if [ "${ERRORS}" = "0" ]; then
  ERRORS="$(extract_count error "${SUMMARY_LINE}")"
fi
SKIPPED="$(extract_count skipped "${SUMMARY_LINE}")"
XFAILED="$(extract_count xfailed "${SUMMARY_LINE}")"
XPASSED="$(extract_count xpassed "${SUMMARY_LINE}")"

TOTAL=$((PASSED + FAILED + ERRORS + SKIPPED + XFAILED + XPASSED))

if [ "${TOTAL}" -eq 0 ]; then
  echo "No tests detected from pytest output; cannot compute grade."
  echo "Pytest exit code: ${PYTEST_EXIT}"
  exit 1
fi

GRADE="$(awk -v p="${PASSED}" -v t="${TOTAL}" 'BEGIN { printf "%.0f", (p/t)*100 }')"

echo "Computed grade: ${GRADE} (passed=${PASSED}, total=${TOTAL})"
echo "Pytest exit code: ${PYTEST_EXIT}"

curl -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d "{\"contextCode\":\"${CONTEXT_CODE}\",\"comment\":\"${COMMENT}\",\"grade\":${GRADE}}"
