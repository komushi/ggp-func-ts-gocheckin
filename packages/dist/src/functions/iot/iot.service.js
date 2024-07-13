"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.IotService = void 0;
const greengrass = __importStar(require("aws-greengrass-core-sdk"));
const client_iot_data_plane_1 = require("@aws-sdk/client-iot-data-plane");
class IotService {
    constructor() {
        // this.reservationsDao = new ReservationsDao();
        this.iotData = new greengrass.IotData();
        this.client = new client_iot_data_plane_1.IoTDataPlaneClient({});
    }
    // public publish = async ({topic, payload}) => {
    publish({ topic, payload }) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('iot.service publish in: ' + JSON.stringify({ topic, payload }));
            return new Promise((resolve, reject) => {
                this.iotData.publish({
                    topic: topic,
                    payload: payload
                }, (err, data) => {
                    if (err) {
                        console.log('iot.service publish err:' + JSON.stringify(err));
                        reject(err);
                    }
                    else {
                        console.log('iot.service publish out data:' + JSON.stringify(data));
                        resolve(data);
                    }
                });
            });
        });
    }
    ;
    getShadow({ thingName, shadowName }) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('iot.service getShadow in: ' + JSON.stringify({ thingName, shadowName }));
            const getThingShadowCommandInput = {
                thingName,
                shadowName
            };
            const command = new client_iot_data_plane_1.GetThingShadowCommand(getThingShadowCommandInput);
            const response = yield this.client.send(command);
            let result = {};
            if (response) {
                const payloadString = new TextDecoder("utf-8").decode(response.payload);
                result = JSON.parse(payloadString);
            }
            console.log('iot.service getShadow out: result size: ' + Buffer.byteLength(JSON.stringify(result)));
            return result;
        });
    }
    ;
    updateReportedShadow({ thingName, shadowName, reportedState }) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('iot.service updateReportedShadow in:' + JSON.stringify({ thingName, shadowName, reportedState }));
            let payload;
            if (reportedState) {
                payload = Buffer.from(JSON.stringify({
                    "state": {
                        "reported": reportedState
                    }
                }));
            }
            const input = {
                thingName,
                shadowName,
                payload
            };
            const command = new client_iot_data_plane_1.UpdateThingShadowCommand(input);
            const response = yield this.client.send(command);
            let result = {};
            if (response) {
                const payloadString = new TextDecoder("utf-8").decode(response.payload);
                result = JSON.parse(payloadString);
            }
            console.log('iot.service updateReportedShadow out: result size:' + Buffer.byteLength(JSON.stringify(result)));
            return result;
        });
    }
    ;
    deleteShadow({ thingName, shadowName }) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('iot.service deleteShadow in:' + JSON.stringify({ thingName, shadowName }));
            if (!thingName || !shadowName) {
                throw new Error('Both thingName and shadowName are needed to DeleteThingShadow!!');
            }
            const input = {
                thingName,
                shadowName
            };
            const command = new client_iot_data_plane_1.DeleteThingShadowCommand(input);
            const response = yield this.client.send(command);
            let result = {};
            if (response) {
                const payloadString = new TextDecoder("utf-8").decode(response.payload);
                result = JSON.parse(payloadString);
            }
            console.log('iot-api.deleteShadow out: result size:' + Buffer.byteLength(JSON.stringify(result)));
            return result;
        });
    }
    ;
}
exports.IotService = IotService;
