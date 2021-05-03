const core = require('@actions/core');
const exec = require('@actions/exec');
const noopStream = require('stream-blackhole')();
const moment = require('moment');

(async () => {
    try {

        // Define some parameters
        const container = core.getInput('container', {required: true});
        const sourceDirectory = core.getInput('source-directory', {required: true});
        const region = core.getInput('region') ? core.getInput('region') : '';
        const deleteDestination = (core.getInput('delete-destination') == 'true') ? true : false;
        const environment = core.getInput('environment') ? core.getInput('environment') : 'test';
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
        '--permissions', 'acuw',
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
