import { DynamoDBClientConfig, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, TransactWriteCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { PropertyItem } from './assets.models';

const TBL_ASSET = process.env.TBL_ASSET;

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

  public async createProperty(hostId: string, property: PropertyItem): Promise<any> {
    console.log('assets.dao createProperty in' + JSON.stringify({hostId, property}));

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

  };

}