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
exports.ReservationsDao = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const TBL_RESERVATION = process.env.TBL_RESERVATION;
const TBL_MEMBER = process.env.TBL_MEMBER;
const config = {
    endpoint: process.env.DDB_ENDPOINT || 'http://localhost:8080',
};
const marshallOptions = {
    // Whether to automatically convert empty strings, blobs, and sets to `null`.
    convertEmptyValues: false,
    // Whether to remove undefined values while marshalling.
    removeUndefinedValues: true,
    // Whether to convert typeof object to map attribute.
    convertClassInstanceToMap: true, // false, by default.
};
const unmarshallOptions = {
    // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
    wrapNumbers: false, // false, by default.
};
const translateConfig = { marshallOptions, unmarshallOptions };
class ReservationsDao {
    constructor() {
        const client = new client_dynamodb_1.DynamoDBClient(config);
        this.ddbDocClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client, translateConfig);
    }
    getMember(reservationCode, memberNo, attributes) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.dao getMember in' + JSON.stringify({ reservationCode, memberNo, attributes }));
            const command = new lib_dynamodb_1.QueryCommand({
                TableName: TBL_MEMBER,
                ProjectionExpression: attributes === null || attributes === void 0 ? void 0 : attributes.join(),
                KeyConditionExpression: 'reservationCode = :pk AND memberNo = :rk',
                ExpressionAttributeValues: { ':pk': reservationCode, ':rk': memberNo }
            });
            const result = yield this.ddbDocClient.send(command).catch(error => {
                console.log('reservations.dao getMember error:' + JSON.stringify(error));
                throw error;
            });
            console.log('reservations.dao getMember out' + JSON.stringify(result.Items[0]));
            return result.Items[0];
        });
    }
    ;
    getMembers(reservationCode, attributes) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.dao getMembers in' + JSON.stringify({ reservationCode }));
            const command = new lib_dynamodb_1.QueryCommand({
                TableName: TBL_MEMBER,
                ProjectionExpression: attributes === null || attributes === void 0 ? void 0 : attributes.join(),
                KeyConditionExpression: 'reservationCode = :pk',
                ExpressionAttributeValues: { ':pk': reservationCode }
            });
            const result = yield this.ddbDocClient.send(command).catch(error => {
                console.log('reservations.dao getMembers: error:' + JSON.stringify(error));
                throw error;
            });
            console.log('reservations.dao getMembers out' + JSON.stringify(result.Items));
            return result.Items;
        });
    }
    ;
    updateMembers(memberItems) {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log('reservations.dao updateMembers in' + JSON.stringify(memberItems));
            console.log('reservations.dao updateMembers in memberItems.length:' + memberItems.length);
            const params = memberItems.map(record => {
                return {
                    Put: {
                        TableName: TBL_MEMBER,
                        Item: record
                    }
                };
            });
            const command = new lib_dynamodb_1.TransactWriteCommand({
                TransactItems: params
            });
            yield this.ddbDocClient.send(command).catch(error => {
                console.log('reservations.dao updateMembers: error:' + JSON.stringify(error));
                throw error;
            });
            console.log('reservations.dao updateMembers out');
            return;
        });
    }
    ;
    deleteMembers(memberItems) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.dao deleteMembers in memberItems.length:' + memberItems.length);
            const params = memberItems.map(record => {
                return {
                    TableName: TBL_MEMBER,
                    Key: {
                        reservationCode: record.reservationCode,
                        memberNo: record.memberNo
                    }
                };
            });
            yield Promise.all(params.map((param) => __awaiter(this, void 0, void 0, function* () {
                const command = new lib_dynamodb_1.DeleteCommand(param);
                return yield this.ddbDocClient.send(command);
            })));
            console.log('reservations.dao deleteMembers out');
            return;
        });
    }
    ;
    deleteReservation({ listingId, reservationCode }) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.dao deleteReservation in:' + JSON.stringify({ listingId, reservationCode }));
            const param = {
                TableName: TBL_RESERVATION,
                Key: {
                    reservationCode: reservationCode,
                    listingId: listingId
                }
            };
            const command = new lib_dynamodb_1.DeleteCommand(param);
            yield this.ddbDocClient.send(command);
            console.log('reservations.dao deleteReservation out');
            return;
        });
    }
    ;
    updateReservation(reservationItem) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.dao updateReservation in' + JSON.stringify(reservationItem));
            const params = [{
                    Put: {
                        TableName: TBL_RESERVATION,
                        Item: reservationItem
                    }
                }];
            const command = new lib_dynamodb_1.TransactWriteCommand({
                TransactItems: params
            });
            yield this.ddbDocClient.send(command).catch(error => {
                console.log('reservations.dao updateReservation: error:' + JSON.stringify(error));
                throw error;
            });
            console.log('reservations.dao updateReservation out');
            return;
        });
    }
    ;
    getReservation({ reservationCode, listingId }) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('reservations.dao getReservation in' + JSON.stringify({ reservationCode, listingId }));
            const command = new lib_dynamodb_1.QueryCommand({
                TableName: TBL_RESERVATION,
                KeyConditionExpression: 'listingId = :pk and reservationCode = :rk',
                ExpressionAttributeValues: { ':pk': listingId, ':rk': reservationCode }
            });
            const result = yield this.ddbDocClient.send(command);
            console.log('reservations.dao getReservation out' + JSON.stringify(result.Items));
            return result.Items;
        });
    }
    ;
}
exports.ReservationsDao = ReservationsDao;
