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
exports.ListingsDao = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const TBL_LISTING = process.env.TBL_LISTING;
const config = {
    region: 'local',
    endpoint: process.env.DDB_ENDPOINT || 'http://localhost:8080',
    credentials: {
        accessKeyId: 'dummy',
        secretAccessKey: 'dummy'
    }
};
const marshallOptions = {
    convertEmptyValues: false,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
};
const unmarshallOptions = {
    wrapNumbers: false,
};
const translateConfig = { marshallOptions, unmarshallOptions };
class ListingsDao {
    constructor() {
        const client = new client_dynamodb_1.DynamoDBClient(config);
        this.ddbDocClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client, translateConfig);
    }
    /**
     * Store listing spaces mapping in local DDB
     * Uses TBL_LISTING (PK: hostId, SK: listingId) to store which spaces belong to each listing
     */
    upsertListingSpaces(data) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('listings.dao upsertListingSpaces in:', JSON.stringify(data));
            const param = {
                TableName: TBL_LISTING,
                Item: {
                    hostId: data.hostId,
                    listingId: data.listingId,
                    spaces: data.spaces,
                    lastUpdateOn: data.lastUpdateOn
                }
            };
            yield this.ddbDocClient.send(new lib_dynamodb_1.PutCommand(param));
            console.log('listings.dao upsertListingSpaces out');
        });
    }
    /**
     * Delete listing spaces from local DDB
     */
    deleteListingSpaces(hostId, listingId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('listings.dao deleteListingSpaces in:', { hostId, listingId });
            const param = {
                TableName: TBL_LISTING,
                Key: {
                    hostId,
                    listingId
                }
            };
            yield this.ddbDocClient.send(new lib_dynamodb_1.DeleteCommand(param));
            console.log('listings.dao deleteListingSpaces out');
        });
    }
    /**
     * Fetch spaces for a listing from local DDB
     */
    getListingSpaces(hostId, listingId) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            console.log('listings.dao getListingSpaces in:', { hostId, listingId });
            const response = yield this.ddbDocClient.send(new lib_dynamodb_1.GetCommand({
                TableName: TBL_LISTING,
                Key: {
                    hostId,
                    listingId
                }
            }));
            const spaces = ((_a = response.Item) === null || _a === void 0 ? void 0 : _a.spaces) || [];
            console.log('listings.dao getListingSpaces out:', JSON.stringify(spaces));
            return spaces;
        });
    }
}
exports.ListingsDao = ListingsDao;
