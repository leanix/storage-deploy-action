receivedIndexHtml=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat INDEX_HTML_FILE)")
receivedMainJs=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat MAIN_JS_FILE)")
receivedPolyfillsJs=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat POLYFILLS_JS_FILE)")
receivedPolyfillsEs5Js=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat POLYFILLS_ES5_JS_FILE)")
receivedStylesCss=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat STYLES_CSS_FILE)")
receivedScriptsJs=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat SCRIPTS_JS_FILE)")
receivedLogoutHtml=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat LOGOUT_HTML_FILE)")
if [[ $receivedIndexHtml != $(cat EXPECTED_STABLE_INDEX_HTML) || $receivedMainJs != $(cat EXPECTED_STABLE_MAIN_JS) || $receivedPolyfillsJs != $(cat EXPECTED_STABLE_POLYFILLS_JS) || $receivedPolyfillsEs5Js != $(cat EXPECTED_STABLE_POLYFILLS_ES5_JS) || $receivedStylesCss != $(cat EXPECTED_STABLE_STYLES_CSS) || $receivedScriptsJs != $(cat EXPECTED_STABLE_SCRIPTS_JS) || $receivedLogoutHtml != $(cat EXPECTED_STABLE_LOGOUT_HTML) ]] ; then
    echo "::error ::Rollback has not been successful"
    exit 1
fi 
