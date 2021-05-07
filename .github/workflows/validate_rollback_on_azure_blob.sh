receivedIndexHtml=$(curl -s $(cat INDEX_HTML_BLOB))
receivedMainJs=$(curl -s $(cat MAIN_JS_BLOB))
receivedPolyfillsJs=$(curl -s $(cat POLYFILLS_JS_BLOB))
receivedPolyfillsEs5Js=$(curl -s $(cat POLYFILLS_ES5_JS_BLOB))
receivedStylesCss=$(curl -s $(cat STYLES_CSS_BLOB))
receivedScriptsJs=$(curl -s $(cat SCRIPTS_JS_BLOB))
receivedLogoutHtml=$(curl -s $(cat LOGOUT_HTML_BLOB))
if [[ $receivedIndexHtml != $(cat EXPECTED_STABLE_INDEX_HTML) || $receivedMainJs != $(cat EXPECTED_STABLE_MAIN_JS) || $receivedPolyfillsJs != $(cat EXPECTED_STABLE_POLYFILLS_JS) || $receivedPolyfillsEs5Js != $(cat EXPECTED_STABLE_POLYFILLS_ES5_JS) || $receivedStylesCss != $(cat EXPECTED_STABLE_STYLES_CSS) || $receivedScriptsJs != $(cat EXPECTED_STABLE_SCRIPTS_JS) || $receivedLogoutHtml != $(cat EXPECTED_STABLE_LOGOUT_HTML) ]] ; then
    echo "::error ::Rollback has not been successful"
    exit 1
fi
