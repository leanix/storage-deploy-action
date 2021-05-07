# LeanIX Storage Deploy Action

This very opinionated Github Action helps you to deploy static files to Azure Blob Storage and Azure File Storage.

## Usage

```
uses: leanix/storage-deploy-action@master
with:
  container: foo-public        # Name of the storage container (Blob) or target folder (Files) to deploy to
  source-directory: dist/      # Directory containing the files to deploy
  environment: prod            # Optional, environment to deploy to, defaults to 'test'
  region: westeurope           # Optional, region to deploy to, default is all regions having a suitable storage account and container
  delete-destination: false    # Optional, whether to delete files in the destination that are no longer existing in the source directory, defaults to 'true'
  version-deployment: false    # Optional, whether to create versioned backup of all uncached files
  app-name: ''                 # Optional, name of the app that for which a new version should be deployed. Is used for creating a git tag for the version
  in-rollback-mode: false      # Optional, activate rollback mode. No files will be deployed in rollback mode
  rollback-version:            # Optional, define a rollback version. Required when in rollback mode to identify the version to roll back to
```

This action requires that you also use the "leanix/secrets-action@master".
The action will check that you only deploy to a container (Blob) / folder (Files) that has the name of your repository in it to prevent you from deploying to the wrong container/folder accidentally.
The action will also fail if it cannot find any container considering the given environment & region parameters.

## Update Action

When you change the action code, use the script *update-dist.sh* to generate a compiled version of index.js containing all dependencies.

## Details
The action can be used to version deployments and roll back an app to a specific previously deployed version.
When versioning a deployment, a git tag is created to identify the deployed version within a code repository. The git tag follows the pattern `VERSION-(optional: APP_NAME)-BRANCH-VERSION_NUMBER`.
When deploying with versioning activated, the action will search through all git tags for previous tags following this pattern. It will then use the tag with the highest version number and create a new tag with an incremented version.
The incremented version number is then also used to create a backup of all uncached, existing files deployed as part of the app (e.g. `index_VERSION.html`).
This way a rollback is possible by entering the rollback mode and passing a version number to rollback to. All versioned, existing and uncached files will then be rolled back to the specified version.
Note: If the app contains assets that are not fingerprinted, clients might get inconsistent states after rollback. However the risk might be worth it, if there is a critical error in production.

## Copyright and license

Copyright 2020 LeanIX GmbH under the [Unlicense license](LICENSE).
