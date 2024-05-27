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
exports.ReservationsService = void 0;
const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;
const STAGE = process.env.STAGE;
const ACTION_UPDATE = 'UPDATE';
const ACTION_REMOVE = 'REMOVE';
const reservations_dao_1 = require("./reservations.dao");
const iot_service_1 = require("../iot/iot.service");
const axios_1 = __importDefault(require("axios"));
class ReservationsService {
    constructor() {
        this.reservationsDao = new reservations_dao_1.ReservationsDao();
        this.iotService = new iot_service_1.IotService();
    }
    syncReservation(delta) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.service syncReservation in: ' + JSON.stringify(delta));
            const getShadowResult = yield this.iotService.getShadow({
                thingName: AWS_IOT_THING_NAME
            });
            const syncResults = yield Promise.allSettled(Object.entries(getShadowResult.state.desired.reservations).filter(([reservationCode]) => {
                return Object.keys(delta.state.reservations).includes(reservationCode);
            }).map(([reservationCode, { listingId, lastRequestOn, action }]) => __awaiter(this, void 0, void 0, function* () {
                if (action == ACTION_REMOVE) {
                    const syncResult = yield this.removeReservation({
                        reservationCode,
                        listingId,
                        lastRequestOn
                    }).catch(err => {
                        console.log('removeReservation err:' + JSON.stringify(err));
                        return {
                            rejectReason: err.message
                        };
                    });
                    yield this.iotService.publish({
                        topic: `gocheckin/${process.env.STAGE}/${AWS_IOT_THING_NAME}/reservation_reset`,
                        payload: JSON.stringify({
                            listingId: listingId,
                            reservationCode: reservationCode,
                            lastResponse: lastRequestOn,
                            rejectReason: syncResult.rejectReason,
                            clearRequest: (syncResult.rejectReason ? false : syncResult.clearRequest)
                        })
                    });
                    if (syncResult.rejectReason) {
                        throw new Error(syncResult.rejectReason);
                    }
                    return;
                }
                else if (action == ACTION_UPDATE) {
                    const syncResult = yield this.addReservation({
                        reservationCode,
                        listingId,
                        lastRequestOn
                    }).catch(err => {
                        console.log('addReservation err:' + JSON.stringify(err));
                        return {
                            rejectReason: err.message
                        };
                    });
                    yield this.iotService.publish({
                        topic: `gocheckin/${process.env.STAGE}/${AWS_IOT_THING_NAME}/reservation_deployed`,
                        payload: JSON.stringify({
                            listingId: listingId,
                            reservationCode: reservationCode,
                            lastResponse: lastRequestOn,
                            rejectReason: syncResult.rejectReason
                        })
                    });
                    if (syncResult.rejectReason) {
                        throw new Error(syncResult.rejectReason);
                    }
                    return;
                }
                else {
                    yield this.iotService.publish({
                        topic: `gocheckin/${process.env.STAGE}/${AWS_IOT_THING_NAME}/reservation_deployed`,
                        payload: JSON.stringify({
                            listingId: listingId,
                            reservationCode: reservationCode,
                            lastResponse: lastRequestOn,
                            rejectReason: `Wrong action ${action}!`
                        })
                    });
                    throw new Error(`Wrong reservation action ${action}!`);
                }
            })));
            console.log('syncResults:' + JSON.stringify(syncResults));
            if (syncResults.every(syncResult => {
                return (syncResult.status == 'fulfilled');
            })) {
                yield this.iotService.updateReportedShadow({
                    thingName: AWS_IOT_THING_NAME,
                    reportedState: getShadowResult.state.desired
                });
            }
            console.log('reservations.service syncReservation out');
            return;
        });
    }
    addReservation({ reservationCode, listingId, lastRequestOn }) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.service addReservation in: ' + JSON.stringify({ reservationCode, listingId, lastRequestOn }));
            const getShadowResult = yield this.iotService.getShadow({
                thingName: AWS_IOT_THING_NAME,
                shadowName: reservationCode
            });
            if (!getShadowResult.state.desired ||
                !getShadowResult.state.desired.lastRequestOn ||
                getShadowResult.state.desired.lastRequestOn != lastRequestOn) {
                throw new Error('Request of SyncReservation datetime validation error!');
            }
            let reportedMembers = new Map();
            if (getShadowResult.state.reported) {
                if (getShadowResult.state.reported.members) {
                    reportedMembers = new Map(Object.entries(getShadowResult.state.reported.members));
                }
            }
            let desiredMembers = new Map();
            if (getShadowResult.state.desired) {
                if (getShadowResult.state.desired.members) {
                    desiredMembers = new Map(Object.entries(getShadowResult.state.desired.members));
                }
            }
            let toDeleteMembers = new Map();
            reportedMembers.forEach((value, key) => {
                if (!desiredMembers.has(key)) {
                    toDeleteMembers.set(key, value);
                }
            });
            // delete local ddb members
            yield this.reservationsDao.deleteMembers(Array.from(toDeleteMembers.values()));
            // delete local ddb reservation
            yield this.reservationsDao.updateReservation(getShadowResult.state.desired.reservation);
            // get image and request embedding
            const updatedMemberPromises = [];
            desiredMembers.forEach((value, key) => {
                updatedMemberPromises.push(this.downloadImageAsBase64(value));
            });
            const updatedMemberResponses = (yield Promise.all(updatedMemberPromises)).flatMap(x => x);
            // update local ddb members
            yield this.reservationsDao.updateMembers(updatedMemberResponses);
            // update shadow
            const reportedState = Object.assign({}, getShadowResult.state.delta);
            toDeleteMembers.forEach((_, key) => {
                if (!reportedState['members']) {
                    reportedState['members'] = {};
                }
                reportedState['members'][key] = null;
            });
            yield this.iotService.updateReportedShadow({
                thingName: AWS_IOT_THING_NAME,
                shadowName: reservationCode,
                reportedState: reportedState
            });
            yield Promise.allSettled(updatedMemberResponses.map((memberItem) => __awaiter(this, void 0, void 0, function* () {
                delete memberItem.memberKeyItem;
                delete memberItem.faceImgKey;
                delete memberItem.faceImgUrl;
                delete memberItem.fullName;
                yield this.iotService.publish({
                    topic: `gocheckin/req_face_embeddings`,
                    payload: JSON.stringify(memberItem)
                });
            })));
            console.log('reservations.service addReservation out:' + JSON.stringify({ reservationCode, listingId, lastRequestOn }));
            return { reservationCode, listingId, lastRequestOn };
        });
    }
    removeReservation({ reservationCode, listingId, lastRequestOn }) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.service removeReservation in: ' + JSON.stringify({ reservationCode, listingId, lastRequestOn }));
            const getShadowResult = yield this.iotService.getShadow({
                thingName: AWS_IOT_THING_NAME,
                shadowName: reservationCode
            }).catch(err => {
                console.log('removeReservation getShadow err:' + JSON.stringify(err));
                return;
            });
            if (getShadowResult) {
                if (!getShadowResult.state.desired ||
                    !getShadowResult.state.desired.lastRequestOn ||
                    getShadowResult.state.desired.lastRequestOn != lastRequestOn) {
                    throw new Error('Request of RemoveReservation datetime validation error!');
                }
            }
            // update local ddb
            yield this.reservationsDao.deleteReservation({
                listingId: listingId,
                reservationCode: reservationCode
            });
            const memberItems = yield this.reservationsDao.getMembers(reservationCode);
            yield this.reservationsDao.deleteMembers(memberItems);
            yield this.iotService.deleteShadow({
                thingName: AWS_IOT_THING_NAME,
                shadowName: reservationCode
            }).catch(err => {
                console.log('removeReservation deleteShadow err:' + JSON.stringify(err));
                return;
            });
            console.log('reservations.service removeReservation out:' + JSON.stringify({ reservationCode, listingId, lastRequestOn, clearRequest: true }));
            return { reservationCode, listingId, lastRequestOn, clearRequest: true };
        });
    }
    downloadImageAsBase64(memberItem) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.service downloadImageAsBase64 in:' + JSON.stringify({ memberItem }));
            try {
                // Download the image
                const response = yield (0, axios_1.default)({
                    url: memberItem.faceImgUrl,
                    method: 'GET',
                    responseType: 'arraybuffer',
                });
                // Convert the image data to a Buffer
                const imageBuffer = Buffer.from(response.data, 'binary');
                // Convert the Buffer to a Base64 encoded string
                memberItem.faceImgBase64 = imageBuffer.toString('base64');
                console.log('reservations.service downloadImageAsBase64 out:' + JSON.stringify({ memberItem }));
                return memberItem;
            }
            catch (error) {
                console.error('Error downloading or processing the image:', error);
                throw error;
            }
        });
    }
}
exports.ReservationsService = ReservationsService;
