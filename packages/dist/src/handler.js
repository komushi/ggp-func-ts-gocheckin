"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const initialization_service_1 = require("./functions/initialization/initialization.service");
const reservations_service_1 = require("./functions/reservations/reservations.service");
const iot_service_1 = require("./functions/iot/iot.service");
const assets_service_1 = require("./functions/assets/assets.service");
const initializationService = new initialization_service_1.InitializationService();
const iotService = new iot_service_1.IotService();
const assetsService = new assets_service_1.AssetsService();
const reservationsService = new reservations_service_1.ReservationsService();
// const deltaPattern = new RegExp(`^\\$aws/things/${process.env.AWS_IOT_THING_NAME}/shadow/name/([^/]+)/update/delta$`);
// const deletePattern = new RegExp(`^\\$aws/things/${process.env.AWS_IOT_THING_NAME}/shadow/name/([^/]+)/delete/accepted$`);
const initPattern = new RegExp(`^\\gocheckin/${process.env.AWS_IOT_THING_NAME}/init_db$`);
const discoverCamerasPattern = new RegExp(`^\\gocheckin/${process.env.AWS_IOT_THING_NAME}/discover_cameras$`);
const z2mDevicePattern = new RegExp(`^zigbee2mqtt\/bridge\/response\/device\/`);
const z2mEventPattern = new RegExp(`^\\zigbee2mqtt\/bridge\/event$`);
exports.function_handler = function (event, context) {
    return __awaiter(this, void 0, void 0, function* () {
        // console.log('context: ' + JSON.stringify(context));
        if (initPattern.test(context.clientContext.Custom.subject)) {
            console.log('init_db event: ' + JSON.stringify(event));
            yield initializationService.createTables();
        }
        else if (discoverCamerasPattern.test(context.clientContext.Custom.subject)) {
            console.log('discover_cameras event: ' + JSON.stringify(event));
            yield assetsService.discoverCameras(process.env.HOST_ID);
        }
        else if (context.clientContext.Custom.subject == `$aws/things/${process.env.AWS_IOT_THING_NAME}/shadow/update/delta`) {
            console.log('classic shadow event delta: ' + JSON.stringify(event));
            if (!process.env.HOST_ID || !process.env.STAGE || !process.env.IDENTTITY_ID || !process.env.CRED_PROVIDER_HOST || !process.env.PROPERTY_CODE) {
                setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                    yield initializationService.intializeEnvVar();
                    yield processClassicShadow(event);
                }), 10000);
            }
            else {
                yield processClassicShadow(event);
            }
        }
        else if (context.clientContext.Custom.subject == `gocheckin/scanner_detected`) {
            console.log('scanner_detected event: ' + JSON.stringify(event));
            yield assetsService.refreshScanner(event);
            // } else if (z2mDevicePattern.test(context.clientContext.Custom.subject)) {
            // 	console.log('z2mDevicePattern topic: ' + context.clientContext.Custom.subject + ' event: ' + JSON.stringify(event));
        }
        else if (context.clientContext.Custom.subject == `zigbee2mqtt/bridge/event`) {
            console.log('z2mEventPattern topic: ' + context.clientContext.Custom.subject + ' event: ' + JSON.stringify(event));
            // } else {
            // 	console.log('other topic: ' + context.clientContext.Custom.subject);
        }
    });
};
const processClassicShadow = function (event) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('processClassicShadow in event: ' + JSON.stringify(event));
        const getShadowResult = yield iotService.getShadow({
            thingName: process.env.AWS_IOT_THING_NAME
        });
        if (event.state.host) {
            if (getShadowResult.state.desired.host) {
                process.env.HOST_ID = getShadowResult.state.desired.host.hostId;
                process.env.STAGE = getShadowResult.state.desired.host.stage;
                process.env.IDENTTITY_ID = getShadowResult.state.desired.host.identityId;
                process.env.CRED_PROVIDER_HOST = getShadowResult.state.desired.host.credProviderHost;
                yield assetsService.saveHost({
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
                yield assetsService.saveProperty(getShadowResult.state.desired.host.hostId, getShadowResult.state.desired.property).catch(err => {
                    console.error('saveProperty error:' + err.message);
                    throw err;
                });
            }
        }
        if (event.state.cameras) {
            if (getShadowResult.state.desired.cameras) {
                yield assetsService.processShadow(event.state.cameras, getShadowResult.state.desired.cameras).catch(err => {
                    console.error('refreshCameras error:' + err.message);
                    throw err;
                });
            }
        }
        if (event.state.reservations) {
            if (getShadowResult.state.desired.reservations) {
                yield reservationsService.processShadow(event.state.reservations, getShadowResult.state.desired.reservations).catch(err => {
                    console.error('processShadow error:' + err.message);
                    throw err;
                });
            }
        }
        yield iotService.updateReportedShadow({
            thingName: process.env.AWS_IOT_THING_NAME,
            reportedState: getShadowResult.state.desired
        });
        console.log('processClassicShadow out');
    });
};
setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
    yield initializationService.intializeEnvVar();
}), 10000);
/*
setTimeout(async () => {
    await assetsService.discoverCameras(process.env.HOST_ID);

    // await assetsService.startOnvif({
    // 	hostId: process.env.HOST_ID,
    // 	propertyCode: process.env.PROPERTY_CODE
    // });

}, 10000);
*/
setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const initializationService = new initialization_service_1.InitializationService();
        yield initializationService.intializeEnvVar();
        yield assetsService.discoverCameras(process.env.HOST_ID);
    }
    catch (err) {
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
        console.error(err.name);
        console.error(err.message);
        console.error(err.stack);
        console.trace();
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
    }
}), 300000);
