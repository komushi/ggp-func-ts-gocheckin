import { DynamoDBClientConfig, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ListingSpaces, Space } from './listings.models';

const TBL_LISTING = process.env.TBL_LISTING;

const config: DynamoDBClientConfig = {
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

export class ListingsDao {
  private ddbDocClient: DynamoDBDocumentClient;

  public constructor() {
    const client: DynamoDBClient = new DynamoDBClient(config);
    this.ddbDocClient = DynamoDBDocumentClient.from(client, translateConfig);
  }

  /**
   * Store listing spaces mapping in local DDB
   * Uses TBL_LISTING (PK: hostId, SK: listingId) to store which spaces belong to each listing
   */
  public async upsertListingSpaces(data: ListingSpaces): Promise<any> {
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

    await this.ddbDocClient.send(new PutCommand(param));

    console.log('listings.dao upsertListingSpaces out');
  }

  /**
   * Delete listing spaces from local DDB
   */
  public async deleteListingSpaces(hostId: string, listingId: string): Promise<any> {
    console.log('listings.dao deleteListingSpaces in:', { hostId, listingId });

    const param = {
      TableName: TBL_LISTING,
      Key: {
        hostId,
        listingId
      }
    };

    await this.ddbDocClient.send(new DeleteCommand(param));

    console.log('listings.dao deleteListingSpaces out');
  }

  /**
   * Fetch spaces for a listing from local DDB
   */
  public async getListingSpaces(hostId: string, listingId: string): Promise<Space[]> {
    console.log('listings.dao getListingSpaces in:', { hostId, listingId });

    const response = await this.ddbDocClient.send(
      new GetCommand({
        TableName: TBL_LISTING,
        Key: {
          hostId,
          listingId
        }
      })
    );

    const spaces = response.Item?.spaces || [];
    console.log('listings.dao getListingSpaces out:', JSON.stringify(spaces));
    return spaces;
  }
}