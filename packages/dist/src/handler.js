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
const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;
const STAGE = process.env.STAGE;
const initialization_service_1 = require("./functions/initialization/initialization.service");
const reservations_service_1 = require("./functions/reservations/reservations.service");
const iot_service_1 = require("./functions/iot/iot.service");
const assets_service_1 = require("./functions/assets/assets.service");
exports.function_handler = function (event, context) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('context: ' + JSON.stringify(context));
        const initializationService = new initialization_service_1.InitializationService();
        const iotService = new iot_service_1.IotService();
        const assetsService = new assets_service_1.AssetsService();
        const reservationsService = new reservations_service_1.ReservationsService();
        if (context.clientContext.Custom.subject.indexOf('init_db') > -1) {
            console.log('init_db event: ' + JSON.stringify(event));
            yield initializationService.createTables();
        }
        else if (context.clientContext.Custom.subject == `$aws/things/${AWS_IOT_THING_NAME}/shadow/update/delta`) {
            console.log('shadow event: ' + JSON.stringify(event));
            const getShadowResult = yield iotService.getShadow({
                thingName: AWS_IOT_THING_NAME
            });
            if (getShadowResult.state.desired.hostId && getShadowResult.state.desired.stage) {
                process.env.HOST_ID = getShadowResult.state.desired.hostId;
                process.env.STAGE = getShadowResult.state.desired.stage;
                yield initializationService.intializeHost({
                    hostId: getShadowResult.state.desired.hostId,
                    stage: getShadowResult.state.desired.stage
                }).catch(err => {
                    console.error('intializeHost error:' + err.message);
                    throw err;
                });
            }
            if (getShadowResult.state.desired.property) {
                process.env.PROPERTY_CODE = getShadowResult.state.desired.property.propertyCode;
                yield assetsService.intializeProperty(getShadowResult.state.desired.hostId, getShadowResult.state.desired.property).catch(err => {
                    console.error('intializeProperty error:' + err.message);
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
                    yield iotService.updateReportedShadow({
                        thingName: AWS_IOT_THING_NAME,
                        reportedState: getShadowResult.state.desired
                    });
                }
            }
            else {
                yield reservationsService.syncReservation(delta);
            }
        }
        else if (context.clientContext.Custom.subject == `gocheckin/scanner_detected`) {
            console.log('scanner_detected event: ' + JSON.stringify(event));
            event.hostId = process.env.HOST_ID;
            event.propertyCode = process.env.PROPERTY_CODE;
            event.hostPropertyCode = `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`;
            event.category = 'SCANNER';
            event.coreName = process.env.AWS_IOT_THING_NAME;
            event.lastUpdateOn = (new Date).toISOString();
            const items = [event];
            yield iotService.publish({
                topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/scanner_detected`,
                payload: JSON.stringify({
                    items: items,
                    equipmentId: event.equipmentId
                })
            });
        }
        else if (context.clientContext.Custom.subject == `gocheckin/res_face_embeddings`) {
            console.log('res_face_embeddings event: ' + JSON.stringify(event));
        }
    });
};
setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('intializeEnvVar before HOST_ID:' + process.env.HOST_ID);
        console.log('intializeEnvVar before STAGE:' + process.env.STAGE);
        console.log('intializeEnvVar before PROPERTY_CODE:' + process.env.PROPERTY_CODE);
        const initializationService = new initialization_service_1.InitializationService();
        yield initializationService.intializeEnvVar();
        console.log('intializeEnvVar after HOST_ID:' + process.env.HOST_ID);
        console.log('intializeEnvVar after STAGE:' + process.env.STAGE);
        console.log('intializeEnvVar after PROPERTY_CODE:' + process.env.PROPERTY_CODE);
    }
    catch (err) {
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
        console.error(err.name);
        console.error(err.message);
        console.error(err.stack);
        console.trace();
        console.error('!!!!!!error happened at intializeEnvVar!!!!!!');
    }
}), 10000);
setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('intializeEnvVar before HOST_ID:' + process.env.HOST_ID);
        console.log('intializeEnvVar before STAGE:' + process.env.STAGE);
        console.log('intializeEnvVar before PROPERTY_CODE:' + process.env.PROPERTY_CODE);
        const initializationService = new initialization_service_1.InitializationService();
        yield initializationService.intializeEnvVar();
        console.log('intializeEnvVar after HOST_ID:' + process.env.HOST_ID);
        console.log('intializeEnvVar after STAGE:' + process.env.STAGE);
        console.log('intializeEnvVar after PROPERTY_CODE:' + process.env.PROPERTY_CODE);
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