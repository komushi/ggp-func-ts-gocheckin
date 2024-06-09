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
const short_unique_id_1 = __importDefault(require("short-unique-id"));
const node_onvif_events_1 = require("node-onvif-events");
const axios_1 = __importDefault(require("axios"));
const util_1 = require("util");
class AssetsService {
    constructor() {
        this.lastMotionTime = null;
        this.timer = null;
        this.assetsDao = new assets_dao_1.AssetsDao();
        this.uid = new short_unique_id_1.default();
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
    refreshCameras(hostId, cameraItems) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service refreshCameras in: ' + JSON.stringify({ hostId, cameraItems }));
            yield this.assetsDao.deleteCameras(hostId);
            yield Promise.all(cameraItems.map((cameraItem) => __awaiter(this, void 0, void 0, function* () {
                cameraItem.hostId = hostId;
                cameraItem.uuid = this.uid.randomUUID(6);
                cameraItem.category = 'CAMERA';
                yield this.assetsDao.createCamera(cameraItem);
            })));
            console.log('assets.service refreshCameras out');
            return;
        });
    }
    refreshScanner(scannerItem) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service refreshScanner in: ' + JSON.stringify(scannerItem));
            const crtScanner = yield this.assetsDao.getScannerById(scannerItem.equipmentId);
            if (crtScanner) {
                scannerItem.lastUpdateOn = (new Date).toISOString();
                scannerItem.uuid = crtScanner.uuid;
                scannerItem.hostId = crtScanner.hostId;
                scannerItem.propertyCode = crtScanner.propertyCode;
                scannerItem.hostPropertyCode = crtScanner.hostPropertyCode;
                scannerItem.category = crtScanner.category;
                scannerItem.coreName = crtScanner.coreName;
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
            console.log('assets.service refreshScanner out: ' + JSON.stringify(scannerItem));
            return scannerItem;
        });
    }
    startOnvif(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service startOnvif in: ' + JSON.stringify({ hostId }));
            const cameraItems = yield this.assetsDao.getCameras(hostId);
            const responses = yield Promise.allSettled(cameraItems.filter((cameraItem) => {
                if (cameraItem.onvif) {
                    return true;
                }
                else {
                    return false;
                }
            }).map((cameraItem, index) => __awaiter(this, void 0, void 0, function* () {
                console.log('assets.service startOnvif cameraItem:' + JSON.stringify(cameraItem));
                const options = {
                    id: index,
                    hostname: cameraItem.ip,
                    username: cameraItem.username,
                    password: cameraItem.password,
                    port: cameraItem.onvif.port, // Onvif device service port
                };
                console.log('assets.service startOnvif options:' + JSON.stringify(options));
                const detector = yield node_onvif_events_1.MotionDetector.create(options.id, options);
                console.log('>> Motion Detection Listening on ' + options.hostname);
                detector.listen((motion) => __awaiter(this, void 0, void 0, function* () {
                    const now = Date.now();
                    console.log('assets.service startOnvif motion:' + motion + ' at ' + cameraItem.ip);
                    if (motion) {
                        // if (this.timer) {
                        //   console.log('assets.service startOnvif timer._destroyed:' + this.timer['_destroyed']);  
                        // } else {
                        //   console.log('assets.service startOnvif timer null');
                        // }
                        console.log('assets.service startOnvif motion detected at ' + cameraItem.ip);
                        if (!this.timer || this.timer['_destroyed']) {
                            ;
                            this.lastMotionTime = now;
                            console.log('assets.service startOnvif request scanner to start scan at ' + cameraItem.ip);
                            const response = yield axios_1.default.post("http://localhost:8888/detect", { motion: true, cameraItem });
                            console.log(response.status, response.data);
                        }
                        // Set a new 10-second timer to call call_remote(false)
                        clearTimeout(this.timer);
                        this.timer = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                            console.log('assets.service startOnvif request scanner to stop scan at ' + cameraItem.ip + ' by timer');
                            const response = yield axios_1.default.post("http://localhost:8888/detect", { motion: false, cameraItem });
                            console.log(response.status, response.data);
                        }), 20000);
                    }
                    else {
                        // Check if the last timer has finished before calling call_remote(false)
                        if ((now - this.lastMotionTime) >= 60000) {
                            console.log('assets.service startOnvif request scanner to stop scan at ' + cameraItem.ip + ' after 60 seconds');
                            clearTimeout(this.timer);
                            const response = yield axios_1.default.post("http://localhost:8888/detect", { motion: false, cameraItem });
                            console.log(response.status, response.data);
                        }
                    }
                }));
            })));
            console.log('assets.service startOnvif responses:' + JSON.stringify((0, util_1.inspect)(responses)));
            console.log('assets.service startOnvif out');
            return;
        });
    }
}
exports.AssetsService = AssetsService;
