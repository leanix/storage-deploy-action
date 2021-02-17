const core = require('@actions/core');
const exec = require('@actions/exec');
const noopStream = require('stream-blackhole')();
const git = require('simple-git/promise')();

(async () => {
    try {
        // Pipeline can only be executed on an underlying branch in order to perform
        // versioning
        if (!process.env.GITHUB_REF || !process.env.GITHUB_REF.match(/^refs\/heads\//)) {
            throw new Exception("No git branch given via process.env.GITHUB_REF");
        }

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

        let deployedAnything = false;

        const branch = process.env.GITHUB_REF.replace(/^refs\/heads\//, '');
        const normalisedBranch = branch.replace(/\W+/g, '-');
        const versionTagPrefix = 'VERSION-' + normalisedBranch.toUpperCase() + '-';
        const tagsOfCurrentCommitString = await git.tag(
            [
                '-l', versionTagPrefix + '*',
                '--points-at', currentCommit,
                '--sort', '-v:refname'
            ]
        );

        let releaseVersion = 0;
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

            core.info(`Now deploying to region ${currentRegion}!`);

            // Sync directory
            await exec.exec('./azcopy', [
                'sync', sourceDirectory,
                `https://${storageAccount}.blob.core.windows.net/${container}/`,
                '--recursive',
                '--delete-destination', deleteDestination ? 'true' : 'false'
            ]);
            // Store versioned index.html
            await exec.exec('./azcopy', [
                'sync', 'sourceDirectory/index.html',
                `https://${storageAccount}.blob.core.windows.net/${container}/index_${releaseVersion}.html`
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
