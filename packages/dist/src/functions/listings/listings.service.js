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
const ACTION_UPDATE = 'UPDATE';
const ACTION_REMOVE = 'REMOVE';
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
            const promises = Object.keys(deltaShadowListings).map((shadowName) => __awaiter(this, void 0, void 0, function* () {
                const classicShadowListing = desiredShadowListings[shadowName];
                if (classicShadowListing) {
                    try {
                        if (classicShadowListing.action === ACTION_REMOVE) {
                            yield this.processShadowDeleted(classicShadowListing, shadowName);
                        }
                        else if (classicShadowListing.action === ACTION_UPDATE) {
                            yield this.processShadowDelta(classicShadowListing, shadowName);
                        }
                    }
                    catch (err) {
                        return { shadowName, action: classicShadowListing.action, message: err.message, stack: err.stack };
                    }
                    return { shadowName, action: classicShadowListing.action };
                }
            }));
            const results = yield Promise.allSettled(promises);
            console.log('listings.service processListingsShadow results:' + JSON.stringify(results));
            console.log('listings.service processListingsShadow out');
        });
    }
    processShadowDeleted(classicShadowListing, shadowName) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('listings.service processShadowDeleted in: ' + JSON.stringify({ classicShadowListing, shadowName }));
            const listingId = shadowName.replace('listing:', '');
            const syncResult = yield this.listingsDao.deleteListingSpaces(process.env.HOST_ID, listingId).catch(err => {
                console.log('listings.service processShadowDeleted deleteListingSpaces err:' + JSON.stringify(err));
                return { rejectReason: err.message };
            });
            yield this.iotService.publish({
                topic: `gocheckin/${AWS_IOT_THING_NAME}/listing_reset`,
                payload: JSON.stringify({
                    listingId,
                    lastResponse: classicShadowListing.lastRequestOn,
                    lastRequestOn: classicShadowListing.lastRequestOn,
                    rejectReason: syncResult.rejectReason,
                    clearRequest: (syncResult.rejectReason ? false : true)
                })
            });
            console.log('listings.service processShadowDeleted out');
        });
    }
    processShadowDelta(classicShadowListing, shadowName) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('listings.service processShadowDelta in: ' + JSON.stringify({ classicShadowListing, shadowName }));
            const getShadowResult = yield this.iotService.getShadow({
                thingName: AWS_IOT_THING_NAME,
                shadowName: shadowName
            });
            const delta = getShadowResult.state.desired;
            if (!delta || !delta.lastRequestOn || !classicShadowListing.lastRequestOn) {
                console.log('listings.service processShadowDelta missing lastRequestOn, skipping');
                return;
            }
            if (classicShadowListing.lastRequestOn !== delta.lastRequestOn) {
                console.log('listings.service processShadowDelta lastRequestOn mismatch for ' + shadowName + ', skipping');
                return;
            }
            // upsert local ddb listing
            const listingId = delta.listingId || shadowName.replace('listing:', '');
            yield this.listingsDao.upsertListingSpaces({
                hostId: process.env.HOST_ID,
                listingId: listingId,
                spaces: delta.spaces,
                lastUpdateOn: delta.lastRequestOn
            });
            // Update the named shadow reported state
            yield this.iotService.updateReportedShadow({
                thingName: AWS_IOT_THING_NAME,
                shadowName: shadowName,
                reportedState: delta
            });
            yield this.iotService.publish({
                topic: `gocheckin/${AWS_IOT_THING_NAME}/listing_deployed`,
                payload: JSON.stringify({
                    listingId,
                    lastResponse: classicShadowListing.lastRequestOn,
                    lastRequestOn: classicShadowListing.lastRequestOn
                })
            });
            console.log('listings.service processShadowDelta out');
        });
    }
}
exports.ListingsService = ListingsService;
