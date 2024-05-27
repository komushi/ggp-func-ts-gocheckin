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
exports.AssetsDao = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const TBL_ASSET = process.env.TBL_ASSET;
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
class AssetsDao {
    constructor() {
        const client = new client_dynamodb_1.DynamoDBClient(config);
        this.ddbDocClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client, translateConfig);
    }
    getProperty(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao getProperty in' + JSON.stringify({ hostId }));
            const response = yield this.ddbDocClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: TBL_ASSET,
                KeyConditionExpression: '#hkey = :hkey',
                FilterExpression: '#category = :category',
                ExpressionAttributeNames: {
                    '#hkey': 'hostId',
                    '#category': 'category'
                },
                ExpressionAttributeValues: {
                    ':hkey': hostId,
                    ':category': 'PROPERTY'
                }
            }));
            console.log('assets.dao getProperty response:' + JSON.stringify(response));
            if (response.Items.length > 0) {
                console.log('assets.dao getProperty out:' + JSON.stringify(response.Items[0]));
                return response.Items[0];
            }
            else {
                console.log('assets.dao getProperty out');
                return;
            }
        });
    }
    createProperty(hostId, property) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao createProperty in' + JSON.stringify({ hostId, property }));
            const params = [{
                    Put: {
                        TableName: TBL_ASSET,
                        Item: {
                            hostId: hostId,
                            uuid: property.uuid,
                            hostPropertyCode: `${hostId}-${property.propertyCode}`,
                            propertyCode: property.propertyCode,
                            category: 'PROPERTY'
                        }
                    }
                }];
            const response = yield this.ddbDocClient.send(new lib_dynamodb_1.TransactWriteCommand({ TransactItems: params }));
            console.log('assets.dao createProperty response:' + JSON.stringify(response));
            console.log(`assets.dao createProperty out`);
            return;
        });
    }
    deleteProperties(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao deleteProperties in:' + hostId);
            const queryResponse = yield this.ddbDocClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: TBL_ASSET,
                KeyConditionExpression: '#hkey = :hkey',
                FilterExpression: '#category = :category',
                ExpressionAttributeNames: {
                    '#hkey': 'hostId',
                    '#category': 'category'
                },
                ExpressionAttributeValues: {
                    ':hkey': hostId,
                    ':category': 'PROPERTY'
                }
            }));
            console.log('assets.dao deleteProperties query response:' + JSON.stringify(queryResponse));
            const deleteResponse = yield Promise.all(queryResponse.Items.map((item) => __awaiter(this, void 0, void 0, function* () {
                const param = {
                    TableName: TBL_ASSET,
                    Key: {
                        hostId: item.hostId,
                        uuid: item.uuid
                    }
                };
                return yield this.ddbDocClient.send(new lib_dynamodb_1.DeleteCommand(param));
            })));
            console.log('assets.dao deleteProperties delete response:' + JSON.stringify(deleteResponse));
            console.log('assets.dao deleteProperties out');
            return;
        });
    }
    ;
}
exports.AssetsDao = AssetsDao;
