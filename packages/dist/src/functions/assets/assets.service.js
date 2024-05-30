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
class AssetsService {
    constructor() {
        this.assetsDao = new assets_dao_1.AssetsDao();
        this.uid = new short_unique_id_1.default();
    }
    intializeProperty(hostId, propertyItem) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service intializeProperty in' + JSON.stringify({ hostId, propertyItem }));
            yield this.assetsDao.deleteProperties(hostId);
            propertyItem.hostId = hostId;
            propertyItem.hostPropertyCode = `${hostId}-${propertyItem.propertyCode}`;
            propertyItem.category = 'PROPERTY';
            yield this.assetsDao.createProperty(propertyItem);
            console.log('assets.service intializeProperty out');
            return;
        });
    }
    intializeCameras(hostId, cameraItems) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.service intializeProperty in' + JSON.stringify({ hostId, cameraItems }));
            yield this.assetsDao.deleteCameras(hostId);
            yield Promise.all(cameraItems.map((cameraItem) => __awaiter(this, void 0, void 0, function* () {
                cameraItem.hostId = hostId;
                cameraItem.uuid = this.uid.randomUUID(6);
                cameraItem.category = 'CAMERA';
                yield this.assetsDao.createCamera(cameraItem);
            })));
            console.log('assets.service intializeProperty out');
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
}
exports.AssetsService = AssetsService;
