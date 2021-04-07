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
        const sourceDirectory = core.getInput('source-directory') ? core.getInput('source-directory') : '';
        const region = core.getInput('region') ? core.getInput('region') : '';
        const deleteDestination = (core.getInput('delete-destination') == 'true') ? true : false;
        const environment = core.getInput('environment') ? core.getInput('environment') : 'test';
        const branch = core.getInput('branch') ? core.getInput('branch') : '';
        const microfrontend = core.getInput('microfrontend') ? core.getInput('microfrontend') : '';
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
                rollbackStorageAccount(storageAccount, rollbackVersion);
            }
        } else { // deploy a new version
            const version = await pushBranchVersionTagForMicrofrontend(branch, microfrontend);
            let deployedAnything = false;
            for (currentRegion of availableRegions) {
                if (region && (region != currentRegion.name)) {
                    core.info(`Not deploying to region ${currentRegion.name}...`);
                    continue;
                }
                let storageAccount = getStorageAccount(environment, currentRegion);
                const hasDeployedFiles = await deployNewVersionToContainerOfStorageAccount(version, storageAccount, container, sourceDirectory, deleteDestination);
                deployedAnything = deployedAnything || hasDeployedFiles;
            }
            if (deployedAnything) {
                core.setOutput('version', version);
            } else {
                throw new Error('Could not find any container to deploy to!');
            }
        }
    } catch (e) {
        core.setFailed(e.message);
    }
})();

/**
 * Deploy a new version of the microfrontend to the specified container of the given storageAccount
 * @param {string} version version number used for backups
 * @param {string} storageAccount e.g. leanixwesteuropetest
 * @param {string} container e.g. storage-deploy-action-public
 * @param {string} sourceDirectory name of the directory where the files are located that should be deployed
 * @param {boolean} deleteDestination wether to delete the files currently in the container
 * @returns if files have been deployed
 */
async function deployNewVersionToContainerOfStorageAccount(version, storageAccount, container, sourceDirectory, deleteDestination) {
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
        'copy', sourceDirectory + '/*',
        `https://${storageAccount}.blob.core.windows.net/${container}/`,
        '--recursive',
        '--delete-destination', deleteDestination ? 'true' : 'false'
    ]);
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
        }
    }
    core.info(`Finished deploying of version ${version} to ${storageAccount}.`);
    return true;
}

/**
 * Rolls back the microfrontend deployed on some storage account to a given version. 
 * @param {string} storageAccount an identifier combing region and environment (e.g. leanixwesteuropetest)
 * @param {string} rollbackVersion back to this version (e.g. 5) 
 * @return if the rollback has been successfully finished
 */
async function rollbackStorageAccount(storageAccount, rollbackVersion) {
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
        const filename = path.parse(file).name;
        const extension = path.parse(file).ext;
        try {
            // Download versioned file
            await exec.exec('./azcopy', [
                'cp',
                `https://${storageAccount}.blob.core.windows.net/${container}/${filename}_${rollbackVersion}${extension}`,
                `rollback/${filename}_${rollbackVersion}${extension}`
            ]);
            // Upload versioned file as unversioned file
            await exec.exec('./azcopy', [
                'sync', `rollback/${filename}_${rollbackVersion}${extension}`,
                `https://${storageAccount}.blob.core.windows.net/${container}/${file}`
            ]);
        } catch (e) {
            core.info(`File ${filename}_${rollbackVersion}${extension} does not exist in storage container.`);
            continue;
        }
    }
    return true;
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
