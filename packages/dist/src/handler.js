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
const pattern = new RegExp(`^\\$aws/things/${process.env.AWS_IOT_THING_NAME}/shadow/name/[^/]+/update/delta$`);
exports.function_handler = function (event, context) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('context: ' + JSON.stringify(context));
        if (context.clientContext.Custom.subject.indexOf('init_db') > -1) {
            console.log('init_db event: ' + JSON.stringify(event));
            yield initializationService.createTables();
        }
        else if (context.clientContext.Custom.subject == `$aws/things/${process.env.AWS_IOT_THING_NAME}/shadow/update/delta`) {
            console.log('shadow event delta1: ' + JSON.stringify(event));
            yield processShadow(event);
        }
        else if (pattern.test(context.clientContext.Custom.subject)) {
            console.log('shadow event delta2: ' + JSON.stringify(event));
        }
        else if (context.clientContext.Custom.subject == `gocheckin/scanner_detected`) {
            console.log('scanner_detected event: ' + JSON.stringify(event));
            yield assetsService.refreshScanner(event);
            // } else {
            // 	console.log('unkown event: ' + JSON.stringify(event));
        }
    });
};
const processShadow = function (event) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('processShadow in event: ' + JSON.stringify(event));
        const getShadowResult = yield iotService.getShadow({
            thingName: process.env.AWS_IOT_THING_NAME
        });
        if (getShadowResult.state.desired.host && getShadowResult.state.desired.stage) {
            process.env.HOST_ID = getShadowResult.state.desired.host.hostId;
            process.env.STAGE = getShadowResult.state.desired.stage;
            yield initializationService.saveHost({
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
            yield assetsService.saveProperty(getShadowResult.state.desired.host.hostId, getShadowResult.state.desired.property).catch(err => {
                console.error('saveProperty error:' + err.message);
                throw err;
            });
        }
        if (getShadowResult.state.desired.cameras) {
            yield assetsService.refreshCameras(getShadowResult.state.desired.cameras).catch(err => {
                console.error('refreshCameras error:' + err.message);
                throw err;
            });
        }
        if (!event.state.reservations) {
            delete getShadowResult.state.desired.reservations;
            yield iotService.updateReportedShadow({
                thingName: process.env.AWS_IOT_THING_NAME,
                reportedState: getShadowResult.state.desired
            });
        }
        if (event) {
            yield reservationsService.syncReservation(event);
        }
    });
};
setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const initializationService = new initialization_service_1.InitializationService();
        yield initializationService.intializeEnvVar();
        console.log('after intializeEnvVar HOST_ID:' + process.env.HOST_ID);
        console.log('after intializeEnvVar IDENTTITY_ID:' + process.env.IDENTTITY_ID);
        console.log('after intializeEnvVar STAGE:' + process.env.STAGE);
        console.log('after intializeEnvVar PROPERTY_CODE:' + process.env.PROPERTY_CODE);
        console.log('after intializeEnvVar CRED_PROVIDER_HOST:' + process.env.CRED_PROVIDER_HOST);
        const assetsService = new assets_service_1.AssetsService();
        yield assetsService.discoverCameras(process.env.HOST_ID);
        yield assetsService.startOnvif({
            hostId: process.env.HOST_ID,
            identityId: process.env.IDENTTITY_ID,
            propertyCode: process.env.PROPERTY_CODE,
            credProviderHost: process.env.CRED_PROVIDER_HOST
        });
    }
    catch (err) {
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
        console.error(err.name);
        console.error(err.message);
        console.error(err.stack);
        console.trace();
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
    }
}), 5000);
/*
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
*/ 
