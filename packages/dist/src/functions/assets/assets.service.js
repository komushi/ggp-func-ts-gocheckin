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
class AssetsService {
    constructor() {
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
    saveCameras(hostId, cameraItems) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service saveProperty in' + JSON.stringify({ hostId, cameraItems }));
            yield this.assetsDao.deleteCameras(hostId);
            yield Promise.all(cameraItems.map((cameraItem) => __awaiter(this, void 0, void 0, function* () {
                cameraItem.hostId = hostId;
                cameraItem.uuid = this.uid.randomUUID(6);
                cameraItem.category = 'CAMERA';
                yield this.assetsDao.createCamera(cameraItem);
            })));
            console.log('assets.service saveProperty out');
            return;
        });
    }
    startOnvif(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service startOnvif in' + JSON.stringify({ hostId }));
            const cameraItems = yield this.assetsDao.getCameras(hostId);
            yield Promise.allSettled(cameraItems.map((cameraItem, index) => __awaiter(this, void 0, void 0, function* () {
                const options = {
                    id: index,
                    hostname: cameraItem.ip,
                    username: cameraItem.username,
                    password: cameraItem.password,
                    port: cameraItem.onvif.port, // Onvif device service port
                };
                const detector = yield node_onvif_events_1.MotionDetector.create(options.id, options);
                console.log(new Date(), `>> Motion Detection Listening on ${options.hostname}`);
                detector.listen((motion) => {
                    if (motion) {
                        console.log(new Date(), `>> Motion Detected on ${options.hostname}`);
                    }
                    else {
                        console.log(new Date(), `>> Motion Stopped on ${options.hostname}`);
                    }
                });
            })));
            console.log('assets.service startOnvif out');
            return;
        });
    }
}
exports.AssetsService = AssetsService;
