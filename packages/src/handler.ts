import { InitializationService } from './functions/initialization/initialization.service';
import { ReservationsService } from './functions/reservations/reservations.service';
import { IotService } from './functions/iot/iot.service';
import { AssetsService } from './functions/assets/assets.service';

const initializationService = new InitializationService();
const iotService = new IotService();
const assetsService = new AssetsService();
const reservationsService = new ReservationsService();

exports.function_handler = async function(event, context) {
    console.log('context: ' + JSON.stringify(context));
    
    if (context.clientContext.Custom.subject.indexOf('init_db') > -1) {
    	console.log('init_db event: ' + JSON.stringify(event));

		await initializationService.createTables();

    } else if (context.clientContext.Custom.subject == `$aws/things/${process.env.AWS_IOT_THING_NAME}/shadow/update/delta`) {
    	console.log('shadow event: ' + JSON.stringify(event));

		await processShadow(event);

		/*
		const getShadowResult = await iotService.getShadow({
		        thingName: process.env.AWS_IOT_THING_NAME
		    });

		if (getShadowResult.state.desired.host && getShadowResult.state.desired.stage) {
			process.env.HOST_ID = getShadowResult.state.desired.host.hostId;
			process.env.STAGE = getShadowResult.state.desired.host.stage;

			await initializationService.saveHost({
				hostId: getShadowResult.state.desired.host.hostId,
				identityId: getShadowResult.state.desired.host.identityId,
				stage: getShadowResult.state.desired.stage,
				credProviderHost: getShadowResult.state.desired.host.credProviderHost
			}).catch(err => {
				console.error('saveHost error:' + err.message);
				throw err;
			});
		}

		if (getShadowResult.state.desired.property) {
			process.env.PROPERTY_CODE = getShadowResult.state.desired.property.propertyCode;
			
			await assetsService.saveProperty(getShadowResult.state.desired.host.hostId, getShadowResult.state.desired.property).catch(err => {
				console.error('saveProperty error:' + err.message);
				throw err;
			});
		}

		if (getShadowResult.state.desired.cameras) {
			await assetsService.refreshCameras(getShadowResult.state.desired.cameras).catch(err => {
				console.error('refreshCameras error:' + err.message);
				throw err;
			});
		}

		let delta = event;

	    if (!delta) {
	    	delta = { state: {} };
	    	if (getShadowResult.state.delta) {
	    		delta.state = getShadowResult.state.delta;	
	    	}

	    	if (!delta.state.reservations) {
			    await iotService.updateReportedShadow({
			        thingName: process.env.AWS_IOT_THING_NAME,
			        reportedState: getShadowResult.state.desired
			    });	    		
	    	}
	    } else {
	    	await reservationsService.syncReservation(delta);
	    }
		*/
   	} else if (context.clientContext.Custom.subject == `gocheckin/scanner_detected`) {
   		console.log('scanner_detected event: ' + JSON.stringify(event));

		await assetsService.refreshScanner(event);
	}

};

const processShadow = async function(event) {
	console.log('processShadow in event: ' + JSON.stringify(event));

	const getShadowResult = await iotService.getShadow({
		thingName: process.env.AWS_IOT_THING_NAME
	});

	if (getShadowResult.state.desired.host && getShadowResult.state.desired.stage) {
		process.env.HOST_ID = getShadowResult.state.desired.host.hostId;
		process.env.STAGE = getShadowResult.state.desired.host.stage;

		await initializationService.saveHost({
			hostId: getShadowResult.state.desired.host.hostId,
			identityId: getShadowResult.state.desired.host.identityId,
			stage: getShadowResult.state.desired.stage,
			credProviderHost: getShadowResult.state.desired.host.credProviderHost
		}).catch(err => {
			console.error('saveHost error:' + err.message);
			throw err;
		});
	}

	if (getShadowResult.state.desired.property) {
		process.env.PROPERTY_CODE = getShadowResult.state.desired.property.propertyCode;
		
		await assetsService.saveProperty(getShadowResult.state.desired.host.hostId, getShadowResult.state.desired.property).catch(err => {
			console.error('saveProperty error:' + err.message);
			throw err;
		});
	}

	if (getShadowResult.state.desired.cameras) {
		await assetsService.refreshCameras(getShadowResult.state.desired.cameras).catch(err => {
			console.error('refreshCameras error:' + err.message);
			throw err;
		});
	}

	delete getShadowResult.state.desired.reservations;

	await iotService.updateReportedShadow({
		thingName: process.env.AWS_IOT_THING_NAME,
		reportedState: getShadowResult.state.desired
	});

	if (event) {
		await reservationsService.syncReservation(event);
	}
};

setTimeout(async () => {
    try {
		
    	const initializationService = new InitializationService();
        await initializationService.intializeEnvVar();

		console.log('after intializeEnvVar HOST_ID:' + process.env.HOST_ID);
		console.log('after intializeEnvVar IDENTTITY_ID:' + process.env.IDENTTITY_ID);
		console.log('after intializeEnvVar STAGE:' + process.env.STAGE);
		console.log('after intializeEnvVar PROPERTY_CODE:' + process.env.PROPERTY_CODE);
		console.log('after intializeEnvVar CRED_PROVIDER_HOST:' + process.env.CRED_PROVIDER_HOST);
		

        const assetsService = new AssetsService();
		await assetsService.discoverCameras(process.env.HOST_ID);

        await assetsService.startOnvif({
			hostId: process.env.HOST_ID,
			identityId: process.env.IDENTTITY_ID,
			propertyCode: process.env.PROPERTY_CODE,
			credProviderHost: process.env.CRED_PROVIDER_HOST
		});

    } catch (err) {
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
        console.error(err.name);
        console.error(err.message);
        console.error(err.stack);
        console.trace();
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
    } 
}, 5000);

setInterval(async () => {
    try {
		
    	const initializationService = new InitializationService();
        await initializationService.intializeEnvVar();

		console.log('after intializeEnvVar HOST_ID:' + process.env.HOST_ID);
		console.log('after intializeEnvVar IDENTTITY_ID:' + process.env.IDENTTITY_ID);
		console.log('after intializeEnvVar STAGE:' + process.env.STAGE);
		console.log('after intializeEnvVar PROPERTY_CODE:' + process.env.PROPERTY_CODE);
		console.log('after intializeEnvVar CRED_PROVIDER_HOST:' + process.env.CRED_PROVIDER_HOST);

		await processShadow(null);

    } catch (err) {
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
        console.error(err.name);
        console.error(err.message);
        console.error(err.stack);
        console.trace();
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
    } 
}, 360000);
