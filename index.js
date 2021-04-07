const fs = require('fs');
const path = require('path');
const core = require('@actions/core');
const exec = require('@actions/exec');
const noopStream = require('stream-blackhole')();
const git = require('simple-git/promise')();
const moment = require('moment');

const filesToVersion = new Set(['index.html', 'main.js']);

(async () => {
    try {
        const container = core.getInput('container', {required: true});
        const sourceDirectory = core.getInput('source-directory', {required: true});
        const region = core.getInput('region') ? core.getInput('region') : '';
        const environment = core.getInput('environment') ? core.getInput('environment') : 'test';
        const branch = core.getInput('branch') ? core.getInput('branch') : '';
        const microfrontend = core.getInput('microfrontend') ? core.getInput('microfrontend') : '';
        const versionDeployment = core.getInput('version-deployment') == 'true' ? true : false;
        const inRollbackMode = (core.getInput('rollback-mode') === 'true') ? true : false;
        const rollbackVersion = core.getInput('rollback-version') ? core.getInput('rollback-version') : '';
        const onlyShowErrorsExecOptions = {outStream: noopStream, errStream: process.stderr};
        const availableRegions = [
            {name:'westeurope',short:'eu'},
            {name:'eastus',short:'us'},
            {name:'canadacentral',short:'ca'},
            {name:'australiaeast',short:'au'},
            {name:'germanywestcentral',short:'de'}
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

        // Install & login to Azure / Azure Copy
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

        // Rollback or deploy
        if (inRollbackMode) {
            if (rollbackVersion.length <= 0) {
                throw new Error('No version specified for rollback!');
            }
            for (currentRegion of availableRegions) {
                if (region && (region !== currentRegion.name)) {
                    core.info(`Not rolling back region ${currentRegion.name}...`);
                    continue;
                }
                const storageAccount = getStorageAccount(environment, currentRegion);
                const sasToken = await getSasToken(storageAccount);
                await rollbackStorageAccount(rollbackVersion, sasToken, storageAccount, container);
            }
        } else { // deploy a new version
            let deployedAnything = false;
            for (currentRegion of availableRegions) {
                if (region && (region != currentRegion.name)) {
                    core.info(`Not deploying to region ${currentRegion.name}...`);
                    continue;
                }
                let storageAccount = getStorageAccount(environment, currentRegion);
                const sasToken = await getSasToken(storageAccount);
                const hasDeployedFiles = await deployToContainerOfStorageAccount(sasToken, storageAccount, container, sourceDirectory);
                deployedAnything = deployedAnything || hasDeployedFiles;
                if (versionDeployment && hasDeployedFiles) { // store backup version of the deployment
                    const version = await pushBranchVersionTagForMicrofrontend(branch, microfrontend);
                    await backupDeployedVersion(version, sasToken, sourceDirectory, storageAccount, container);
                    core.setOutput('version', version);
                }
            }

            if(!deployedAnything) {
                throw new Error('Could not find any container to deploy to!');
            }
        }
    } catch (e) {
        core.setFailed(e.message);
    }
})();


/**
 * Fetches a SAS token for accessing Azure File Storage
 * @param {string} storageAccount account where we want to access the Azure File Storage
 * @returns SAS token
 */
async function getSasToken(storageAccount) {
    // Fetch SAS token
    const expires = moment().utc().add(2, 'hours').format();
    let sasResponse = '';
    try {
        await exec.exec('az', [
            'storage', 'account', 'generate-sas',
            '--expiry', expires,
            '--permissions', 'acuw',
            '--account-name', storageAccount,
            '--resource-types', 'o',
            '--services', 'f',
            '--https-only',
            '-o', 'json'
        ], {outStream: noopStream, errStream: noopStream, listeners: {stdout: data => sasResponse += data}});
    } catch (e) {
        core.info('Failed to fetch sas token');
    }
    const sasToken = JSON.parse(sasResponse);
    return sasToken;
}

/**
 * Deploy a the microfrontend to the specified container of the given storageAccount
 * @param {string} sasToken token to access Azure File storage on the storageAccount
 * @param {string} storageAccount e.g. leanixwesteuropetest
 * @param {string} container e.g. storage-deploy-action-public
 * @param {string} sourceDirectory name of the directory where the files are located that should be deployed
 * @returns if files have been deployed
 */
async function deployToContainerOfStorageAccount(sasToken, storageAccount, container, sourceDirectory) {
    const exitCode = await exec.exec('az', [
        'storage', 'account', 'show',
        '--name', storageAccount
    ], {ignoreReturnCode: true, silent: true});
    if (exitCode > 0) {
        core.info(`Not deploying to ${storageAccount} because storage account does not exist.`);
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
        core.info(`Not deploying to ${storageAccount} because no container ${container} exists.`);
        return false;
    }

    core.info(`Now deploying to ${storageAccount}!`);

    if (sourceDirectory.length <= 0) {
        throw new Error('Please specify a source directory when using this action for deployments.');
    }
    // Sync directory to Azure Blob Storage
    core.info(`Now deploying to Azure Blob Storage ${storageAccount}.`);
    await exec.exec('./azcopy', [
        'sync', sourceDirectory + '/',
        `https://${storageAccount}.blob.core.windows.net/${container}/`,
        '--recursive'
    ]);

    try {
        // Copy directory to Azure File Storage
        core.info(`Now deploying to Azure File Storage ${storageAccount}.`);
        await exec.exec('./azcopy', [
            'copy', sourceDirectory + '/*',
            `https://${storageAccount}.file.core.windows.net/k8s-cdn-proxy/${container}?${sasToken}`,
            '--recursive'
        ]);
    } catch (e) {
        core.info('Deployment to file storage failed');
        return true;
    }
    return true;
}

/**
 * Backup the deployed version.
 * @param {string} version Identifier of the version (e.g. 22)
 * @param {string} sasToken Token to access the Azure File Storage on the storageAccount
 * @param {string} sourceDirectory Directory where the deployed files are stored
 * @param {string} storageAccount Identify region and environment
 * @param {string} container Identify blob container in storageAccount
 */
async function backupDeployedVersion(version, sasToken, sourceDirectory, storageAccount, container) {
    // Look for files to be versioned and upload them versioned
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
                core.info('Backup to file storage failed');
                return;
            }
            
        }
    }
    core.info(`Finished creation of backup ${version} in ${storageAccount}.blob.core.windows.net/${container} and ${storageAccount}.file.core.windows.net/k8s-cdn-proxy/${container}.`);
}

