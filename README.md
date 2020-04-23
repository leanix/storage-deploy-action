# LeanIX Storage Deploy Action

This very opinionated Github Action helps you to deploy static files to Azure Blob storage.

## Usage

```
uses: leanix/storage-deploy-action@master
with:
  container: foo-public        # Name of the storage container to deploy to
  source-directory: dist/      # Directory containing the files to deploy
  environment: prod            # Optional, environment to deploy to, defaults to 'test'
  region: westeurope           # Optional, Region to deploy to, default is all regions
```

This action requires that you also use the "leanix/secrets-action@master".

## Update Action

When you change the action code, use the script *update-dist.sh* to generate a compiled version of index.js containing all dependencies.

## Copyright and license

Copyright 2020 LeanIX GmbH under the [Unlicense license](LICENSE).
