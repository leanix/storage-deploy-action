echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/test.txt" > TEST_TXT_BLOB
echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/index.html" > INDEX_HTML_BLOB
echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/main.js" > MAIN_JS_BLOB
echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/polyfills.js" > POLYFILLS_JS_BLOB
echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/polyfills-es5.js" > POLYFILLS_ES5_JS_BLOB
echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/styles.css" > STYLES_CSS_BLOB
echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/scripts.js" > SCRIPTS_JS_BLOB
echo "https://leanixwesteuropetest.blob.core.windows.net/storage-deploy-action-public/logout.html" > LOGOUT_HTML_BLOB
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/test.txt?$SAS_TOKEN" > TEST_TXT_FILE
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/index.html?$SAS_TOKEN" > INDEX_HTML_FILE
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/main.js?$SAS_TOKEN" > MAIN_JS_FILE
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/polyfills.js?$SAS_TOKEN" > POLYFILLS_JS_FILE
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/polyfills-es5.js?$SAS_TOKEN" > POLYFILLS_ES5_JS_FILE
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/styles.css?$SAS_TOKEN" > STYLES_CSS_FILE
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/scripts.js?$SAS_TOKEN" > SCRIPTS_JS_FILE
echo "https://leanixwesteuropetest.file.core.windows.net/k8s-cdn-proxy/storage-deploy-action-public/logout.html?$SAS_TOKEN" > LOGOUT_HTML_FILE
echo "hello world" > EXPECTED_TEST_TXT
echo "<h1>Hello index.html</h1>" > EXPECTED_STABLE_INDEX_HTML
echo "console.log('Hello main.js');" > EXPECTED_STABLE_MAIN_JS
echo "console.log('Hello polyfills.js');" > EXPECTED_STABLE_POLYFILLS_JS
echo "console.log('Hello polyfills-es5.js');" > EXPECTED_STABLE_POLYFILLS_ES5_JS
echo ".helloStyles {}" > EXPECTED_STABLE_STYLES_CSS
echo "console.log('Hello scripts.js');" > EXPECTED_STABLE_SCRIPTS_JS
echo "<h1>Hello logout.html</h1>" > EXPECTED_STABLE_LOGOUT_HTML
echo "<h1>Breaking index.html change</h1>" > EXPECTED_BROKEN_INDEX_HTML
echo "console.log('Breaking main.js change');" > EXPECTED_BROKEN_MAIN_JS
echo "console.log('Breaking polyfills.js change');" > EXPECTED_BROKEN_POLYFILLS_JS
echo "console.log('Breaking polyfills-es5.js change');" > EXPECTED_BROKEN_POLYFILLS_ES5_JS
echo ".breakingStylesChange {}" > EXPECTED_BROKEN_STYLES_CSS
echo "console.log('Breaking scripts.js change');" > EXPECTED_BROKEN_SCRIPTS_JS
echo "<h1>Breaking logout.html change</h1>" > EXPECTED_BROKEN_LOGOUT_HTML
