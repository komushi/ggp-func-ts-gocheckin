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
const z2mResponsePattern = new RegExp(`^zigbee2mqtt\/bridge\/response\/`);
exports.function_handler = function (event, context) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('context: ' + context.clientContext.Custom.subject);
        if (context.clientContext.Custom.subject == `gocheckin/${process.env.AWS_IOT_THING_NAME}/init_db`) {
            console.log('init_db event: ' + JSON.stringify(event));
            yield initializationService.createTables();
        }
        else if (context.clientContext.Custom.subject == `gocheckin/${process.env.AWS_IOT_THING_NAME}/discover_cameras`) {
            console.log('discover_cameras event: ' + JSON.stringify(event));
            yield assetsService.discoverCameras(process.env.HOST_ID);
        }
        else if (context.clientContext.Custom.subject == `$aws/things/${process.env.AWS_IOT_THING_NAME}/shadow/update/delta`) {
            console.log('classic shadow event delta: ' + JSON.stringify(event));
            yield processClassicShadow(event);
        }
        else if (context.clientContext.Custom.subject == `gocheckin/scanner_detected`) {
            console.log('scanner_detected event: ' + JSON.stringify(event));
            yield assetsService.refreshScanner(event);
        }
        else if (context.clientContext.Custom.subject == `gocheckin/member_detected`) {
            console.log('member_detected event: ' + JSON.stringify(event));
            yield assetsService.unlockZbLock(event);
        }
        else if (z2mResponsePattern.test(context.clientContext.Custom.subject)) {
            console.log('z2mResponsePattern topic: ' + context.clientContext.Custom.subject + ' event: ' + JSON.stringify(event));
            if (context.clientContext.Custom.subject == 'zigbee2mqtt/bridge/response/device/rename') {
                yield assetsService.renameZigbee(event);
            }
            else if (context.clientContext.Custom.subject == 'zigbee2mqtt/bridge/response/device/remove') {
                yield assetsService.removeZigbee(event);
            }
        }
        else if (context.clientContext.Custom.subject == `zigbee2mqtt/bridge/event`) {
            console.log('z2mEventPattern topic: ' + context.clientContext.Custom.subject + ' event: ' + JSON.stringify(event));
            yield assetsService.discoverZigbee(event);
        }
    });
};
const processClassicShadow = function (event) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('processClassicShadow in event: ' + JSON.stringify(event));
        const getShadowResult = yield iotService.getShadow({
            thingName: process.env.AWS_IOT_THING_NAME
        });
        if (getShadowResult.state.desired.host) {
            process.env.HOST_ID = getShadowResult.state.desired.host.hostId;
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
        if (getShadowResult.state.desired.property) {
            process.env.PROPERTY_CODE = getShadowResult.state.desired.property.propertyCode;
            yield assetsService.saveProperty(getShadowResult.state.desired.host.hostId, getShadowResult.state.desired.property).catch(err => {
                console.error('saveProperty error:' + err.message);
                throw err;
            });
        }
        if (event.state.cameras) {
            if (getShadowResult.state.desired.cameras) {
                yield assetsService.processCamerasShadow(event.state.cameras, getShadowResult.state.desired.cameras).catch(err => {
                    console.error('processCamerasShadow error:' + err.message);
                    throw err;
                });
            }
        }
        if (event.state.spaces) {
            if (getShadowResult.state.desired.spaces) {
                yield assetsService.processSpacesShadow(event.state.spaces, getShadowResult.state.desired.spaces).catch(err => {
                    console.error('processSpacesShadow error:' + err.message);
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
}), 1000);
setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
    if (!process.env.HOST_ID || !process.env.IDENTTITY_ID || !process.env.CRED_PROVIDER_HOST || !process.env.PROPERTY_CODE) {
        yield initializationService.intializeEnvVar();
    }
}), 300000);
setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield assetsService.discoverCameras(process.env.HOST_ID);
    }
    catch (err) {
        console.error(err.name);
        console.error(err.message);
        console.error(err.stack);
        console.trace();
    }
}), 300000);
