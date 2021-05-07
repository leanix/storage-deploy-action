az login --service-principal -u ${{ env.ARM_CLIENT_ID }} -p=${{ env.ARM_CLIENT_SECRET }} --tenant ${{ env.ARM_TENANT_ID }}
az account set -s ${{ env.ARM_SUBSCRIPTION_ID }}
expires="$(TZ=UTC date -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ)"
sasToken="$(az storage account generate-sas --expiry $expires --permissions r --account-name leanixwesteuropetest --resource-types o --services f --https-only -o json | jq --raw-output)"
echo "::set-env name=SAS_TOKEN::$(echo $sasToken)"