# LeanIX Storage Deploy Action

This very opinionated Github Action helps you to deploy static files to Azure Blob storage.

## Usage

```
uses: leanix/storage-deploy-action@master
with:
  container: foo-public        # Name of the storage container to deploy to
  source-directory: dist/      # Directory containing the files to deploy
  environment: prod            # Optional, environment to deploy to, defaults to 'test'
  region: westeurope           # Optional, region to deploy to, default is all regions having a suitable storage account and container
  delete-destination: false    # Optional, whether to delete files in the destination that are no longer existing in the source directory, defaults to 'true'
```

This action requires that you also use the "leanix/secrets-action@master".
The action will check that you only deploy to a container that has the name of your repository in it to prevent you from deploying to the wrong container accidentally.
The action will also fail if it cannot find any container considering the given environment & region parameters.

## Update Action

When you change the action code, use the script *update-dist.sh* to generate a compiled version of index.js containing all dependencies.

## Copyright and license

Copyright 2020 LeanIX GmbH under the [Unlicense license](LICENSE).
