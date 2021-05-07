echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/index_$VERSION.html" > VERSIONED_INDEX_HTML_BLOB
echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/main_$VERSION.js" > VERSIONED_MAIN_JS_BLOB
echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/polyfills_$VERSION.js" > VERSIONED_POLYFILLS_JS_BLOB
echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/polyfills-es5_$VERSION.js" > VERSIONED_POLYFILLS_ES5_JS_BLOB
echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/styles_$VERSION.css" > VERSIONED_STYLES_CSS_BLOB
echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/scripts_$VERSION.js" > VERSIONED_SCRIPTS_JS_BLOB
echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/logout_$VERSION.html" > VERSIONED_LOGOUT_HTML_BLOB
receivedVersionedIndexHtml=$(curl -s $(cat VERSIONED_INDEX_HTML_BLOB))
receivedVersionedMainJs=$(curl -s $(cat VERSIONED_MAIN_JS_BLOB))
receivedVersionedPolyfillsJs=$(curl -s $(cat VERSIONED_POLYFILLS_JS_BLOB))
receivedVersionedPolyfillsEs5Js=$(curl -s $(cat VERSIONED_POLYFILLS_ES5_JS_BLOB))
receivedVersionedStylesCss=$(curl -s $(cat VERSIONED_STYLES_CSS_BLOB))
receivedVersionedScriptsJs=$(curl -s $(cat VERSIONED_SCRIPTS_JS_BLOB))
receivedVersionedLogoutHtml=$(curl -s $(cat VERSIONED_LOGOUT_HTML_BLOB))
if [[ $receivedVersionedIndexHtml != $(cat EXPECTED_STABLE_INDEX_HTML) || $receivedVersionedMainJs != $(cat EXPECTED_STABLE_MAIN_JS) || $receivedVersionedPolyfillsJs != $(cat EXPECTED_STABLE_POLYFILLS_JS) || $receivedVersionedPolyfillsEs5Js != $(cat EXPECTED_STABLE_POLYFILLS_ES5_JS) || $receivedVersionedStylesCss != $(cat EXPECTED_STABLE_STYLES_CSS) || $receivedVersionedScriptsJs != $(cat EXPECTED_STABLE_SCRIPTS_JS) || $receivedVersionedLogoutHtml != $(cat EXPECTED_STABLE_LOGOUT_HTML) ]] ; then
    echo "::error ::Versioned Deployment has not been successful"
    exit 1
fi