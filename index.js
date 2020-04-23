const core = require('@actions/core');
const exec = require('@actions/exec');

(async () => {
    try {

        // Define some parameters
        const container = core.getInput('container', {required: true});
        const sourceDirectory = core.getInput('source-directory', {required: true});
        const region = core.getInput('region') ? core.getInput('region') : '';
        const environment = core.getInput('environment') ? core.getInput('environment') : 'test';
        const execOptions = {stdout: (data) => core.info(data.toString()), stderror: (data) => core.error(data.toString())};

        // Check environment
        if (!['test', 'prod'].includes(environment)) {
            core.setFailed(`Unknown environment ${environment}, must be 'test' or 'prod'`);
        }

        core.exportVariable('AZCOPY_SPA_CLIENT_SECRET', process.env.ARM_CLIENT_SECRET)

        // Install & login to Azure Copy
        await exec.exec('wget', ['-O', 'azcopy.tar.gz', 'https://aka.ms/downloadazcopy-v10-linux'], execOptions)
        await exec.exec('tar', ['--strip-components=1', '-xzf', 'azcopy.tar.gz'], execOptions)
        await exec.exec('./azcopy', [
            'login', '--service-principal',
            '--application-id', process.env.ARM_CLIENT_ID,
            '--tenant-id', process.env.ARM_TENANT_ID
        ], execOptions);

        for (currentRegion of ['westeurope', 'eastus', 'canadacentral', 'australiaeast']) {
            if (region && (region != currentRegion)) {
                core.info(`Not deploying to region ${currentRegion}...`);
                continue;
            }

            core.info(`Now deploying to region ${currentRegion}!`);

            // Sync directory
            await exec.exec('./azcopy', [
                'sync', sourceDirectory,
                `https://leanix${region}${environment}.blob.core.windows.net/${container}/`,
                '--recursive',
                '--delete-destination', 'true'
            ], execOptions);

            core.info(`Finished deploying to region ${currentRegion}.`);
        }
    } catch (e) {
        core.setFailed(e.message);
    }
})();
