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
exports.ListingsService = void 0;
const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;
const listings_dao_1 = require("./listings.dao");
const iot_service_1 = require("../iot/iot.service");
class ListingsService {
    constructor() {
        this.listingsDao = new listings_dao_1.ListingsDao();
        this.iotService = new iot_service_1.IotService();
    }
    /**
     * Process listing shadow delta - syncs spaces mappings for listings
     */
    processListingsShadow(deltaShadowListings, desiredShadowListings) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('listings.service processListingsShadow in: ' + JSON.stringify({ deltaShadowListings, desiredShadowListings }));
            const promises = Object.keys(desiredShadowListings).map((shadowName) => __awaiter(this, void 0, void 0, function* () {
                const listingId = shadowName.replace('listing:', '');
                const getShadowResult = yield this.iotService.getShadow({
                    thingName: AWS_IOT_THING_NAME,
                    shadowName: shadowName
                });
                const delta = getShadowResult.state.desired;
                if (delta && delta.spaces) {
                    yield this.listingsDao.upsertListingSpaces({
                        hostId: process.env.HOST_ID,
                        listingId: delta.listingId || listingId,
                        spaces: delta.spaces,
                        lastUpdateOn: delta.lastRequestOn
                    });
                }
            }));
            yield Promise.all(promises);
            console.log('listings.service processListingsShadow out');
        });
    }
}
exports.ListingsService = ListingsService;
