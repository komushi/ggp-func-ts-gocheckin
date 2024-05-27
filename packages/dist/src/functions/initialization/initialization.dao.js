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
exports.InitializationDao = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const TBL_RESERVATION = process.env.TBL_RESERVATION;
const TBL_MEMBER = process.env.TBL_MEMBER;
const TBL_HOST = process.env.TBL_HOST;
const TBL_ASSET = process.env.TBL_ASSET;
const IDX_HOST_PROPERTYCODE = process.env.IDX_HOST_PROPERTYCODE;
const IDX_ASSET_ID = process.env.IDX_ASSET_ID;
const config = {
    endpoint: process.env.DDB_ENDPOINT || 'http://localhost:8080',
};
// const config = {
//   endpoint: {
//       hostname: process.env.DDB_HOST_NAME,
//       port: process.env.DDB_PORT,
//       path: process.env.DDB_PATH,
//       protocol: process.env.DDB_PROTOCOL
//   }
// };
// const config: DynamoDBClientConfig = {
//   endpoint: process.env.DDB_ENDPOINT || 'http://localhost:8080',
// };
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
class InitializationDao {
    constructor() {
        const client = new client_dynamodb_1.DynamoDBClient(config);
        this.ddbDocClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client, translateConfig);
    }
    createTables() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`initialization.dao createTables in`);
            const hostDeleteCmd = new client_dynamodb_1.DeleteTableCommand({
                TableName: TBL_HOST
            });
            const reservationDeleteCmd = new client_dynamodb_1.DeleteTableCommand({
                TableName: TBL_RESERVATION
            });
            const memberDeleteCmd = new client_dynamodb_1.DeleteTableCommand({
                TableName: TBL_MEMBER
            });
            const assetDeleteCmd = new client_dynamodb_1.DeleteTableCommand({
                TableName: TBL_ASSET
            });
            const hostCmd = new client_dynamodb_1.CreateTableCommand({
                TableName: TBL_HOST,
                KeySchema: [
                    { AttributeName: 'hostId', KeyType: 'HASH' }
                ],
                AttributeDefinitions: [
                    { AttributeName: 'hostId', AttributeType: 'S' }
                ],
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            });
            const reservationCmd = new client_dynamodb_1.CreateTableCommand({
                TableName: TBL_RESERVATION,
                KeySchema: [
                    { AttributeName: 'listingId', KeyType: 'HASH' },
                    { AttributeName: 'reservationCode', KeyType: 'RANGE' }
                ],
                AttributeDefinitions: [
                    { AttributeName: 'listingId', AttributeType: 'S' },
                    { AttributeName: 'reservationCode', AttributeType: 'S' }
                ],
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            });
            const memberCmd = new client_dynamodb_1.CreateTableCommand({
                TableName: TBL_MEMBER,
                KeySchema: [
                    { AttributeName: 'reservationCode', KeyType: 'HASH' },
                    { AttributeName: 'memberNo', KeyType: 'RANGE' }
                ],
                AttributeDefinitions: [
                    { AttributeName: 'memberNo', AttributeType: 'N' },
                    { AttributeName: 'reservationCode', AttributeType: 'S' }
                ],
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                }
            });
            const assetCmd = new client_dynamodb_1.CreateTableCommand({
                TableName: TBL_ASSET,
                KeySchema: [
                    {
                        AttributeName: 'hostId',
                        KeyType: 'HASH'
                    },
                    {
                        AttributeName: 'uuid',
                        KeyType: 'RANGE'
                    }
                ],
                AttributeDefinitions: [
                    {
                        AttributeName: 'uuid',
                        AttributeType: 'S'
                    },
                    {
                        AttributeName: 'hostPropertyCode',
                        AttributeType: 'S'
                    },
                    {
                        AttributeName: 'assetId',
                        AttributeType: 'S'
                    },
                    {
                        AttributeName: 'hostId',
                        AttributeType: 'S'
                    },
                    {
                        AttributeName: 'roomCode',
                        AttributeType: 'S'
                    }
                ],
                ProvisionedThroughput: {
                    ReadCapacityUnits: 5,
                    WriteCapacityUnits: 5
                },
                GlobalSecondaryIndexes: [
                    {
                        IndexName: IDX_ASSET_ID,
                        KeySchema: [
                            {
                                AttributeName: 'assetId',
                                KeyType: 'HASH'
                            },
                            {
                                AttributeName: 'roomCode',
                                KeyType: 'RANGE'
                            }
                        ],
                        Projection: {
                            ProjectionType: 'ALL'
                        },
                        ProvisionedThroughput: {
                            ReadCapacityUnits: 5,
                            WriteCapacityUnits: 5
                        }
                    },
                    {
                        IndexName: IDX_HOST_PROPERTYCODE,
                        KeySchema: [
                            {
                                AttributeName: 'hostPropertyCode',
                                KeyType: 'HASH'
                            },
                            {
                                AttributeName: 'uuid',
                                KeyType: 'RANGE'
                            }
                        ],
                        Projection: {
                            ProjectionType: 'ALL'
                        },
                        ProvisionedThroughput: {
                            ReadCapacityUnits: 5,
                            WriteCapacityUnits: 5
                        }
                    }
                ]
            });
            const deleteResults = yield Promise.allSettled([
                this.ddbDocClient.send(hostDeleteCmd),
                this.ddbDocClient.send(reservationDeleteCmd),
                this.ddbDocClient.send(memberDeleteCmd),
                this.ddbDocClient.send(assetDeleteCmd),
            ]);
            console.log('initialization.dao createTables deleteResults:' + JSON.stringify(deleteResults));
            const createResults = yield Promise.allSettled([
                this.ddbDocClient.send(hostCmd),
                this.ddbDocClient.send(reservationCmd),
                this.ddbDocClient.send(memberCmd),
                this.ddbDocClient.send(assetCmd)
            ]);
            console.log('initialization.dao createTables createResults:' + JSON.stringify(createResults));
            console.log(`initialization.dao createTables out`);
            return;
        });
    }
    ;
    updateHost({ hostId, stage }) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('initialization.dao updateHost in:' + JSON.stringify({ hostId, stage }));
            if (!hostId) {
                console.log('initialization.dao updateHost out');
                return;
            }
            const params = [{
                    Put: {
                        TableName: TBL_HOST,
                        Item: { hostId, stage }
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
    ;
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
    ;
}
exports.InitializationDao = InitializationDao;
