const core = require('@actions/core');
const exec = require('@actions/exec');
const noopStream = require('stream-blackhole')();
const moment = require('moment');
const git = require('simple-git/promise');
const fs = require('fs');
const path = require('path');

// Version all files that are not cached: https://github.com/leanix/cdn-proxy/blob/master/pkg/cdnproxy/bootstrapHttpHandler.go#L86
const filesToVersion = new Set(['index.html', 'main.js', 'polyfills.js', 'polyfills-es5.js', 'styles.css', 'scripts.js', 'logout.html']);

(async () => {
    try {

        // Define some parameters
        const container = core.getInput('container', {required: true});
        const sourceDirectory = core.getInput('source-directory', {required: true});
        const region = core.getInput('region') ? core.getInput('region') : '';
        const deleteDestination = (core.getInput('delete-destination') == 'true') ? true : false;
        const environment = core.getInput('environment') ? core.getInput('environment') : 'test';
        const versionDeployment = core.getInput('version-deployment') === 'true' ? true : false;
        const branchName = core.getInput('branch-name') ? core.getInput('branch-name') : '';
        const appName = core.getInput('app-name') ? core.getInput('app-name') : '';
        const onlyShowErrorsExecOptions = {outStream: noopStream, errStream: process.stderr};
        const availableRegions = [
            { name:'westeurope', short:'eu' },
            { name:'eastus', short:'us' },
            { name:'canadacentral', short:'ca' },
            { name:'australiaeast', short:'au' },
            { name:'germanywestcentral', short:'de' }
        ];

        // Check environment
        if (!['test', 'prod'].includes(environment)) {
            throw new Error(`Unknown environment ${environment}, must be one of: test, prod`);
        }

        // Check region
        const checkRegions = availableRegions.map(availableRegion => availableRegion.name);
        if (region && !checkRegions.includes(region)) {
            const availableRegionsString = checkRegions.join(', ');
            throw new Error(`Unknown region ${region}, must be one of: ${availableRegionsString}`);
        }

        const repositoryShortName = process.env.GITHUB_REPOSITORY.replace(/leanix(?:\/|-)/gi, '');
        if (container.includes(repositoryShortName) === false) {
            throw new Error(`You may not deploy to a container that does not correspond to your repository name (${container} does not contain ${repositoryShortName})`);
        }

        await azureInstallAndLogin(onlyShowErrorsExecOptions);

        let deployedAnything = false;
        for (currentRegion of availableRegions) {
            if (region && (region != currentRegion.name)) {
                core.info(`Not deploying to region ${currentRegion.name}...`);
                continue;
            }
            const storageAccount = getStorageAccount(currentRegion, environment);
            const canDeploy = await isExistingStorageAccountAndContainer(storageAccount, container);
            if (canDeploy) {
                const sasToken = await getSasToken(storageAccount);
                await deployToContainerOfStorageAccount(sourceDirectory, storageAccount, container, sasToken, deleteDestination);
                deployedAnything = true;
                core.info(`Finished deploying to region ${currentRegion.name}.`);
                if (versionDeployment) {
                    const version = await versionBranchOfApp(branchName, appName);
                    await backupDeployedVersion(version, sasToken, sourceDirectory, storageAccount, container);
                    core.setOutput('version', version);
                }
            }
        }

        if (!deployedAnything) {
            throw new Error('Cound not find any container to deploy to!');
        }
    } catch (e) {
        core.setFailed(e.message);
    }
})();

async function azureInstallAndLogin(onlyShowErrorsExecOptions) {
    await exec.exec('wget', ['-q', '-O', 'azcopy.tar.gz', 'https://aka.ms/downloadazcopy-v10-linux'], onlyShowErrorsExecOptions)
    await exec.exec('tar', ['--strip-components=1', '-xzf', 'azcopy.tar.gz'], onlyShowErrorsExecOptions)
    core.exportVariable('AZCOPY_SPA_CLIENT_SECRET', process.env.ARM_CLIENT_SECRET)
    await exec.exec('./azcopy', [
        'login', '--service-principal',
        '--application-id', process.env.ARM_CLIENT_ID,
        '--tenant-id', process.env.ARM_TENANT_ID
    ], onlyShowErrorsExecOptions);
    await exec.exec('az', [
        'login', '--service-principal',
        '--username', process.env.ARM_CLIENT_ID,
        '--password', process.env.ARM_CLIENT_SECRET,
        '--tenant', process.env.ARM_TENANT_ID
    ], onlyShowErrorsExecOptions);
    await exec.exec('az', [
        'account', 'set',
        '-s', process.env.ARM_SUBSCRIPTION_ID
    ], onlyShowErrorsExecOptions);
}

function getStorageAccount(region, environment) {
    let storageAccount = `leanix${region.name}${environment}`;
    if (storageAccount.length > 24) {
        storageAccount = `leanix${region.short}${environment}`;
    }
    return storageAccount;
}

async function isExistingStorageAccountAndContainer(storageAccount, container) {
    const exitCode = await exec.exec('az', [
        'storage', 'account', 'show',
        '--name', storageAccount
    ], {ignoreReturnCode: true, silent: true});
    if (exitCode > 0) {
        core.info(`Storage Account ${storageAccount} does not exist.`);
        return false;
    }
    let response = '';
    await exec.exec('az', [
        'storage', 'container', 'exists',
        '--account-name', storageAccount,
        '--name', container
    ], {outStream: noopStream, errStream: noopStream, listeners: {stdout: data => response += data}});
    let result = JSON.parse(response);
    if (!result.exists) {
        core.info(`Container ${container} on Storage Account ${storageAccount} does not exist.`);
        return false;
    }
    return true;
}

