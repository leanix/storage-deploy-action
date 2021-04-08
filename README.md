# LeanIX Storage Deploy Action

This very opinionated Github Action helps you to deploy static files to Azure Blob storage.

## Usage

```
uses: leanix/storage-deploy-action@master
with:
  branch: develop                   # Name of the branch that should be deployed
  container: foo-public             # Name of the storage container to deploy to
  source-directory: dist/           # Directory containing the files to deploy
  environment: prod                 # Optional, environment to deploy to, defaults to 'test'
  region: westeurope                # Optional, region to deploy to, default is all regions having a suitable storage account and container
  microfrontend: self-configuration # Optional, if a microfrontend is deployed using this action, passing the microfrontend name is a must for distinct version tags within the monorepo
  version-deployment: true          # Optional, whether to store a backup of the deployed version
  rollback-mode: false              # Whether to enter rollback mode (nothing will be deployed)
  rollback-version: 10              # Restore the index.html or main.js backed up under this version number, if they exist
```

This action requires that you also use the "leanix/secrets-action@master".
The action will check that you only deploy to a container that has the name of your repository in it to prevent you from deploying to the wrong container accidentally.
The action will also fail if it cannot find any container considering the given environment & region parameters.

## Details
The action can use git tags to manage a version, if `version-deployment` is set to true. It uses the tag to backup a deployed `index.html` and `main.js` under the version number in the blob storage / file share.
It will search for tags "VERSION-(optional: MICROFRONTEND)-BRANCH-NUMBER" on the current branch, where BRANCH is the name of the branch,
MICROFRONTEND is the name of the microfrontend if a microfrontend is deployed with this action, and NUMBER is a version. If it does not
find a version, it will start at 1. If it finds tags matching the version naming pattern, it will use the highest version to determine the
next version. It only adds a new version tag, if the highest version is not already pointing to the last change that is now being deployed.

```
$ git tags
VERSION-MASTER-1
VERSION-MASTER-SELF-CONFIGURATION-1
VERSION-DEVELOP-REPORT-1
```

## Update Action

When you change the action code, use the script *update-dist.sh* to generate a compiled version of index.js containing all dependencies.

## Copyright and license

Copyright 2020 LeanIX GmbH under the [Unlicense license](LICENSE).
