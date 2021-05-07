receivedTestTxt=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat TEST_TXT_FILE)")
if [[ $receivedTestTxt != $(cat EXPECTED_TEST_TXT) ]] ; then
    echo "::error ::Deployment has not been successful"
    exit 1
fi
