echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/index_$(cat VERSION).html?$SAS_TOKEN" > VERSIONED_INDEX_HTML_FILE
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/main_$(cat VERSION).js?$SAS_TOKEN" > VERSIONED_MAIN_JS_FILE
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/polyfills_$(cat VERSION).js?$SAS_TOKEN" > VERSIONED_POLYFILLS_JS_FILE
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/polyfills-es5_$(cat VERSION).js?$SAS_TOKEN" > VERSIONED_POLYFILLS_ES5_JS_FILE
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/styles_$(cat VERSION).css?$SAS_TOKEN" > VERSIONED_STYLES_CSS_FILE
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/scripts_$(cat VERSION).js?$SAS_TOKEN" > VERSIONED_SCRIPTS_JS_FILE
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/logout_$(cat VERSION).html?$SAS_TOKEN" > VERSIONED_LOGOUT_HTML_FILE 
receivedVersionedIndexHtml=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat VERSIONED_INDEX_HTML_FILE)")
receivedVersionedMainJs=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat VERSIONED_MAIN_JS_FILE)")
receivedVersionedPolyfillsJs=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat VERSIONED_POLYFILLS_JS_FILE)")
receivedVersionedPolyfillsEs5Js=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat VERSIONED_POLYFILLS_ES5_JS_FILE)")
receivedVersionedStylesCss=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat VERSIONED_STYLES_CSS_FILE)")
receivedVersionedScriptsJs=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat VERSIONED_SCRIPTS_JS_FILE)")
receivedVersionedLogoutHtml=$(curl -X GET -H "x-ms-date: $(date -u)" "$(cat VERSIONED_LOGOUT_HTML_FILE)")
if [[ $receivedVersionedIndexHtml != $(cat EXPECTED_STABLE_INDEX_HTML) || $receivedVersionedMainJs != $(cat EXPECTED_STABLE_MAIN_JS) || $receivedVersionedPolyfillsJs != $(cat EXPECTED_STABLE_POLYFILLS_JS) || $receivedVersionedPolyfillsEs5Js != $(cat EXPECTED_STABLE_POLYFILLS_ES5_JS) || $receivedVersionedStylesCss != $(cat EXPECTED_STABLE_STYLES_CSS) || $receivedVersionedScriptsJs != $(cat EXPECTED_STABLE_SCRIPTS_JS) || $receivedVersionedLogoutHtml != $(cat EXPECTED_STABLE_LOGOUT_HTML) ]] ; then
    echo "::error ::Deployment has not been successful"
    exit 1
fi