async function getSasToken(storageAccount) {
    const expires = moment().utc().add(2, 'hours').format();
    let sasResponse = '';
    await exec.exec('az', [
        'storage', 'account', 'generate-sas',
        '--expiry', expires,
        '--permissions', 'racw',
        '--account-name', storageAccount,
        '--resource-types', 'o',
        '--services', 'f',
        '--https-only',
        '-o', 'json'
    ], {outStream: noopStream, errStream: noopStream, listeners: {stdout: data => sasResponse += data}});
    const sasToken = JSON.parse(sasResponse);
    return sasToken;
}

async function deployToContainerOfStorageAccount(sourceDirectory, storageAccount, container, sasToken, deleteDestination) {
    core.info(`Now deploying to ${storageAccount}!`);
    if (sourceDirectory.length <= 0) {
        throw new Error('Please specify a source directory when using this action for deployments.');
    }
    // Sync directory to Azure Blob Storage
    core.info(`Now deploying to Azure Blob Storage ${storageAccount}.`);
    await exec.exec('./azcopy', [
        'sync', sourceDirectory + '/',
        `https://${storageAccount}.blob.core.windows.net/${container}/`,
        '--recursive',
        '--delete-destination', deleteDestination ? 'true' : 'false'
    ]);
    // Sync directory to Azure File Storage
    core.info(`Now deploying to Azure File Storage ${storageAccount}.`);
    await exec.exec('./azcopy', [
        'copy', sourceDirectory + '/*',
        `https://${storageAccount}.file.core.windows.net/k8s-cdn-proxy/${container}?${sasToken}`,
        '--recursive'
    ]);
}

async function versionBranchOfApp(branchName, appName) {
    if (branchName.length <= 0) {
        throw new Error('Please specify a branch name when using this action with versioning enabled.');
    }

    const normalizedBranchName = branchName.replace(/\W+/g, '-');
    const versionTagPrefix = 'VERSION-' + (appName !== '' ? appName.toUpperCase() + '-' : '') + normalizedBranchName.toUpperCase() + '-';
    const currentCommit = process.env.GITHUB_SHA;
    await git.fetch(['--tags']); // Fetch all tags
    const tagsOfCurrentCommitString = await git.tag(
        [
            '-l', versionTagPrefix + '*',
            '--points-at', currentCommit,
            '--sort', '-v:refname'
        ]
    );

    let releaseVersion = 1;
    if (tagsOfCurrentCommitString.length > 0) {
        // commit is already tagged, so use that tag as the release version 
        const tagsOfCurrentCommit = tagsOfCurrentCommitString.split('\n');
        releaseVersion = parseInt(tagsOfCurrentCommit[0].replace(versionTagPrefix, ''));
        core.info(`Last commit is already tagged with version ${releaseVersion}`);
    } else {
        const allVersionTagsString = await git.tag(
            [
                '-l', versionTagPrefix + '*',
                '--sort', '-v:refname'
            ]
        );

        if (allVersionTagsString.length > 0) {
            // as commit is not yet tagged use the last version bumped up as the release version
            const allVersionTags = allVersionTagsString.split('\n');
            releaseVersion = parseInt(allVersionTags[0].replace(versionTagPrefix, '')) + 1;
        } 
        core.info(`Next version on branch ${branchName} is ${releaseVersion}`);
        const releaseVersionTag = `${versionTagPrefix}${releaseVersion}`;
        await git.tag([releaseVersionTag, process.env.GITHUB_REF]);
        await git.pushTags();
    }

    return releaseVersion;
}

async function backupDeployedVersion(version, sasToken, sourceDirectory, storageAccount, container) {
    const directory = await fs.promises.opendir(sourceDirectory);
    for await (const entry of directory) {
        if (entry.isFile() && filesToVersion.has(entry.name)) {
            const filename = path.parse(entry.name).name;
            const extension = path.parse(entry.name).ext;
            const versionedFilename = `${filename}_${version}${extension}`;
            core.info(`Creating versioned file ${versionedFilename} for ${entry.name} in Azure Blob storage.`);
            await exec.exec('./azcopy', [
                'copy', `${sourceDirectory}/${entry.name}`,
                `https://${storageAccount}.blob.core.windows.net/${container}/${versionedFilename}`
            ]);
            try {
                core.info(`Creating versioned file ${versionedFilename} for ${entry.name} in Azure File storage.`);
                await exec.exec('./azcopy', [
                    'copy', `${sourceDirectory}/${entry.name}`,
                    `https://${storageAccount}.file.core.windows.net/k8s-cdn-proxy/${container}/${versionedFilename}?${sasToken}`
                ]);
            } catch (e) {
                core.info('Backup to file share failed');
                return;
            }
            
        }
    }
    core.info(`Finished creation of backup ${version} in ${storageAccount}.blob.core.windows.net/${container} and ${storageAccount}.file.core.windows.net/k8s-cdn-proxy/${container}.`);
}
