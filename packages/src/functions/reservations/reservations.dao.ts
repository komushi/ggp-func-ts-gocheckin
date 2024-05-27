import { DynamoDBClientConfig, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, TransactWriteCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { MemberItem, ReservationItem } from './reservations.models';

const TBL_RESERVATION = process.env.TBL_RESERVATION;
const TBL_MEMBER = process.env.TBL_MEMBER;

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

export class ReservationsDao {

  private ddbDocClient: DynamoDBDocumentClient;
  
  public constructor() {
    const client: DynamoDBClient = new DynamoDBClient(config);
    this.ddbDocClient = DynamoDBDocumentClient.from(client, translateConfig);
  }

  public async getMember(reservationCode: string, memberNo: number): Promise<MemberItem> {

    console.log('reservations.dao getMember in' + JSON.stringify({reservationCode, memberNo}));

    const command = new QueryCommand({
      TableName: TBL_MEMBER,
      KeyConditionExpression: 'reservationCode = :pk AND memberNo = :rk',
      ExpressionAttributeValues: {':pk': reservationCode, ':rk': memberNo}
    });

    const result = await this.ddbDocClient.send(command).catch(error => {
        console.log('reservations.dao getMember error:' + JSON.stringify(error))
        throw error;
    });

    console.log('reservations.dao getMember out' + JSON.stringify(result.Items[0]));

    return result.Items[0] as MemberItem;
  };

  public async getMembers(reservationCode: string): Promise<MemberItem[]> {

    console.log('reservations.dao getMembers in' + JSON.stringify({reservationCode}));

    const command = new QueryCommand({
      TableName: TBL_MEMBER,
      KeyConditionExpression: 'reservationCode = :pk',
      ExpressionAttributeValues: {':pk': reservationCode}
    });

    const result = await this.ddbDocClient.send(command).catch(error => {
        console.log('reservations.dao getMembers: error:' + JSON.stringify(error))
        throw error;
    });

    console.log('reservations.dao getMembers out' + JSON.stringify(result.Items));

    return result.Items as MemberItem[];
  };

  public async updateMembers(memberItems: MemberItem[]): Promise<any> {

    console.log('reservations.dao updateMembers in' + JSON.stringify(memberItems));

    const params = memberItems.map(record => {
      return {
        Put: {
            TableName: TBL_MEMBER,
            Item: record
          }
        }
    });

    const command = new TransactWriteCommand({
      TransactItems: params
    });

    await this.ddbDocClient.send(command).catch(error => {
        console.log('reservations.dao updateMembers: error:' + JSON.stringify(error))
        throw error;
    });

    console.log('reservations.dao updateMembers out');

    return;
  };

  
  public async deleteMembers(memberItems: MemberItem[]): Promise<any> {

    console.log('reservations.dao deleteMembers in' + JSON.stringify(memberItems));

    const params = memberItems.map(record => {
      return {
        TableName: TBL_MEMBER,
        Key: {
          reservationCode: record.reservationCode,
          memberNo: record.memberNo
        }
      }
    });

    await Promise.all(params.map(async (param) => {
      const command = new DeleteCommand(param);
      return await this.ddbDocClient.send(command); 

    }));

    console.log('reservations.dao deleteMembers out');

    return;
  };


  public async deleteReservation({listingId, reservationCode}: {listingId: string, reservationCode: string}): Promise<any> {

    console.log('reservations.dao deleteReservation in:' + JSON.stringify({listingId, reservationCode}));

    const param = {
      TableName: TBL_RESERVATION,
      Key: {
        reservationCode: reservationCode,
        listingId: listingId
      }
    };

    const command = new DeleteCommand(param);

    await this.ddbDocClient.send(command);

    console.log('reservations.dao deleteReservation out');

    return;
  };

  public async updateReservation(reservationItem: ReservationItem): Promise<any> {

    console.log('reservations.dao updateReservation in' + JSON.stringify(reservationItem));

    const params = [{
      Put: {
        TableName: TBL_RESERVATION,
        Item: reservationItem
      }
    }];

    const command = new TransactWriteCommand({
      TransactItems: params
    });

    await this.ddbDocClient.send(command).catch(error => {
        console.log('reservations.dao updateReservation: error:' + JSON.stringify(error))
        throw error;
    });

    console.log('reservations.dao updateReservation out');

    return;
  };


  public async getReservation({reservationCode, listingId}): Promise<any> {

    console.log('reservations.dao getReservation in' + JSON.stringify({reservationCode, listingId}));

    const command = new QueryCommand({
      TableName: TBL_RESERVATION,
      KeyConditionExpression: 'listingId = :pk and reservationCode = :rk',
      ExpressionAttributeValues: {':pk': listingId, ':rk': reservationCode}
    });

    const result = await this.ddbDocClient.send(command);

    console.log('reservations.dao getReservation out' + JSON.stringify(result.Items));

    return result.Items;

  };

}