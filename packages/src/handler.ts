import { InitializationService } from './functions/initialization/initialization.service';
import { ReservationsService } from './functions/reservations/reservations.service';
import { IotService } from './functions/iot/iot.service';
import { AssetsService } from './functions/assets/assets.service';

const initializationService = new InitializationService();
const iotService = new IotService();
const assetsService = new AssetsService();
const reservationsService = new ReservationsService();

const z2mResponsePattern = new RegExp(`^zigbee2mqtt\/bridge\/response\/`);
const z2mDevicePattern = new RegExp(`^zigbee2mqtt\/([^\/]+)$`);

exports.function_handler = async function (event, context) {
	console.log('context: ' + context.clientContext.Custom.subject);

	if (context.clientContext.Custom.subject == `gocheckin/${process.env.AWS_IOT_THING_NAME}/init_db`) {
		console.log('init_db event: ' + JSON.stringify(event));

		await initializationService.createTables();

	} else if (context.clientContext.Custom.subject == `gocheckin/${process.env.AWS_IOT_THING_NAME}/discover_cameras`) {
		console.log('discover_cameras event: ' + JSON.stringify(event));

		await assetsService.discoverCameras(process.env.HOST_ID);

	} else if (context.clientContext.Custom.subject == `$aws/things/${process.env.AWS_IOT_THING_NAME}/shadow/update/delta`) {
		console.log('classic shadow event delta: ' + JSON.stringify(event));

		await processClassicShadow(event);

	} else if (context.clientContext.Custom.subject == `gocheckin/scanner_detected`) {
		console.log('scanner_detected event: ' + JSON.stringify(event));

		await assetsService.refreshScanner(event);
	} else if (context.clientContext.Custom.subject == `gocheckin/member_detected`) {
		console.log('member_detected event: ' + JSON.stringify(event));

		await assetsService.unlockByMemberDetected(event);
	} else if (context.clientContext.Custom.subject == `gocheckin/${process.env.AWS_IOT_THING_NAME}/unlock_zb_lock`) {
		console.log('unlock_zb_lock event: ' + JSON.stringify(event));

		await assetsService.unlockZbLock(event.assetId);
	} else if (z2mResponsePattern.test(context.clientContext.Custom.subject)) {
		console.log('z2mResponsePattern topic: ' + context.clientContext.Custom.subject + ' event: ' + JSON.stringify(event));

		if (context.clientContext.Custom.subject == 'zigbee2mqtt/bridge/response/device/rename') {
			await assetsService.renameZigbee(event);
		} else if (context.clientContext.Custom.subject == 'zigbee2mqtt/bridge/response/device/remove') {
			await assetsService.removeZigbee(event);
		}

	} else if (context.clientContext.Custom.subject == `zigbee2mqtt/bridge/event`) {
		console.log('z2mEventPattern topic: ' + context.clientContext.Custom.subject + ' event: ' + JSON.stringify(event));

		await assetsService.discoverZigbee(event);
	} else if (z2mDevicePattern.test(context.clientContext.Custom.subject)) {
		const match = context.clientContext.Custom.subject.match(z2mDevicePattern);
		const deviceName = match ? match[1] : null;

		// Skip bridge messages
		if (deviceName === 'bridge') return;

		console.log('z2mDevicePattern topic: ' + context.clientContext.Custom.subject + ' event: ' + JSON.stringify(event));

		// Handle occupancy attribute if present
		if (deviceName && 'occupancy' in event) {
			if (event.occupancy === true) {
				await assetsService.handleLockTouchEvent({
					lockAssetName: deviceName,
					occupancy: event.occupancy
				});
			} else if (event.occupancy === false) {
				await assetsService.handleLockStopEvent({
					lockAssetName: deviceName,
					occupancy: event.occupancy
				});
			}
		}
	}

};

const processClassicShadow = async function (event) {
	console.log('processClassicShadow in event: ' + JSON.stringify(event));

	const getShadowResult = await iotService.getShadow({
		thingName: process.env.AWS_IOT_THING_NAME
	});

	if (getShadowResult.state.desired.host) {
		process.env.HOST_ID = getShadowResult.state.desired.host.hostId;
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

	if (getShadowResult.state.desired.property) {
		process.env.PROPERTY_CODE = getShadowResult.state.desired.property.propertyCode;

		await assetsService.saveProperty(getShadowResult.state.desired.host.hostId, getShadowResult.state.desired.property).catch(err => {
			console.error('saveProperty error:' + err.message);
			throw err;
		});
	}

	if (event.state.cameras) {
		if (getShadowResult.state.desired.cameras) {
			await assetsService.processCamerasShadow(event.state.cameras, getShadowResult.state.desired.cameras).catch(err => {
				console.error('processCamerasShadow error:' + err.message);
				throw err;
			});
		}
	}

	if (event.state.spaces) {
		if (getShadowResult.state.desired.spaces) {
			await assetsService.processSpacesShadow(event.state.spaces, getShadowResult.state.desired.spaces).catch(err => {
				console.error('processSpacesShadow error:' + err.message);
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
}, 1000);


setInterval(async () => {
	if (!process.env.HOST_ID || !process.env.IDENTTITY_ID || !process.env.CRED_PROVIDER_HOST || !process.env.PROPERTY_CODE) {
		await initializationService.intializeEnvVar();
	}
}, 300000);


setInterval(async () => {
	try {

		await assetsService.discoverCameras(process.env.HOST_ID);

	} catch (err) {
		console.error(err.name);
		console.error(err.message);
		console.error(err.stack);
		console.trace();
	}
}, 300000);
