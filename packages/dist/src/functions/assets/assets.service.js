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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetsService = void 0;
const assets_dao_1 = require("./assets.dao");
const iot_service_1 = require("../iot/iot.service");
const short_unique_id_1 = __importDefault(require("short-unique-id"));
const node_onvif_events_1 = require("node-onvif-events");
const node_onvif_1 = __importDefault(require("node-onvif"));
const axios_1 = __importDefault(require("axios"));
const util_1 = require("util");
class AssetsService {
    // private lastMotionTime: number | null = null;
    // private timer: NodeJS.Timeout | null = null;
    constructor() {
        this.assetsDao = new assets_dao_1.AssetsDao();
        this.iotService = new iot_service_1.IotService();
        this.uid = new short_unique_id_1.default();
    }
    getHost() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service getHost in');
            const rtn = yield this.assetsDao.getHost();
            console.log('assets.service saveHost out:' + JSON.stringify(rtn));
            return rtn;
        });
    }
    saveHost({ hostId, identityId, stage, credProviderHost }) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service saveHost in:' + JSON.stringify({ hostId, identityId, stage, credProviderHost }));
            yield this.assetsDao.updateHost({ hostId, identityId, stage, credProviderHost });
            console.log('assets.service saveHost out');
            return;
        });
    }
    saveProperty(hostId, propertyItem) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service saveProperty in: ' + JSON.stringify({ hostId, propertyItem }));
            yield this.assetsDao.deleteProperties(hostId);
            propertyItem.hostId = hostId;
            propertyItem.hostPropertyCode = `${hostId}-${propertyItem.propertyCode}`;
            propertyItem.category = 'PROPERTY';
            yield this.assetsDao.createProperty(propertyItem);
            console.log('assets.service saveProperty out');
            return;
        });
    }
    getProperty(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service getProperty in' + JSON.stringify({ hostId }));
            const propertyItem = yield this.assetsDao.getProperty(hostId);
            console.log('assets.service getProperty out' + JSON.stringify({ propertyItem }));
            return propertyItem;
        });
    }
    refreshCameras(deltaShadowCameras, desiredShadowCameras) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service refreshCameras in: ' + JSON.stringify({ deltaShadowCameras, desiredShadowCameras }));
            const deltaCameraItems = Object.entries(desiredShadowCameras).map(([uuid, cameraItem]) => {
                return cameraItem;
            }).filter((cameraItem) => {
                if (deltaShadowCameras[cameraItem.uuid]) {
                    return true;
                }
                else {
                    return false;
                }
            });
            console.log('assets.service refreshCameras deltaCameraItems: ' + JSON.stringify(deltaCameraItems));
            yield Promise.all(deltaCameraItems.map((cameraItem) => __awaiter(this, void 0, void 0, function* () {
                const existingCamera = yield this.assetsDao.getCamera(cameraItem.hostId, cameraItem.uuid);
                if (existingCamera) {
                    existingCamera.username = cameraItem.username;
                    existingCamera.password = cameraItem.password;
                    existingCamera.rtsp = cameraItem.rtsp;
                    existingCamera.lastUpdateOn = cameraItem.lastUpdateOn;
                    yield this.assetsDao.updateCamera(existingCamera);
                }
                else {
                    yield this.assetsDao.updateCamera(cameraItem);
                }
            })));
            console.log('assets.service refreshCameras out');
            return;
        });
    }
    discoverCameras(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service discoverCameras in: ' + JSON.stringify({ hostId }));
            const discoveredCameras = yield node_onvif_1.default.startProbe();
            yield Promise.allSettled(discoveredCameras.map((discoveredCamera) => __awaiter(this, void 0, void 0, function* () {
                const uuid = discoveredCamera.urn.split(":").slice(-1)[0];
                const parsedUrl = new URL(discoveredCamera.xaddrs[0]);
                const existingCamera = yield this.assetsDao.getCamera(hostId, uuid);
                let cameraItem = {
                    hostId,
                    uuid,
                    propertyCode: process.env.PROPERTY_CODE,
                    hostPropertyCode: `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`,
                    category: 'CAMERA',
                    coreName: process.env.AWS_IOT_THING_NAME,
                    equipmentId: uuid,
                    equipmentName: discoveredCamera.name,
                    localIp: parsedUrl.hostname,
                    username: '',
                    password: '',
                    rtsp: {
                        port: 554,
                        path: '',
                        codec: 'h264',
                        framerate: 10
                    },
                    onvif: {
                        port: parseInt(parsedUrl.port) || 80
                    },
                    lastUpdateOn: (new Date).toISOString()
                };
                if (existingCamera) {
                    const newIp = cameraItem.localIp;
                    const newCoreName = cameraItem.coreName;
                    const propertyCode = cameraItem.propertyCode;
                    const hostPropertyCode = cameraItem.hostPropertyCode;
                    cameraItem = existingCamera;
                    cameraItem.localIp = newIp;
                    cameraItem.lastUpdateOn = (new Date).toISOString();
                    cameraItem.coreName = newCoreName;
                    cameraItem.propertyCode = propertyCode;
                    cameraItem.hostPropertyCode = hostPropertyCode;
                }
                yield this.assetsDao.updateCamera(cameraItem);
                yield this.iotService.publish({
                    topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/camera_detected`,
                    payload: JSON.stringify(cameraItem)
                });
            })));
            console.log('assets.service discoverCameras out');
            return;
        });
    }
    refreshScanner(scannerItem) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service refreshScanner in: ' + JSON.stringify(scannerItem));
            const crtScanner = yield this.assetsDao.getScannerById(scannerItem.equipmentId);
            if (crtScanner) {
                scannerItem.hostId = process.env.HOST_ID;
                scannerItem.propertyCode = process.env.PROPERTY_CODE;
                scannerItem.hostPropertyCode = `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`;
                scannerItem.category = 'SCANNER';
                scannerItem.coreName = process.env.AWS_IOT_THING_NAME;
                scannerItem.uuid = crtScanner.uuid;
                scannerItem.lastUpdateOn = (new Date).toISOString();
            }
            else {
                scannerItem.hostId = process.env.HOST_ID;
                scannerItem.propertyCode = process.env.PROPERTY_CODE;
                scannerItem.hostPropertyCode = `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`;
                scannerItem.category = 'SCANNER';
                scannerItem.coreName = process.env.AWS_IOT_THING_NAME;
                scannerItem.uuid = this.uid.randomUUID(6);
                scannerItem.lastUpdateOn = (new Date).toISOString();
            }
            yield this.assetsDao.createScanner(scannerItem);
            yield this.iotService.publish({
                topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/scanner_detected`,
                payload: JSON.stringify(scannerItem)
            });
            console.log('assets.service refreshScanner out');
            return;
        });
    }
    startOnvif({ hostId, identityId, propertyCode, credProviderHost }) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service startOnvif in: ' + JSON.stringify({ hostId, identityId, propertyCode, credProviderHost }));
            const cameraItems = yield this.assetsDao.getCameras(`${hostId}-${propertyCode}`);
            const hostInfo = {
                hostId,
                identityId,
                propertyCode,
                credProviderHost
            };
            const listenerResponses = yield Promise.allSettled(cameraItems.filter((cameraItem) => {
                if (cameraItem.onvif && cameraItem.localIp && cameraItem.username && cameraItem.password && cameraItem.onvif.port) {
                    return true;
                }
                else {
                    return false;
                }
            }).map((cameraItem, index) => __awaiter(this, void 0, void 0, function* () {
                console.log('assets.service startOnvif cameraItem:' + JSON.stringify(cameraItem));
                const options = {
                    id: index,
                    hostname: cameraItem.localIp,
                    username: cameraItem.username,
                    password: cameraItem.password,
                    port: cameraItem.onvif.port, // Onvif device service port
                };
                console.log('assets.service startOnvif options:' + JSON.stringify(options));
                const detector = yield node_onvif_events_1.MotionDetector.create(options.id, options);
                console.log('>> Motion Detection Listening on ' + options.hostname);
                detector.listen((motion) => __awaiter(this, void 0, void 0, function* () {
                    // const now = Date.now();
                    if (motion) {
                        console.log('assets.service startOnvif request scanner to detect at ' + cameraItem.localIp);
                        const response = yield axios_1.default.post("http://localhost:7777/detect", {
                            cameraItem
                        }).catch(err => {
                            console.log("request scanner err:" + JSON.stringify(err));
                            return { status: "", data: {} };
                        });
                        console.log("request scanner status:" + response.status + " data:" + JSON.stringify(response.data));
                    }
                }));
                return cameraItem;
            })));
            console.log('assets.service startOnvif listenerResponses:' + JSON.stringify((0, util_1.inspect)(listenerResponses)));
            listenerResponses.filter(listenerResponse => {
                if (listenerResponse.status === 'fulfilled') {
                    return true;
                }
                else {
                    return false;
                }
            }).map((listenerResponse) => __awaiter(this, void 0, void 0, function* () {
                console.log('assets.service startOnvif request scanner to start scanner at ' + JSON.stringify(listenerResponse));
                const response = yield axios_1.default.post("http://localhost:7777/start", {
                    hostInfo,
                    cameraItem: listenerResponse['value']
                }).catch(err => {
                    console.log("request scanner err:" + JSON.stringify(err));
                    return { status: "", data: {} };
                });
                console.log("request scanner status:" + response.status + " data:" + JSON.stringify(response.data));
            }));
            console.log('assets.service startOnvif out');
            return;
        });
    }
}
exports.AssetsService = AssetsService;
