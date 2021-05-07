receivedTestTxt=$(curl -s $(cat TEST_TXT_BLOB))
if [[ $receivedTestTxt != $(cat EXPECTED_TEST_TXT) ]] ; then
    echo "::error ::Deployment has not been successful"
    exit 1
fi
