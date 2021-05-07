az login --service-principal -u $ARM_CLIENT_ID -p=$ARM_CLIENT_SECRET --tenant $ARM_TENANT_ID 
az account set -s $ARM_SUBSCRIPTION_ID
expires="$(TZ=UTC date -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ)"
sasToken="$(az storage account generate-sas --expiry $expires --permissions r --account-name leanixwesteuropetest --resource-types o --services f --https-only -o json | jq --raw-output)"
echo "SAS_TOKEN=$(echo $sasToken)" >> $GITHUB_ENV