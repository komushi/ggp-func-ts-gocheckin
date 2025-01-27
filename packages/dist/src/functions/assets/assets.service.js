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
    /*
    public async refreshCameras(deltaShadowCameras: ShadowCameras, desiredShadowCameras: ShadowCameras): Promise<any> {
      console.log('assets.service refreshCameras in: ' + JSON.stringify({deltaShadowCameras, desiredShadowCameras}));
  
      const deltaCameraItems: CameraItem[] = Object.entries(desiredShadowCameras).map(([uuid, cameraItem]: [string, CameraItem]) => {
        return cameraItem;
      }).filter((cameraItem: CameraItem) => {
        if (deltaShadowCameras[cameraItem.uuid]) {
          return true;
        } else {
          return false;
        }
      });
  
      console.log('assets.service refreshCameras deltaCameraItems: ' + JSON.stringify(deltaCameraItems));
  
      await Promise.all(deltaCameraItems.map(async (cameraItem: CameraItem) => {
        
        const existingCamera: CameraItem = await this.assetsDao.getCamera(cameraItem.hostId, cameraItem.uuid);
  
        if (existingCamera) {
          existingCamera.username = cameraItem.username;
          existingCamera.password = cameraItem.password;
          existingCamera.isDetecting = cameraItem.isDetecting;
          existingCamera.isRecording = cameraItem.isRecording;
          existingCamera.rtsp = cameraItem.rtsp;
          existingCamera.onvif = cameraItem.onvif;
          existingCamera.lastUpdateOn = cameraItem.lastUpdateOn;
  
          await this.assetsDao.updateCamera(existingCamera);
        } else {
          await this.assetsDao.updateCamera(cameraItem);
        }
      }));
  
      if (deltaCameraItems.length > 0) {
        await this.iotService.publish({
          topic: 'gocheckin/fetch_cameras',
          payload: ''
        });
      }
  
      console.log('assets.service refreshCameras out');
  
      return;
    }
    */
    processShadowDelta(uuid) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service processShadowDelta in: ' + JSON.stringify({ uuid }));
            const getShadowResult = yield this.iotService.getShadow({
                thingName: AWS_IOT_THING_NAME,
                shadowName: uuid
            });
            const delta = getShadowResult.state.desired;
            const existingCamera = yield this.assetsDao.getCamera(delta.hostId, delta.uuid);
            if (existingCamera) {
                existingCamera.username = delta.username;
                existingCamera.password = delta.password;
                existingCamera.isDetecting = delta.isDetecting;
                existingCamera.isRecording = delta.isRecording;
                existingCamera.rtsp = delta.rtsp;
                existingCamera.onvif = delta.onvif;
                existingCamera.lastUpdateOn = delta.lastUpdateOn;
                yield this.assetsDao.updateCamera(existingCamera);
            }
            else {
                yield this.assetsDao.updateCamera(delta);
            }
            // Update the named shadow
            yield this.iotService.updateReportedShadow({
                thingName: AWS_IOT_THING_NAME,
                shadowName: uuid,
                reportedState: delta
            });
            console.log('assets.service processShadowDelta out');
            return;
        });
    }
    processShadowDeleted(uuid) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service processShadowDeleted in: ' + JSON.stringify({ uuid }));
            const getShadowResult = yield this.iotService.getShadow({
                thingName: AWS_IOT_THING_NAME,
                shadowName: uuid
            });
            const delta = getShadowResult.state.desired;
            yield this.assetsDao.deleteCamera(delta.hostId, uuid);
            yield this.iotService.deleteShadow({
                thingName: AWS_IOT_THING_NAME,
                shadowName: uuid
            }).catch(err => {
                console.log('processShadowDeleted deleteShadow err:' + JSON.stringify(err));
                return;
            });
            console.log('assets.service processShadowDeleted out');
            return;
        });
    }
    processShadow(deltaShadowCameras, desiredShadowCameras) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service processShadow in: ' + JSON.stringify({ deltaShadowCameras, desiredShadowCameras }));
            const promises = Object.keys(deltaShadowCameras).map((uuid) => __awaiter(this, void 0, void 0, function* () {
                const classicShadowCamera = desiredShadowCameras[uuid];
                if (classicShadowCamera) {
                    try {
                        if (!classicShadowCamera.active) {
                            yield this.processShadowDeleted(uuid);
                        }
                        else {
                            yield this.processShadowDelta(uuid);
                        }
                    }
                    catch (err) {
                        return { uuid, action: classicShadowCamera.active, message: err.message, stack: err.stack };
                    }
                    return { uuid, action: classicShadowCamera.active };
                }
            }));
            const results = yield Promise.allSettled(promises);
            console.log('assets.service processShadow results:' + JSON.stringify(results));
            console.log('assets.service processShadow out');
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
                        codec: 'h264',
                        framerate: 10
                    },
                    onvif: {
                        port: parseInt(parsedUrl.port) || 80,
                        isPullpoint: false,
                        isSubscription: false
                    },
                    isDetecting: false,
                    isRecording: false,
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
                topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/scanner_detected`,
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
                            const z2mLock = {
                                hostId: process.env.HOST_ID,
                                uuid: z2mEvent.data.ieee_address,
                                hostPropertyCode: `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`,
                                propertyCode: process.env.PROPERTY_CODE,
                                equipmentId: z2mEvent.data.ieee_address,
                                equipmentName: z2mEvent.data.friendly_name,
                                coreName: process.env.AWS_IOT_THING_NAME,
                                withKeypad: true,
                                category: 'LOCK',
                                lastUpdateOn: (new Date).toISOString()
                            };
                            yield this.assetsDao.updateLock(z2mLock);
                            yield this.iotService.publish({
                                topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/zb_lock_detected`,
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
                    topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/zb_lock_detected`,
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
                    topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/zb_lock_removed`,
                    payload: JSON.stringify(z2mLocks[0])
                });
            }
            console.log('assets.service removeZigbee out');
            return;
        });
    }
}
exports.AssetsService = AssetsService;
