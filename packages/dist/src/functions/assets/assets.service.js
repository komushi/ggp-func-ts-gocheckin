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
class AssetsService {
    constructor() {
        this.lastMotionTime = null;
        this.timer = null;
        this.assetsDao = new assets_dao_1.AssetsDao();
        this.uid = new short_unique_id_1.default();
    }
    saveProperty(hostId, propertyItem) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service saveProperty in' + JSON.stringify({ hostId, propertyItem }));
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
            console.log('assets.service refreshCameras in' + JSON.stringify({ hostId, cameraItems }));
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
    refreshScanners(hostId, scannerItems) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service refreshScanners in' + JSON.stringify({ hostId, scannerItems }));
            yield this.assetsDao.deleteScanners(hostId);
            yield Promise.all(scannerItems.map((scannerItem) => __awaiter(this, void 0, void 0, function* () {
                scannerItem.hostId = process.env.HOST_ID;
                scannerItem.propertyCode = process.env.PROPERTY_CODE;
                scannerItem.hostPropertyCode = `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`;
                scannerItem.category = 'SCANNER';
                scannerItem.coreName = process.env.AWS_IOT_THING_NAME;
                scannerItem.uuid = this.uid.randomUUID(6);
                scannerItem.lastUpdateOn = (new Date).toISOString();
                yield this.assetsDao.createScanner(scannerItem);
            })));
            console.log('assets.service refreshScanners out');
            return;
        });
    }
    startOnvif(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service startOnvif in' + JSON.stringify({ hostId }));
            const cameraItems = yield this.assetsDao.getCameras(hostId);
            yield Promise.all(cameraItems.map((cameraItem, index) => __awaiter(this, void 0, void 0, function* () {
                console.log('assets.service startOnvif cameraItem:' + JSON.stringify(cameraItem));
                if (!cameraItem.onvif) {
                    return;
                }
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
                    if (motion) {
                        if (this.lastMotionTime === null || (now - this.lastMotionTime) > 20000) {
                            // Update the last motion time
                            this.lastMotionTime = now;
                            yield axios_1.default.post("http://localhost:8888/detect", { motion: true });
                            // Clear the previous timer if it exists
                            if (this.timer) {
                                clearTimeout(this.timer);
                            }
                            // Set a new 20-second timer to call call_remote(false)
                            this.timer = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                                yield axios_1.default.post("http://localhost:8888/detect", { motion: false });
                                this.lastMotionTime = null; // Reset the last motion time after calling false
                            }), 20000);
                        }
                    }
                    else {
                        // Check if the last timer has finished before calling call_remote(false)
                        if (!this.timer) {
                            yield axios_1.default.post("http://localhost:8888/detect", { motion: false });
                        }
                    }
                }));
            })));
            console.log('assets.service startOnvif out');
            return;
        });
    }
}
exports.AssetsService = AssetsService;
