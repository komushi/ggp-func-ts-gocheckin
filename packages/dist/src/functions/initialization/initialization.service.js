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
exports.InitializationService = void 0;
const initialization_dao_1 = require("./initialization.dao");
const assets_service_1 = require("../assets/assets.service");
class InitializationService {
    constructor() {
        this.initializationDao = new initialization_dao_1.InitializationDao();
        this.assetsService = new assets_service_1.AssetsService();
    }
    createTables() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`initialization.service createTables in`);
            yield this.initializationDao.createTables();
            console.log(`initialization.service createTables out`);
            return;
        });
    }
    saveHost({ hostId, identityId, stage, credProviderHost }) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('initialization.service saveHost in:' + JSON.stringify({ hostId, identityId, stage, credProviderHost }));
            yield this.initializationDao.updateHost({ hostId, identityId, stage, credProviderHost });
            console.log('initialization.service saveHost out');
            return;
        });
    }
    intializeEnvVar() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('initialization.service intializeEnvVar in');
            if (!process.env.HOST_ID || !process.env.STAGE || !process.env.IDENTTITY_ID || !process.env.CRED_PROVIDER_HOST) {
                const result = yield this.initializationDao.getHost();
                process.env.HOST_ID = result.hostId;
                process.env.STAGE = result.stage;
                process.env.IDENTTITY_ID = result.identityId;
                process.env.CRED_PROVIDER_HOST = result.credProviderHost;
            }
            if (!process.env.PROPERTY_CODE) {
                if (process.env.HOST_ID) {
                    const property = yield this.assetsService.getProperty(process.env.HOST_ID);
                    if (property) {
                        process.env.PROPERTY_CODE = property.propertyCode;
                        console.log('initialization.service intializeEnvVar Property UUID: ' + property.uuid);
                    }
                }
            }
            console.log('initialization.service intializeEnvVar out');
            return;
        });
    }
}
exports.InitializationService = InitializationService;
