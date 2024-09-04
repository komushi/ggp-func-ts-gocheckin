import { InitializationService } from './functions/initialization/initialization.service';
import { ReservationsService } from './functions/reservations/reservations.service';
import { IotService } from './functions/iot/iot.service';
import { AssetsService } from './functions/assets/assets.service';

const initializationService = new InitializationService();
const iotService = new IotService();
const assetsService = new AssetsService();
const reservationsService = new ReservationsService();

// const deltaPattern = new RegExp(`^\\$aws/things/${process.env.AWS_IOT_THING_NAME}/shadow/name/([^/]+)/update/delta$`);
// const deletePattern = new RegExp(`^\\$aws/things/${process.env.AWS_IOT_THING_NAME}/shadow/name/([^/]+)/delete/accepted$`);
const initPattern = new RegExp(`^\\gocheckin/${process.env.AWS_IOT_THING_NAME}/init_db$`);
const discoverCamerasPattern = new RegExp(`^\\gocheckin/${process.env.AWS_IOT_THING_NAME}/discover_cameras$`);

exports.function_handler = async function(event, context) {
    console.log('context: ' + JSON.stringify(context));

	if (initPattern.test(context.clientContext.Custom.subject)) {
    	console.log('init_db event: ' + JSON.stringify(event));

		await initializationService.createTables();

	} else if (discoverCamerasPattern.test(context.clientContext.Custom.subject)) {
    	console.log('discover_cameras event: ' + JSON.stringify(event));

		await assetsService.discoverCameras(process.env.HOST_ID);

    } else if (context.clientContext.Custom.subject == `$aws/things/${process.env.AWS_IOT_THING_NAME}/shadow/update/delta`) {
    	console.log('classic shadow event delta: ' + JSON.stringify(event));

		if (!process.env.HOST_ID || !process.env.STAGE || !process.env.IDENTTITY_ID || !process.env.CRED_PROVIDER_HOST || !process.env.PROPERTY_CODE) {
			setTimeout(async () => {
				await initializationService.intializeEnvVar();
				await processClassicShadow(event);
			}, 10000);
		} else {
			await processClassicShadow(event);
		}

	} else if (context.clientContext.Custom.subject == `gocheckin/scanner_detected`) {
   		console.log('scanner_detected event: ' + JSON.stringify(event));

		await assetsService.refreshScanner(event);
	}

};

const processClassicShadow = async function(event) {
	console.log('processClassicShadow in event: ' + JSON.stringify(event));

	const getShadowResult = await iotService.getShadow({
		thingName: process.env.AWS_IOT_THING_NAME
	});

	if (event.state.host) {
		if (getShadowResult.state.desired.host) {
			process.env.HOST_ID = getShadowResult.state.desired.host.hostId;
			process.env.STAGE = getShadowResult.state.desired.host.stage;
			process.env.IDENTTITY_ID = getShadowResult.state.desired.host.identityId;
			process.env.CRED_PROVIDER_HOST = getShadowResult.state.desired.host.credProviderHost;
	
			await assetsService.saveHost({
				hostId: getShadowResult.state.desired.host.hostId,
				identityId: getShadowResult.state.desired.host.identityId,
				stage: getShadowResult.state.desired.host.stage,
				credProviderHost: getShadowResult.state.desired.host.credProviderHost
			}).catch(err => {
				console.error('saveHost error:' + err.message);
				throw err;
			});
		}	
	}

	if (event.state.property) {
		if (getShadowResult.state.desired.property) {
			process.env.PROPERTY_CODE = getShadowResult.state.desired.property.propertyCode;
			
			await assetsService.saveProperty(getShadowResult.state.desired.host.hostId, getShadowResult.state.desired.property).catch(err => {
				console.error('saveProperty error:' + err.message);
				throw err;
			});
		}	
	}

	if (event.state.cameras) {
		if (getShadowResult.state.desired.cameras) {
			await assetsService.refreshCameras(event.state.cameras, getShadowResult.state.desired.cameras).catch(err => {
				console.error('refreshCameras error:' + err.message);
				throw err;
			});
		}
	}

	if (event.state.reservations) {
		if (getShadowResult.state.desired.reservations) {
			await reservationsService.processShadow(event.state.reservations, getShadowResult.state.desired.reservations).catch(err => {
				console.error('processShadow error:' + err.message);
				throw err;
			});
		}
	}

	await iotService.updateReportedShadow({
		thingName: process.env.AWS_IOT_THING_NAME,
		reportedState: getShadowResult.state.desired
	});

	console.log('processClassicShadow out');
};



setTimeout(async () => {
	await initializationService.intializeEnvVar();
}, 2000);

setTimeout(async () => {
	await assetsService.discoverCameras(process.env.HOST_ID);

	// await assetsService.startOnvif({
	// 	hostId: process.env.HOST_ID,
	// 	propertyCode: process.env.PROPERTY_CODE
	// });

}, 10000);

/*
setInterval(async () => {
    try {
		
    	const initializationService = new InitializationService();
        await initializationService.intializeEnvVar();

		await assetsService.discoverCameras(process.env.HOST_ID);

    } catch (err) {
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
        console.error(err.name);
        console.error(err.message);
        console.error(err.stack);
        console.trace();
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
    } 
}, 360000);
*/