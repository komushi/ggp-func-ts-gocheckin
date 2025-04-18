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
const IDX_EQUIPMENT_NAME = process.env.IDX_EQUIPMENT_NAME;
const IDX_HOST_PROPERTYCODE = process.env.IDX_HOST_PROPERTYCODE;
const config = {
    region: 'local',
    endpoint: process.env.DDB_ENDPOINT || 'http://localhost:8080',
    credentials: {
        accessKeyId: 'dummy',
        secretAccessKey: 'dummy'
    }
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
    updateCamera(cameraItem) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao updateCamera in' + JSON.stringify(cameraItem));
            const params = [{
                    Put: {
                        TableName: TBL_ASSET,
                        Item: cameraItem
                    }
                }];
            const response = yield this.ddbDocClient.send(new lib_dynamodb_1.TransactWriteCommand({ TransactItems: params }));
            console.log('assets.dao updateCamera response:' + JSON.stringify(response));
            console.log(`assets.dao updateCamera out`);
            return;
        });
    }
    getCameras(hostPropertyCode) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao getCameras in:' + hostPropertyCode);
            const response = yield this.ddbDocClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: TBL_ASSET,
                IndexName: IDX_HOST_PROPERTYCODE,
                KeyConditionExpression: '#hkey = :hkey',
                FilterExpression: '#category = :category',
                ExpressionAttributeNames: {
                    '#hkey': 'hostPropertyCode',
                    '#category': 'category'
                },
                ExpressionAttributeValues: {
                    ':hkey': hostPropertyCode,
                    ':category': 'CAMERA'
                }
            }));
            console.log('assets.dao getCameras out:' + JSON.stringify(response.Items));
            return response.Items;
        });
    }
    deleteCamera(hostId, uuid) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao deleteCamera in:' + JSON.stringify({ hostId, uuid }));
            const param = {
                TableName: TBL_ASSET,
                Key: {
                    hostId: hostId,
                    uuid: uuid
                }
            };
            const deleteResponse = yield this.ddbDocClient.send(new lib_dynamodb_1.DeleteCommand(param));
            console.log('assets.dao deleteCamera delete response:' + JSON.stringify(deleteResponse));
            console.log('assets.dao deleteCamera out');
            return;
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
            console.log('assets.dao updateHost in:' + JSON.stringify({ hostId, identityId, stage, credProviderHost }));
            if (!hostId) {
                console.log('assets.dao updateHost out');
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
            console.log('assets.dao updateHost response:' + JSON.stringify(response));
            console.log('assets.dao updateHost out');
            return;
        });
    }
    getHost() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao getHost in');
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
            console.log('assets.dao getHost out:' + JSON.stringify(response));
            return response;
        });
    }
    getSpaces(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao getSpaces in:' + hostId);
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
                    ':category': 'SPACE'
                }
            }));
            console.log('assets.dao getSpaces out:' + JSON.stringify(response.Items));
            return response.Items;
        });
    }
    refreshSpaces(hostId, newSpaceUUIDs, removedSpaceUUIDs) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao refreshSpaces in:' + JSON.stringify({ hostId, newSpaceUUIDs, removedSpaceUUIDs }));
            const transactItems = [];
            removedSpaceUUIDs === null || removedSpaceUUIDs === void 0 ? void 0 : removedSpaceUUIDs.forEach((uuid) => {
                transactItems.push({
                    Delete: {
                        TableName: TBL_ASSET,
                        Key: {
                            "hostId": hostId,
                            "uuid": uuid
                        }
                    }
                });
            });
            newSpaceUUIDs === null || newSpaceUUIDs === void 0 ? void 0 : newSpaceUUIDs.forEach((uuid) => {
                transactItems.push({
                    Put: {
                        TableName: TBL_ASSET,
                        Item: {
                            "hostId": hostId,
                            "uuid": uuid,
                            "category": "SPACE"
                        }
                    }
                });
            });
            const command = new lib_dynamodb_1.TransactWriteCommand({
                TransactItems: transactItems
            });
            const response = yield this.ddbDocClient.send(command);
            console.log('assets.dao refreshSpaces response:' + JSON.stringify(response));
            console.log('assets.dao refreshSpaces out');
            return;
        });
    }
    deleteSpaces(hostId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao deleteSpaces in:' + hostId);
            const spaces = yield this.getSpaces(hostId);
            const deleteResponse = yield Promise.all(spaces.map((space) => __awaiter(this, void 0, void 0, function* () {
                const param = {
                    TableName: TBL_ASSET,
                    Key: {
                        hostId: space.hostId,
                        uuid: space.uuid
                    }
                };
                return yield this.ddbDocClient.send(new lib_dynamodb_1.DeleteCommand(param));
            })));
            console.log('assets.dao deleteScanners delete response:' + JSON.stringify(deleteResponse));
            console.log('assets.dao deleteScanners out');
            return;
        });
    }
    updateLock(lockItem) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao updateLock in' + JSON.stringify(lockItem));
            const params = [{
                    Put: {
                        TableName: TBL_ASSET,
                        Item: lockItem
                    }
                }];
            const response = yield this.ddbDocClient.send(new lib_dynamodb_1.TransactWriteCommand({ TransactItems: params }));
            console.log('assets.dao updateLock response:' + JSON.stringify(response));
            console.log(`assets.dao updateLock out`);
            return lockItem;
        });
    }
    getZbLock(hostId, uuid, attributes) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`assets.dao getZbLock in: ${JSON.stringify({ hostId, uuid, attributes })}`);
            const data = yield this.ddbDocClient.send(new lib_dynamodb_1.GetCommand({
                TableName: TBL_ASSET,
                AttributesToGet: attributes,
                Key: {
                    hostId,
                    uuid
                }
            }));
            console.log(`assets.dao getZbLock out: ${JSON.stringify(data.Item)}`);
            return data.Item;
        });
    }
    getZbLockById(equipmentId, attributes) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`assets.dao getZbLockById in: ${JSON.stringify({ equipmentId, attributes })}`);
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
                console.log(`assets.dao getZbLockById out: ${JSON.stringify(data.Items)}`);
                return data.Items[0];
            }
            else {
                console.log(`assets.dao getZbLockById out: []`);
                return;
            }
        });
    }
    getZbLockByName(equipmentName) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao getZbLockByName in:' + equipmentName);
            const response = yield this.ddbDocClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: TBL_ASSET,
                IndexName: IDX_EQUIPMENT_NAME,
                KeyConditionExpression: '#en = :en',
                FilterExpression: '#category = :category',
                ExpressionAttributeNames: {
                    '#en': 'equipmentName',
                    '#category': 'category'
                },
                ExpressionAttributeValues: {
                    ':en': equipmentName,
                    ':category': 'LOCK'
                }
            }));
            console.log('assets.dao getZbLockByName out:' + JSON.stringify(response.Items));
            return response.Items;
        });
    }
    deleteZbLock(hostId, uuid) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('assets.dao deleteZbLock in:' + JSON.stringify({ hostId, uuid }));
            const param = {
                TableName: TBL_ASSET,
                Key: {
                    hostId: hostId,
                    uuid: uuid
                }
            };
            const deleteResponse = yield this.ddbDocClient.send(new lib_dynamodb_1.DeleteCommand(param));
            console.log('assets.dao deleteZbLock delete response:' + JSON.stringify(deleteResponse));
            console.log('assets.dao deleteZbLock out');
            return;
        });
    }
}
exports.AssetsDao = AssetsDao;
