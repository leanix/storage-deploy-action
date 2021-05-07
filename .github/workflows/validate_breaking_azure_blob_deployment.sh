receivedIndexHtml=$(curl -s $(cat INDEX_HTML_BLOB))
receivedMainJs=$(curl -s $(cat MAIN_JS_BLOB))
receivedPolyfillsJs=$(curl -s $(cat POLYFILLS_JS_BLOB))
receivedPolyfillsEs5Js=$(curl -s $(cat POLYFILLS_ES5_JS_BLOB))
receivedStylesCss=$(curl -s $(cat STYLES_CSS_BLOB))
receivedScriptsJs=$(curl -s $(cat SCRIPTS_JS_BLOB))
receivedLogoutHtml=$(curl -s $(cat LOGOUT_HTML_BLOB))
if [[ $receivedIndexHtml != $(cat EXPECTED_BROKEN_INDEX_HTML) || $receivedMainJs != $(cat EXPECTED_BROKEN_MAIN_JS) || $receivedPolyfillsJs != $(cat EXPECTED_BROKEN_POLYFILLS_JS) || $receivedPolyfillsEs5Js != $(cat EXPECTED_BROKEN_POLYFILLS_ES5_JS) || $receivedStylesCss != $(cat EXPECTED_BROKEN_STYLES_CSS) || $receivedScriptsJs != $(cat EXPECTED_BROKEN_SCRIPTS_JS) || $receivedLogoutHtml != $(cat EXPECTED_BROKEN_LOGOUT_HTML) ]] ; then
    echo "::error ::Deployment has not been successful"
    exit 1
fi
