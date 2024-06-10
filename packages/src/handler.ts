const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;
const STAGE = process.env.STAGE;

import { InitializationService } from './functions/initialization/initialization.service';
import { ReservationsService } from './functions/reservations/reservations.service';
import { IotService } from './functions/iot/iot.service';
import { AssetsService } from './functions/assets/assets.service';

exports.function_handler = async function(event, context) {
    console.log('context: ' + JSON.stringify(context));

    const initializationService = new InitializationService();
    const iotService = new IotService();
    const assetsService = new AssetsService();
    const reservationsService = new ReservationsService();
    
    if (context.clientContext.Custom.subject.indexOf('init_db') > -1) {
    	console.log('init_db event: ' + JSON.stringify(event));

		await initializationService.createTables();

    } else if (context.clientContext.Custom.subject == `$aws/things/${AWS_IOT_THING_NAME}/shadow/update/delta`) {
    	console.log('shadow event: ' + JSON.stringify(event));

		const getShadowResult = await iotService.getShadow({
		        thingName: AWS_IOT_THING_NAME
		    });

		if (getShadowResult.state.desired.hostId && getShadowResult.state.desired.stage) {
			process.env.HOST_ID = getShadowResult.state.desired.hostId;
			process.env.STAGE = getShadowResult.state.desired.stage;

			await initializationService.saveHost({
				hostId: getShadowResult.state.desired.hostId,
				stage: getShadowResult.state.desired.stage
			}).catch(err => {
				console.error('saveHost error:' + err.message);
				throw err;
			});
		}

		if (getShadowResult.state.desired.property) {
			process.env.PROPERTY_CODE = getShadowResult.state.desired.property.propertyCode;
			
			await assetsService.saveProperty(getShadowResult.state.desired.hostId, getShadowResult.state.desired.property).catch(err => {
				console.error('saveProperty error:' + err.message);
				throw err;
			});
		}

		if (getShadowResult.state.desired.cameras) {
			await assetsService.refreshCameras(getShadowResult.state.desired.hostId, getShadowResult.state.desired.cameras).catch(err => {
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
			        thingName: AWS_IOT_THING_NAME,
			        reportedState: getShadowResult.state.desired
			    });	    		
	    	}
	    } else {
	    	await reservationsService.syncReservation(delta);
	    }
   	} else if (context.clientContext.Custom.subject == `gocheckin/scanner_detected`) {
   		console.log('scanner_detected event: ' + JSON.stringify(event));

		const scannerItem = await assetsService.refreshScanner(event).catch(err => {
			console.error('refreshScanner error:' + err.message);
			throw err;
		});

		await iotService.publish({
			topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/scanner_detected`,
		    payload: JSON.stringify(scannerItem)
		});
	}

};

setTimeout(async () => {
    try {
		
    	const initializationService = new InitializationService();
        await initializationService.intializeEnvVar();

		console.log('after intializeEnvVar HOST_ID:' + process.env.HOST_ID);
		console.log('after intializeEnvVar STAGE:' + process.env.STAGE);
		console.log('after intializeEnvVar PROPERTY_CODE:' + process.env.PROPERTY_CODE);

        const assetsService = new AssetsService();
        await assetsService.startOnvif(process.env.HOST_ID);

    } catch (err) {
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
        console.error(err.name);
        console.error(err.message);
        console.error(err.stack);
        console.trace();
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
    } 
}, 10000);

setInterval(async () => {
    try {
		
    	const initializationService = new InitializationService();
        await initializationService.intializeEnvVar();

		console.log('after intializeEnvVar HOST_ID:' + process.env.HOST_ID);
		console.log('after intializeEnvVar STAGE:' + process.env.STAGE);
		console.log('after intializeEnvVar PROPERTY_CODE:' + process.env.PROPERTY_CODE);

    } catch (err) {
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
        console.error(err.name);
        console.error(err.message);
        console.error(err.stack);
        console.trace();
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
    } 
}, 300000);
