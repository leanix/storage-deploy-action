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
            {region:'westeurope',short:'eu'},
            {region:'eastus',short:'us'},
            {region:'canadacentral',short:'ca'},
            {region:'australiaeast',short:'au'},
            {region:'germanywestcentral',short:'de'}
        ];

        // Check environment
        if (!['test', 'prod'].includes(environment)) {
            throw new Error(`Unknown environment ${environment}, must be one of: test, prod`);
        }

        // Check region
        const checkRegions = availableRegions.map(o => o.region);
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
        await exec.exec('az', [
            'account', 'set',
            '-s', process.env.ARM_SUBSCRIPTION_ID
        ], onlyShowErrorsExecOptions);

        let deployedAnything = false;

        for (currentRegionMap of availableRegions) {
            const currentRegion = currentRegionMap.region;
            if (region && (region != currentRegion)) {
                core.info(`Not deploying to region ${currentRegion}...`);
                continue;
            }

            let storageAccount = `leanix${currentRegion}${environment}`;
            if (storageAccount.length > 24) {
                storageAccount = `leanix${currentRegionMap.short}${environment}`;
            }

            const exitCode = await exec.exec('az', [
                'storage', 'account', 'show',
                '--name', storageAccount
            ], {ignoreReturnCode: true, silent: true});
            if (exitCode > 0) {
                core.info(`Not deploying to region ${currentRegion} because no storage account named ${storageAccount} exists.`);
                continue;
            }

            let response = '';
            await exec.exec('az', [
                'storage', 'container', 'exists',
                '--account-name', storageAccount,
                '--name', container
            ], {outStream: noopStream, errStream: noopStream, listeners: {stdout: data => response += data}});
            let result = JSON.parse(response);
            if (!result.exists) {
                core.info(`Not deploying to region ${currentRegion} because no container ${container} exists.`);
                continue;
            }

            // Sync directory to Azure Blob Storage
            core.info(`Now deploying to Azure Blob Storage. region: ${currentRegion}`);
            await exec.exec('./azcopy', [
                'sync', sourceDirectory,
                `https://${storageAccount}.blob.core.windows.net/${container}/`,
                '--recursive',
                '--delete-destination', deleteDestination ? 'true' : 'false'
            ]);

            // Fetch SAS token
            let expires = moment().utc().add(2, 'hours').format();
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
            let sasToken = JSON.parse(sasResponse);

             // Copy directory to Azure File Storage
             core.info(`Now deploying to Azure File Storage. region: ${currentRegion}`);
             await exec.exec('./azcopy', [
                'copy', sourceDirectory + '/*',
                `https://${storageAccount}.file.core.windows.net/k8s-cdn-proxy/${container}?${sasToken}`,
                '--recursive'
            ]);

            deployedAnything = true;

            core.info(`Finished deploying to region ${currentRegion}.`);
        }

        if (!deployedAnything) {
            throw new Error('Cound not find any container to deploy to!');
        }
    } catch (e) {
        core.setFailed(e.message);
    }
})();
