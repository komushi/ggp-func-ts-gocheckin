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
    processShadowDeleted(reservationCode) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.service processShadowDeleted in: ' + JSON.stringify({ reservationCode }));
            const getShadowResult = yield this.iotService.getShadow({
                thingName: AWS_IOT_THING_NAME
            });
            let classicShadowReservation = null;
            if (getShadowResult.state.desired.reservations) {
                const classicShadowReservations = getShadowResult.state.desired.reservations;
                classicShadowReservation = classicShadowReservations[reservationCode];
                if (!classicShadowReservation) {
                    console.log('reservations.service processShadowDeleted out: Request of SyncReservation Classic shadow validation error!');
                    return;
                }
            }
            else {
                console.log('reservations.service processShadowDeleted out: Request of SyncReservation Classic shadow validation error!');
                return;
            }
            if (classicShadowReservation.action == ACTION_REMOVE) {
                const syncResult = yield this.clearReservation(reservationCode, classicShadowReservation.listingId).catch(err => {
                    console.log('reservations.service processShadowDeleted clearReservation err:' + JSON.stringify(err));
                    return {
                        rejectReason: err.message
                    };
                });
                yield this.iotService.publish({
                    topic: `gocheckin/${process.env.STAGE}/${AWS_IOT_THING_NAME}/reservation_reset`,
                    payload: JSON.stringify({
                        listingId: classicShadowReservation.listingId,
                        reservationCode: reservationCode,
                        lastResponse: classicShadowReservation.lastRequestOn,
                        lastRequestOn: classicShadowReservation.lastRequestOn,
                        rejectReason: syncResult.rejectReason,
                        clearRequest: (syncResult.rejectReason ? false : syncResult.clearRequest)
                    })
                });
            }
            else {
                console.log('reservations.service processShadowDeleted out: Wrong reservation action:' + classicShadowReservation.action);
                return;
            }
            console.log('reservations.service processShadowDeleted out');
            return;
        });
    }
    processShadowDelta(delta) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.service processShadowDelta in: ' + JSON.stringify(delta));
            const getShadowResult = yield this.iotService.getShadow({
                thingName: AWS_IOT_THING_NAME
            });
            let classicShadowReservation = null;
            if (getShadowResult.state.desired.reservations) {
                const classicShadowReservations = getShadowResult.state.desired.reservations;
                classicShadowReservation = classicShadowReservations[delta.reservation.reservationCode];
                if (classicShadowReservation) {
                    if (classicShadowReservation.lastRequestOn != delta.lastRequestOn) {
                        console.log('reservations.service processShadowDelta out: Request of SyncReservation datetime validation error!');
                        return;
                    }
                }
                else {
                    console.log('reservations.service processShadowDelta out: Request of SyncReservation Classic shadow validation error!');
                    return;
                }
            }
            else {
                console.log('reservations.service processShadowDelta out: Request of SyncReservation Classic shadow validation error!');
                return;
            }
            if (classicShadowReservation.action == ACTION_UPDATE) {
                const syncResult = yield this.refreshReservation(delta).catch(err => {
                    console.log('reservations.service processShadowDelta refreshReservation err:' + JSON.stringify(err));
                    return {
                        rejectReason: err.message
                    };
                });
                yield this.iotService.publish({
                    topic: `gocheckin/${process.env.STAGE}/${AWS_IOT_THING_NAME}/reservation_deployed`,
                    payload: JSON.stringify({
                        listingId: classicShadowReservation.listingId,
                        reservationCode: delta.reservation.reservationCode,
                        lastResponse: classicShadowReservation.lastRequestOn,
                        lastRequestOn: classicShadowReservation.lastRequestOn,
                        rejectReason: syncResult.rejectReason
                    })
                });
                // Update the named shadow
                yield this.iotService.updateReportedShadow({
                    thingName: AWS_IOT_THING_NAME,
                    shadowName: delta.reservation.reservationCode,
                    reportedState: delta
                });
            }
            else {
                console.log('reservations.service processShadowDelta out: Wrong reservation action:' + classicShadowReservation.action);
                return;
            }
            // Update the classic shadow
            const reportedStateMain = {
                reservations: {}
            };
            reportedStateMain.reservations[delta.reservation.reservationCode] = classicShadowReservation;
            yield this.iotService.updateReportedShadow({
                thingName: AWS_IOT_THING_NAME,
                reportedState: reportedStateMain
            });
            console.log('reservations.service processShadowDelta out');
            return;
        });
    }
    refreshReservation(delta) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.service refreshReservation in: ' + JSON.stringify(delta));
            // delete local ddb members
            const memberItems = yield this.reservationsDao.getMembers(delta.reservation.reservationCode, ['reservationCode', 'memberNo']);
            yield this.reservationsDao.deleteMembers(memberItems);
            // update local ddb members
            yield this.reservationsDao.updateMembers(Object.values(delta.members));
            // update local ddb reservation
            yield this.reservationsDao.updateReservation(delta.reservation);
            const responsesEmbedding = yield Promise.all(Array.from(Object.values(delta.members)).map((memberItem) => __awaiter(this, void 0, void 0, function* () {
                console.warn('reservations.service before recognise:' + JSON.stringify({ reservationCode: memberItem.reservationCode, memberNo: memberItem.memberNo }));
                const response = yield axios_1.default.post("http://localhost:7777/recognise", memberItem);
                const responseData = response.data;
                return responseData;
            })));
            // update local ddb members
            yield this.reservationsDao.updateMembers(responsesEmbedding);
            console.log('reservations.service refreshReservation out');
            return {};
        });
    }
    clearReservation(reservationCode, listingId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.service clearReservation in: ' + JSON.stringify({ reservationCode, listingId }));
            // delete local ddb reservation
            yield this.reservationsDao.deleteReservation({
                listingId: listingId,
                reservationCode: reservationCode
            });
            // delete local db member
            const memberItems = yield this.reservationsDao.getMembers(reservationCode, ['reservationCode', 'memberNo']);
            yield this.reservationsDao.deleteMembers(memberItems);
            yield this.iotService.deleteShadow({
                thingName: AWS_IOT_THING_NAME,
                shadowName: reservationCode
            }).catch(err => {
                console.log('removeReservation deleteShadow err:' + JSON.stringify(err));
                return;
            });
            // force scanner to call fetch_members
            yield Promise.allSettled([''].map(() => __awaiter(this, void 0, void 0, function* () {
                yield axios_1.default.post("http://localhost:7777/recognise");
            })));
            console.log('reservations.service clearReservation out');
            return { clearRequest: true };
        });
    }
}
exports.ReservationsService = ReservationsService;