/**
 * Rolls back the microfrontend deployed on some storage account to a given version. 
 * @param {string} rollbackVersion Back to this version (e.g. 5)
 * @param {string} sasToken Token to access the Azure File Storage on the storageAccount
 * @param {string} storageAccount Identify region and environment (e.g. leanixwesteuropetest)
 * @param {string} container Identify the container on the storageAccount 
 * @return If the rollback has been successfully finished
 */
async function rollbackStorageAccount(rollbackVersion, sasToken, storageAccount, container) {
    const exitCode = await exec.exec(
        'az', 
        ['storage', 'account', 'show', '--name', storageAccount],
        {ignoreReturnCode: true, silent: true}
    );
    if (exitCode > 0) {
        core.info(`Not rolling back ${storageAccount} because account does not exist.`);
        return false;
    }
    core.info(`Rolling back ${storageAccount} to version ${rollbackVersion}.`)
    for (let file of filesToVersion) {
        await rollbackFileOnBlobStorage(file, rollbackVersion, storageAccount, container);
        await rollbackFileOnFileStorage(file, rollbackVersion, sasToken, storageAccount, container);
    }
    return true;
}

async function rollbackFileOnBlobStorage(file, rollbackVersion, storageAccount, container) {
    const filename = path.parse(file).name;
    const extension = path.parse(file).ext;
    try {
        // Download versioned file from blob storage
        await exec.exec('./azcopy', [
            'cp',
            `https://${storageAccount}.blob.core.windows.net/${container}/${filename}_${rollbackVersion}${extension}`,
            `rollback-blob-storage/${filename}_${rollbackVersion}${extension}`
        ]);
        // Upload versioned file as unversioned file to blob storage
        await exec.exec('./azcopy', [
            'copy', `rollback-blob-storage/${filename}_${rollbackVersion}${extension}`,
            `https://${storageAccount}.blob.core.windows.net/${container}/${file}`
        ]);
    } catch (e) {
        core.info(`File https://${storageAccount}.blob.core.windows.net/${container}/${filename}_${rollbackVersion}${extension} does not exist in blob storage container.`);
        return;
    }
}

async function rollbackFileOnFileStorage(file, rollbackVersion, sasToken, storageAccount, container) {
    const filename = path.parse(file).name;
    const extension = path.parse(file).ext;
    try {
        // Download versioned file from file storage
        await exec.exec('./azcopy', [
            'cp',
            `https://${storageAccount}.file.core.windows.net/k8s-cdn-proxy/${container}/${filename}_${rollbackVersion}${extension}?${sasToken}`,
            `rollback-file-storage/${filename}_${rollbackVersion}${extension}`
        ]);
        // Upload versioned file as unversioned file to file storage
        await exec.exec('./azcopy', [
            'copy', `rollback-file-storage/${filename}_${rollbackVersion}${extension}`,
            `https://${storageAccount}.file.core.windows.net/k8s-cdn-proxy/${container}/${file}?${sasToken}`
        ]);
    } catch (e) {
        core.info(`File https://${storageAccount}.file.core.windows.net/k8s-cdn-proxy/${container}/${filename}_${rollbackVersion}${extension} does not exist in file storage container.`);
        return;
    }
}

/**
 * Returns the name of the storage account (e.g. leanixwesteuropetest) which is a combination of the region
 * and the environment.
 * @param {string} environment either test or prod
 * @param {string} region e.g. { name:'germanywestcentral', short:'de' }
 */
function getStorageAccount(environment, region) {
    let storageAccount = `leanix${region.name}${environment}`;
    if (storageAccount.length > 24) {
        storageAccount = `leanix${region.short}${environment}`;
    }
    return storageAccount;
}

/**
 * Calculates the new branch version of the given microfrontend.
 * @param {string} branch
 * @param {string} microfrontend
 * @returns The new version number
 */
async function pushBranchVersionTagForMicrofrontend(branch, microfrontend) {
    if (branch.length <= 0) {
        throw new Error('Please specify a branch name when using this action to deploy a branch.');
    }

    const normalizedBranch = branch.replace(/\W+/g, '-');
    const versionTagPrefix = 'VERSION-' + (microfrontend !== '' ? microfrontend.toUpperCase() + '-' : '') + normalizedBranch.toUpperCase() + '-';
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
        core.info(`Next version on branch ${branch} is ${releaseVersion}`);
        const releaseVersionTag = `${versionTagPrefix}${releaseVersion}`;
        await git.tag([releaseVersionTag, process.env.GITHUB_REF]);
        await git.pushTags();
    }
    
    return releaseVersion;
}
