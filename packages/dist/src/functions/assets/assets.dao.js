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
const TBL_HOST = process.env.TBL_HOST;
const TBL_ASSET = process.env.TBL_ASSET;
const IDX_EQUIPMENT_ID = process.env.IDX_EQUIPMENT_ID;
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
    createProperty(propertyItem) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao createProperty in' + JSON.stringify(propertyItem));
            const params = [{
                    Put: {
                        TableName: TBL_ASSET,
                        Item: propertyItem
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
    getCamera(hostId, uuid, attributes) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`assets.dao getCamera in: ${JSON.stringify({ hostId, uuid, attributes })}`);
            const data = yield this.ddbDocClient.send(new lib_dynamodb_1.GetCommand({
                TableName: TBL_ASSET,
                AttributesToGet: attributes,
                Key: {
                    hostId,
                    uuid
                }
            }));
            console.log(`assets.dao getCamera out: ${JSON.stringify(data.Item)}`);
            return data.Item;
        });
    }
    createCamera(cameraItem) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao createCamera in' + JSON.stringify(cameraItem));
            const params = [{
                    Put: {
                        TableName: TBL_ASSET,
                        Item: cameraItem
                    }
                }];
            const response = yield this.ddbDocClient.send(new lib_dynamodb_1.TransactWriteCommand({ TransactItems: params }));
            console.log('assets.dao createCamera response:' + JSON.stringify(response));
            console.log(`assets.dao createCamera out`);
            return;
        });
    }
    getCameras(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao getCameras in:' + hostId);
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
                    ':category': 'CAMERA'
                }
            }));
            console.log('assets.dao getCameras out:' + JSON.stringify(response.Items));
            return response.Items;
        });
    }
    deleteCameras(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao deleteCameras in:' + hostId);
            const cameraItems = yield this.getCameras(hostId);
            const deleteResponse = yield Promise.all(cameraItems.map((cameraItem) => __awaiter(this, void 0, void 0, function* () {
                const param = {
                    TableName: TBL_ASSET,
                    Key: {
                        hostId: cameraItem.hostId,
                        uuid: cameraItem.uuid
                    }
                };
                return yield this.ddbDocClient.send(new lib_dynamodb_1.DeleteCommand(param));
            })));
            console.log('assets.dao deleteCameras delete response:' + JSON.stringify(deleteResponse));
            console.log('assets.dao deleteCameras out');
            return;
        });
    }
    getScannerById(equipmentId, attributes) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`assets.dao getScannerById in: ${JSON.stringify({ equipmentId, attributes })}`);
            const data = yield this.ddbDocClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: TBL_ASSET,
                IndexName: IDX_EQUIPMENT_ID,
                ProjectionExpression: attributes === null || attributes === void 0 ? void 0 : attributes.join(),
                KeyConditionExpression: '#hkey = :hkey',
                ExpressionAttributeNames: {
                    '#hkey': 'equipmentId'
                },
                ExpressionAttributeValues: {
                    ':hkey': equipmentId
                }
            }));
            if (((_a = data.Items) === null || _a === void 0 ? void 0 : _a.length) > 0) {
                console.log(`assets.dao getScannerById out: ${JSON.stringify(data.Items)}`);
                return data.Items[0];
            }
            else {
                console.log(`assets.dao getScannerById out: []`);
                return;
            }
        });
    }
    getScanners(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao getScanners in:' + hostId);
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
                    ':category': 'SCANNER'
                }
            }));
            console.log('assets.dao getScanners out:' + JSON.stringify(response.Items));
            return response.Items;
        });
    }
    createScanner(scannerItem) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao createScanner in' + JSON.stringify(scannerItem));
            const params = [{
                    Put: {
                        TableName: TBL_ASSET,
                        Item: scannerItem
                    }
                }];
            const response = yield this.ddbDocClient.send(new lib_dynamodb_1.TransactWriteCommand({ TransactItems: params }));
            console.log('assets.dao createScanner response:' + JSON.stringify(response));
            console.log(`assets.dao createScanner out`);
            return scannerItem;
        });
    }
    deleteScanners(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao deleteScanners in:' + hostId);
            const scannerItems = yield this.getScanners(hostId);
            const deleteResponse = yield Promise.all(scannerItems.map((scannerItem) => __awaiter(this, void 0, void 0, function* () {
                const param = {
                    TableName: TBL_ASSET,
                    Key: {
                        hostId: scannerItem.hostId,
                        uuid: scannerItem.uuid
                    }
                };
                return yield this.ddbDocClient.send(new lib_dynamodb_1.DeleteCommand(param));
            })));
            console.log('assets.dao deleteScanners delete response:' + JSON.stringify(deleteResponse));
            console.log('assets.dao deleteScanners out');
            return;
        });
    }
    updateHost({ hostId, identityId, stage, credProviderHost }) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('initialization.dao updateHost in:' + JSON.stringify({ hostId, identityId, stage, credProviderHost }));
            if (!hostId) {
                console.log('initialization.dao updateHost out');
                return;
            }
            const params = [{
                    Put: {
                        TableName: TBL_HOST,
                        Item: { hostId, identityId, stage, credProviderHost }
                    }
                }];
            const command = new lib_dynamodb_1.TransactWriteCommand({
                TransactItems: params
            });
            const response = yield this.ddbDocClient.send(command);
            console.log('initialization.dao updateHost response:' + JSON.stringify(response));
            console.log('initialization.dao updateHost out');
            return;
        });
    }
    getHost() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('initialization.dao getHost in');
            const scanParam = {
                TableName: TBL_HOST,
                PageSize: 1
            };
            const scanCmd = new lib_dynamodb_1.ScanCommand(scanParam);
            const scanResult = yield this.ddbDocClient.send(scanCmd);
            let response;
            if (scanResult.Items && scanResult.Items.length > 0) {
                response = scanResult.Items[0];
            }
            if (!response) {
                throw new Error(`getHost empty`);
            }
            console.log('initialization.dao getHost out:' + JSON.stringify(response));
            return response;
        });
    }
}
exports.AssetsDao = AssetsDao;
