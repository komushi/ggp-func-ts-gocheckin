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
const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;
const ZB_CATS = process.env.ZB_CATS.split(",");
const ZB_CATS_WITH_KEYPAD = process.env.ZB_CAT_WITH_KEYPAD.split(",");
const assets_dao_1 = require("./assets.dao");
const iot_service_1 = require("../iot/iot.service");
const short_unique_id_1 = __importDefault(require("short-unique-id"));
// import { MotionDetector, Options } from 'node-onvif-events';
const node_onvif_1 = __importDefault(require("node-onvif"));
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
    processSpacesShadowDelta(uuid) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service processSpacesShadowDelta in: ' + JSON.stringify({ uuid }));
            // await this.assetsDao.updateSpace(existingCamera);
            console.log('assets.service processSpacesShadowDelta out');
            return;
        });
    }
    processSpacesShadow(deltaShadowSpaces, desiredShadowSpaces) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service processSpacesShadow in: ' + JSON.stringify({ deltaShadowSpaces, desiredShadowSpaces }));
            const newSpaceUUIDs = Object.keys(desiredShadowSpaces)
                .filter(uuid => desiredShadowSpaces[uuid].action == 'UPDATE');
            const removedSpaceUUIDs = Object.keys(desiredShadowSpaces)
                .filter(uuid => desiredShadowSpaces[uuid].action == 'REMOVE');
            yield this.assetsDao.refreshSpaces(process.env.HOST_ID, newSpaceUUIDs, removedSpaceUUIDs);
            console.log('assets.service processSpacesShadow out');
            return;
        });
    }
    processCamerasShadowDelta(uuid) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service processCamerasShadowDelta in: ' + JSON.stringify({ uuid }));
            const getShadowResult = yield this.iotService.getShadow({
                thingName: AWS_IOT_THING_NAME,
                shadowName: uuid
            });
            const delta = getShadowResult.state.desired;
            let existingCamera = yield this.assetsDao.getCamera(process.env.HOST_ID, uuid);
            if (existingCamera) {
                existingCamera.username = delta.username;
                existingCamera.password = delta.password;
                existingCamera.isDetecting = delta.isDetecting;
                existingCamera.isRecording = delta.isRecording;
                existingCamera.rtsp = delta.rtsp;
                existingCamera.onvif = delta.onvif;
                existingCamera.locks = delta.locks;
                existingCamera.layoutId = delta.layoutId;
                existingCamera.position = delta.position;
                existingCamera.inSpaces = delta.inSpaces;
                existingCamera.lastUpdateOn = delta.lastUpdateOn;
            }
            else {
                existingCamera = delta;
            }
            yield this.assetsDao.updateCamera(existingCamera);
            // Update the named shadow
            yield this.iotService.updateReportedShadow({
                thingName: AWS_IOT_THING_NAME,
                shadowName: uuid,
                reportedState: delta
            });
            yield this.iotService.publish({
                topic: `gocheckin/reset_camera`,
                payload: JSON.stringify({ cam_ip: existingCamera.localIp })
            });
            console.log('assets.service processCamerasShadowDelta out');
            return;
        });
    }
    processCamerasShadowDeleted(uuid) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service processCamerasShadowDeleted in: ' + JSON.stringify({ uuid }));
            yield this.assetsDao.deleteCamera(process.env.HOST_ID, uuid);
            yield this.iotService.publish({
                topic: `gocheckin/reset_camera`,
                payload: JSON.stringify({})
            });
            yield this.iotService.publish({
                topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/camera_removed`,
                payload: JSON.stringify({ uuid: uuid })
            });
            console.log('assets.service processCamerasShadowDeleted out');
            return;
        });
    }
    processCamerasShadow(deltaShadowCameras, desiredShadowCameras) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service processCamerasShadow in: ' + JSON.stringify({ deltaShadowCameras, desiredShadowCameras }));
            const promises = Object.keys(deltaShadowCameras).map((uuid) => __awaiter(this, void 0, void 0, function* () {
                const classicShadowCamera = desiredShadowCameras[uuid];
                if (classicShadowCamera) {
                    try {
                        if (classicShadowCamera.action === 'UPDATE') {
                            yield this.processCamerasShadowDelta(uuid);
                        }
                        else if (classicShadowCamera.action === 'REMOVE') {
                            yield this.processCamerasShadowDeleted(uuid);
                        }
                    }
                    catch (err) {
                        return { uuid, action: classicShadowCamera.action, message: err.message, stack: err.stack };
                    }
                    return { uuid, action: classicShadowCamera.action };
                }
            }));
            const results = yield Promise.allSettled(promises);
            console.log('assets.service processCamerasShadow results:' + JSON.stringify(results));
            console.log('assets.service processCamerasShadow out');
        });
    }
    discoverCameras(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`assets.service discoverCameras in hostId: ${hostId}`);
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
                        codec: 'h265',
                        framerate: 10
                    },
                    onvif: {
                        port: parseInt(parsedUrl.port) || 80,
                        isPullpoint: false,
                        isSubscription: false
                    },
                    locks: {},
                    isDetecting: false,
                    isRecording: false,
                    inSpaces: [],
                    layoutId: 0,
                    position: 0,
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
                    topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/camera_detected`,
                    payload: JSON.stringify(cameraItem)
                });
            })));
            console.log(`assets.service discoverCameras out ${discoveredCameras.length} found`);
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
                topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/scanner_detected`,
                payload: JSON.stringify(scannerItem)
            });
            console.log('assets.service refreshScanner out');
            return;
        });
    }
    discoverZigbee(z2mEvent) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service discoverZigbee in: ' + JSON.stringify(z2mEvent));
            if (z2mEvent.type && z2mEvent.type == 'device_interview') {
                if (z2mEvent.data) {
                    if (z2mEvent.data.status && z2mEvent.data.status == 'successful') {
                        if (z2mEvent.data.supported) {
                            let category = 'UNKNOWN';
                            let withKeypad = false;
                            ZB_CATS.forEach((zbCat) => {
                                if ((process.env[zbCat].split(",")).includes(z2mEvent.data.definition.model)) {
                                    category = zbCat;
                                    if (ZB_CATS_WITH_KEYPAD.includes(zbCat)) {
                                        withKeypad = true;
                                    }
                                }
                            });
                            const z2mLock = {
                                hostId: process.env.HOST_ID,
                                uuid: z2mEvent.data.ieee_address,
                                hostPropertyCode: `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`,
                                propertyCode: process.env.PROPERTY_CODE,
                                equipmentId: z2mEvent.data.ieee_address,
                                equipmentName: z2mEvent.data.friendly_name,
                                coreName: process.env.AWS_IOT_THING_NAME,
                                withKeypad: withKeypad,
                                category: category,
                                vendor: z2mEvent.data.definition.vendor,
                                model: z2mEvent.data.definition.model,
                                state: false,
                                lastUpdateOn: (new Date).toISOString()
                            };
                            yield this.assetsDao.updateLock(z2mLock);
                            yield this.iotService.publish({
                                topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/zb_lock_detected`,
                                payload: JSON.stringify(z2mLock)
                            });
                        }
                    }
                }
            }
            console.log('assets.service discoverZigbee out');
            return;
        });
    }
    renameZigbee(z2mRenamed) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service renameZigbee in: ' + JSON.stringify(z2mRenamed));
            const z2mLocks = yield this.assetsDao.getZbLockByName(z2mRenamed.data.from);
            if (z2mLocks.length == 1) {
                z2mLocks[0].roomCode = z2mRenamed.data.to;
                z2mLocks[0].equipmentName = `${z2mRenamed.data.to}`;
                z2mLocks[0].lastUpdateOn = (new Date).toISOString();
                yield this.assetsDao.updateLock(z2mLocks[0]);
                yield this.iotService.publish({
                    topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/zb_lock_detected`,
                    payload: JSON.stringify(z2mLocks[0])
                });
                console.log('assets.service renameZigbee out ' + JSON.stringify(z2mLocks[0]));
                return;
            }
            console.log('assets.service renameZigbee out');
            return;
        });
    }
    removeZigbee(z2mRemoved) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service removeZigbee in: ' + JSON.stringify(z2mRemoved));
            const z2mLocks = yield this.assetsDao.getZbLockByName(z2mRemoved.data.id);
            if (z2mLocks.length == 1) {
                yield this.assetsDao.deleteZbLock(process.env.HOST_ID, z2mLocks[0].equipmentId);
                yield this.iotService.publish({
                    topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/zb_lock_removed`,
                    payload: JSON.stringify(z2mLocks[0])
                });
            }
            console.log('assets.service removeZigbee out');
            return;
        });
    }
    unlockZbLock(memberDetectedItem) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service unlockZbLock in: ' + JSON.stringify(memberDetectedItem));
            const cameraItem = yield this.assetsDao.getCamera(memberDetectedItem.hostId, memberDetectedItem.equipmentId);
            console.log(`assets.service unlockZbLock locks: ${JSON.stringify(cameraItem.locks)}`);
            let zbLockPromises = [];
            if (cameraItem.locks) {
                zbLockPromises = Object.keys(cameraItem.locks).map((equipmentId) => __awaiter(this, void 0, void 0, function* () {
                    const z2mLock = yield this.assetsDao.getZbLockById(equipmentId);
                    if (z2mLock) {
                        let payload = {};
                        if (z2mLock.state) {
                            payload = {
                                'state': 'ON'
                            };
                            z2mLock.state = false;
                        }
                        else {
                            payload = {
                                'state': 'OFF'
                            };
                            z2mLock.state = true;
                        }
                        yield this.iotService.publish({
                            topic: `zigbee2mqtt/${z2mLock.equipmentName}/set`,
                            payload: JSON.stringify(payload)
                        });
                        yield this.assetsDao.updateLock(z2mLock);
                    }
                }));
            }
            const results = yield Promise.allSettled(zbLockPromises);
            results.forEach((result) => {
                console.log(`assets.service unlockZbLock promises result: ${JSON.stringify(result)}`);
            });
            console.log('assets.service unlockZbLock out');
            return;
        });
    }
}
exports.AssetsService = AssetsService;
