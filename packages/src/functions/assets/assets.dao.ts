import { DynamoDBClientConfig, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, TransactWriteCommand, ScanCommand, QueryCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { PropertyItem, NamedShadowCamera, Space, ScannerItem, Z2mLock } from './assets.models';

const TBL_HOST = process.env.TBL_HOST;
const TBL_ASSET = process.env.TBL_ASSET;
const IDX_EQUIPMENT_ID = process.env.IDX_EQUIPMENT_ID;
const IDX_EQUIPMENT_NAME = process.env.IDX_EQUIPMENT_NAME;
const IDX_HOST_PROPERTYCODE = process.env.IDX_HOST_PROPERTYCODE;

const config: DynamoDBClientConfig = {
  endpoint: process.env.DDB_ENDPOINT || 'http://localhost:8080',
};

const marshallOptions = {
  // Whether to automatically convert empty strings, blobs, and sets to `null`.
  convertEmptyValues: false, // false, by default.
  // Whether to remove undefined values while marshalling.
  removeUndefinedValues: true, // false, by default.
  // Whether to convert typeof object to map attribute.
  convertClassInstanceToMap: true, // false, by default.
};

const unmarshallOptions = {
  // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
  wrapNumbers: false, // false, by default.
};

const translateConfig = { marshallOptions, unmarshallOptions };

export class AssetsDao {

  private ddbDocClient: DynamoDBDocumentClient;
  
  public constructor() {
    const client: DynamoDBClient = new DynamoDBClient(config);
    this.ddbDocClient = DynamoDBDocumentClient.from(client, translateConfig);
  }

  public async getProperty(hostId: string): Promise<any> {
    console.log('assets.dao getProperty in' + JSON.stringify({hostId}));

    const response = await this.ddbDocClient.send(
      new QueryCommand({
        TableName: TBL_ASSET,
        KeyConditionExpression: '#hkey = :hkey',
        FilterExpression: '#category = :category',
        ExpressionAttributeNames : {
            '#hkey' : 'hostId',
            '#category': 'category'
        },
        ExpressionAttributeValues: {
          ':hkey': hostId,
          ':category': 'PROPERTY'
        }
      })
    );

    console.log('assets.dao getProperty response:' + JSON.stringify(response));

    if (response.Items.length > 0) {
      console.log('assets.dao getProperty out:' + JSON.stringify(response.Items[0]));

      return response.Items[0] as PropertyItem;

    } else {

      console.log('assets.dao getProperty out');

      return;
    }
  }

  public async createProperty(propertyItem: PropertyItem): Promise<any> {
    console.log('assets.dao createProperty in' + JSON.stringify(propertyItem));

    const params = [{
      Put: {
        TableName: TBL_ASSET,
        Item: propertyItem
      }
    }];

    const response = await this.ddbDocClient.send(new TransactWriteCommand({TransactItems: params}));

    console.log('assets.dao createProperty response:' + JSON.stringify(response));

    console.log(`assets.dao createProperty out`);

    return;
  }

  public async deleteProperties(hostId: string): Promise<any> {

    console.log('assets.dao deleteProperties in:' + hostId);

    const queryResponse = await this.ddbDocClient.send(
      new QueryCommand({
        TableName: TBL_ASSET,
        KeyConditionExpression: '#hkey = :hkey',
        FilterExpression: '#category = :category',
        ExpressionAttributeNames : {
            '#hkey' : 'hostId',
            '#category': 'category'
        },
        ExpressionAttributeValues: {
          ':hkey': hostId,
          ':category': 'PROPERTY'
        }
      })
    );

    console.log('assets.dao deleteProperties query response:' + JSON.stringify(queryResponse));

    const deleteResponse = await Promise.all(queryResponse.Items.map(async (item) => {
      const param = {
        TableName: TBL_ASSET,
        Key: {
          hostId: item.hostId,
          uuid: item.uuid
        }
      };

      return await this.ddbDocClient.send(new DeleteCommand(param)); 

    }));

    console.log('assets.dao deleteProperties delete response:' + JSON.stringify(deleteResponse));

    console.log('assets.dao deleteProperties out');

    return;

  }

  public async getCamera(hostId: string, uuid: string): Promise<any>;
  public async getCamera(hostId: string, uuid: string, attributes: string[]): Promise<any>;
  public async getCamera(hostId: string, uuid: string, attributes?: string[]): Promise<any> {

    console.log(`assets.dao getCamera in: ${JSON.stringify({hostId, uuid, attributes})}`);

    const data = await this.ddbDocClient.send(
      new GetCommand({
				TableName: TBL_ASSET,
				AttributesToGet: attributes,
				Key: {
          hostId,
          uuid
        }
			})
    );

    console.log(`assets.dao getCamera out: ${JSON.stringify(data.Item)}`);

    return data.Item as NamedShadowCamera;

    
  }

  public async updateCamera(cameraItem: NamedShadowCamera): Promise<any> {
    console.log('assets.dao updateCamera in' + JSON.stringify(cameraItem));

    const params = [{
      Put: {
        TableName: TBL_ASSET,
        Item: cameraItem
      }
    }];

    const response = await this.ddbDocClient.send(new TransactWriteCommand({TransactItems: params}));

    console.log('assets.dao updateCamera response:' + JSON.stringify(response));

    console.log(`assets.dao updateCamera out`);

    return;
  }

  public async getCameras(hostPropertyCode: string): Promise<any> {

    console.log('assets.dao getCameras in:' + hostPropertyCode);

    const response = await this.ddbDocClient.send(
      new QueryCommand({
        TableName: TBL_ASSET,
        IndexName: IDX_HOST_PROPERTYCODE,
        KeyConditionExpression: '#hkey = :hkey',
        FilterExpression: '#category = :category',
        ExpressionAttributeNames : {
            '#hkey' : 'hostPropertyCode',
            '#category': 'category'
        },
        ExpressionAttributeValues: {
          ':hkey': hostPropertyCode,
          ':category': 'CAMERA'
        }
      })
    );

    console.log('assets.dao getCameras out:' + JSON.stringify(response.Items));

    return response.Items as NamedShadowCamera[];
  }

  public async deleteCamera(hostId: string, uuid: string): Promise<any> {

    console.log('assets.dao deleteCamera in:' + JSON.stringify({hostId, uuid}));

    const param = {
      TableName: TBL_ASSET,
      Key: {
        hostId: hostId,
        uuid: uuid
      }
    };

    const deleteResponse =  await this.ddbDocClient.send(new DeleteCommand(param)); 

    console.log('assets.dao deleteCamera delete response:' + JSON.stringify(deleteResponse));

    console.log('assets.dao deleteCamera out');

    return;
  }

  public async deleteCameras(hostId: string): Promise<any> {

    console.log('assets.dao deleteCameras in:' + hostId);

    const cameraItems: NamedShadowCamera[] = await this.getCameras(hostId);

    const deleteResponse = await Promise.all(cameraItems.map(async (cameraItem: NamedShadowCamera) => {
      const param = {
        TableName: TBL_ASSET,
        Key: {
          hostId: cameraItem.hostId,
          uuid: cameraItem.uuid
        }
      };

      return await this.ddbDocClient.send(new DeleteCommand(param)); 

    }));

    console.log('assets.dao deleteCameras delete response:' + JSON.stringify(deleteResponse));

    console.log('assets.dao deleteCameras out');

    return;
  }

  public async getScannerById(equipmentId: string): Promise<any>;
  public async getScannerById(equipmentId: string, attributes: string[]): Promise<any>;
  public async getScannerById(equipmentId: string, attributes?: string[]): Promise<any> {

    console.log(`assets.dao getScannerById in: ${JSON.stringify({equipmentId, attributes})}`);

    const data = await this.ddbDocClient.send(
      new QueryCommand({
        TableName: TBL_ASSET,
        IndexName: IDX_EQUIPMENT_ID,
        ProjectionExpression: attributes?.join(),
        KeyConditionExpression: '#hkey = :hkey',
        ExpressionAttributeNames : {
            '#hkey' : 'equipmentId'
        },
        ExpressionAttributeValues: {
          ':hkey': equipmentId
        }
      })
    );

    if (data.Items?.length > 0) {
      console.log(`assets.dao getScannerById out: ${JSON.stringify(data.Items)}`);

      return data.Items[0] as ScannerItem;

    } else {
      console.log(`assets.dao getScannerById out: []`);

      return;
    }
    
  }

  public async getScanners(hostId: string): Promise<any> {

    console.log('assets.dao getScanners in:' + hostId);

    const response = await this.ddbDocClient.send(
      new QueryCommand({
        TableName: TBL_ASSET,
        KeyConditionExpression: '#hkey = :hkey',
        FilterExpression: '#category = :category',
        ExpressionAttributeNames : {
            '#hkey' : 'hostId',
            '#category': 'category'
        },
        ExpressionAttributeValues: {
          ':hkey': hostId,
          ':category': 'SCANNER'
        }
      })
    );

    console.log('assets.dao getScanners out:' + JSON.stringify(response.Items));

    return response.Items as ScannerItem[];

  }

  public async createScanner(scannerItem: ScannerItem): Promise<any> {
    console.log('assets.dao createScanner in' + JSON.stringify(scannerItem));

    const params = [{
      Put: {
        TableName: TBL_ASSET,
        Item: scannerItem
      }
    }];

    const response = await this.ddbDocClient.send(new TransactWriteCommand({TransactItems: params}));

    console.log('assets.dao createScanner response:' + JSON.stringify(response));

    console.log(`assets.dao createScanner out`);

    return scannerItem;
  }

  public async deleteScanners(hostId: string): Promise<any> {

    console.log('assets.dao deleteScanners in:' + hostId);

    const scannerItems: ScannerItem[] = await this.getScanners(hostId);

    const deleteResponse = await Promise.all(scannerItems.map(async (scannerItem: ScannerItem) => {
      const param = {
        TableName: TBL_ASSET,
        Key: {
          hostId: scannerItem.hostId,
          uuid: scannerItem.uuid
        }
      };

      return await this.ddbDocClient.send(new DeleteCommand(param)); 

    }));

    console.log('assets.dao deleteScanners delete response:' + JSON.stringify(deleteResponse));

    console.log('assets.dao deleteScanners out');

    return;
  }


  public async updateHost({hostId, identityId, stage, credProviderHost}: {hostId: string, identityId: string, stage: string, credProviderHost: string}): Promise<any> {

    console.log('assets.dao updateHost in:' + JSON.stringify({hostId, identityId, stage, credProviderHost}));

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

    const command = new TransactWriteCommand({
      TransactItems: params
    });

    const response = await this.ddbDocClient.send(command);  

    console.log('assets.dao updateHost response:' + JSON.stringify(response));

    console.log('assets.dao updateHost out');

    return;

  }

  public async getHost(): Promise<any> {

    console.log('assets.dao getHost in');

    const scanParam = {
      TableName : TBL_HOST,
      PageSize : 1
    };

    const scanCmd = new ScanCommand(scanParam);

    const scanResult = await this.ddbDocClient.send(scanCmd);

    let response;
    if (scanResult.Items && scanResult.Items.length > 0) {
      response = scanResult.Items[0];    
    }

    if (!response) {
      throw new Error(`getHost empty`);
    }

    console.log('assets.dao getHost out:' + JSON.stringify(response));

    return response;

  }

  public async getSpaces(hostId: string): Promise<any> {

    console.log('assets.dao getSpaces in:' + hostId);

    const response = await this.ddbDocClient.send(
      new QueryCommand({
        TableName: TBL_ASSET,
        KeyConditionExpression: '#hkey = :hkey',
        FilterExpression: '#category = :category',
        ExpressionAttributeNames : {
            '#hkey' : 'hostId',
            '#category': 'category'
        },
        ExpressionAttributeValues: {
          ':hkey': hostId,
          ':category': 'SPACE'
        }
      })
    );

    console.log('assets.dao getSpaces out:' + JSON.stringify(response.Items));

    return response.Items as Space[];

  }

  public async deleteSpaces(hostId: string): Promise<any> {

    console.log('assets.dao deleteSpaces in:' + hostId);

    const spaces: Space[] = await this.getSpaces(hostId);

    const deleteResponse = await Promise.all(spaces.map(async (space: Space) => {
      const param = {
        TableName: TBL_ASSET,
        Key: {
          hostId: space.hostId,
          uuid: space.uuid
        }
      };

      return await this.ddbDocClient.send(new DeleteCommand(param)); 

    }));

    console.log('assets.dao deleteScanners delete response:' + JSON.stringify(deleteResponse));

    console.log('assets.dao deleteScanners out');

    return;
  }

  public async updateLock(lockItem: Z2mLock): Promise<any> {
    console.log('assets.dao updateLock in' + JSON.stringify(lockItem));

    const params = [{
      Put: {
        TableName: TBL_ASSET,
        Item: lockItem
      }
    }];

    const response = await this.ddbDocClient.send(new TransactWriteCommand({TransactItems: params}));

    console.log('assets.dao updateLock response:' + JSON.stringify(response));

    console.log(`assets.dao updateLock out`);

    return lockItem;
  }

  public async getZbLock(hostId: string, uuid: string): Promise<any>;
  public async getZbLock(hostId: string, uuid: string, attributes: string[]): Promise<any>;
  public async getZbLock(hostId: string, uuid: string, attributes?: string[]): Promise<any> {

    console.log(`assets.dao getZbLock in: ${JSON.stringify({hostId, uuid, attributes})}`);

    const data = await this.ddbDocClient.send(
      new GetCommand({
				TableName: TBL_ASSET,
				AttributesToGet: attributes,
				Key: {
          hostId,
          uuid
        }
			})
    );

    console.log(`assets.dao getZbLock out: ${JSON.stringify(data.Item)}`);

    return data.Item as Z2mLock;
  }

  public async getZbLockById(equipmentId: string): Promise<any>;
  public async getZbLockById(equipmentId: string, attributes: string[]): Promise<any>;
  public async getZbLockById(equipmentId: string, attributes?: string[]): Promise<any> {

    console.log(`assets.dao getZbLockById in: ${JSON.stringify({equipmentId, attributes})}`);

    const data = await this.ddbDocClient.send(
      new QueryCommand({
        TableName: TBL_ASSET,
        IndexName: IDX_EQUIPMENT_ID,
        ProjectionExpression: attributes?.join(),
        KeyConditionExpression: '#hkey = :hkey',
        ExpressionAttributeNames : {
            '#hkey' : 'equipmentId'
        },
        ExpressionAttributeValues: {
          ':hkey': equipmentId
        }
      })
    );

    if (data.Items?.length > 0) {
      console.log(`assets.dao getZbLockById out: ${JSON.stringify(data.Items)}`);

      return data.Items[0] as Z2mLock;
    } else {
      console.log(`assets.dao getZbLockById out: []`);

      return;
    }
  }

  public async getZbLockByName(equipmentName: string): Promise<any> {

    console.log('assets.dao getZbLockByName in:' + equipmentName);

    const response = await this.ddbDocClient.send(
      new QueryCommand({
        TableName: TBL_ASSET,
        IndexName: IDX_EQUIPMENT_NAME,
        KeyConditionExpression: '#en = :en',
        FilterExpression: '#category = :category',
        ExpressionAttributeNames : {
            '#en' : 'equipmentName',
            '#category': 'category'
        },
        ExpressionAttributeValues: {
          ':en': equipmentName,
          ':category': 'LOCK'
        }
      })
    );

    console.log('assets.dao getZbLockByName out:' + JSON.stringify(response.Items));

    return response.Items as Z2mLock[];
  }

  public async deleteZbLock(hostId: string, uuid: string): Promise<any> {

    console.log('assets.dao deleteZbLock in:' + JSON.stringify({hostId, uuid}));

    const param = {
      TableName: TBL_ASSET,
      Key: {
        hostId: hostId,
        uuid: uuid
      }
    };

    const deleteResponse =  await this.ddbDocClient.send(new DeleteCommand(param)); 

    console.log('assets.dao deleteZbLock delete response:' + JSON.stringify(deleteResponse));

    console.log('assets.dao deleteZbLock out');

    return;
  }


}