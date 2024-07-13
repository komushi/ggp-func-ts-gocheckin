import * as greengrass from 'aws-greengrass-core-sdk';
import { IoTDataPlaneClient, GetThingShadowCommand, GetThingShadowCommandInput, GetThingShadowCommandOutput, UpdateThingShadowCommand, UpdateThingShadowCommandInput, UpdateThingShadowCommandOutput, DeleteThingShadowCommand, DeleteThingShadowCommandInput, DeleteThingShadowCommandOutput } from '@aws-sdk/client-iot-data-plane';


export class IotService {

  private iotData;
  private client;
  
  public constructor() {
    // this.reservationsDao = new ReservationsDao();
    this.iotData = new greengrass.IotData();
    this.client = new IoTDataPlaneClient({});
  }

  // public publish = async ({topic, payload}) => {

  public async publish({topic, payload}: {topic: string, payload: string}): Promise<any> {

    console.log('iot.service publish in: ' + JSON.stringify({topic, payload}));

    return new Promise((resolve, reject) => {
      this.iotData.publish({
        topic: topic,
        payload: payload
      }, (err, data) =>{
        if (err) {
          console.log('iot.service publish err:' + JSON.stringify(err));
            reject(err);
        } else {
          console.log('iot.service publish out data:' + JSON.stringify(data));
          resolve(data);
        }
      });
    });

  };

  public async getShadow({thingName, shadowName}: {thingName: string, shadowName?: string}): Promise<any> {

    console.log('iot.service getShadow in: ' + JSON.stringify({thingName, shadowName}));

    const getThingShadowCommandInput: GetThingShadowCommandInput = {
      thingName,
      shadowName
    };

    const command = new GetThingShadowCommand(getThingShadowCommandInput);

    const response: GetThingShadowCommandOutput = await this.client.send(command);

    let result = {};
    if (response) {
      const payloadString = new TextDecoder("utf-8").decode(response.payload);
      result = JSON.parse(payloadString);
    }

    console.log('iot.service getShadow out: result size: ' + Buffer.byteLength(JSON.stringify(result)));

    return result;

  };

  public async updateReportedShadow({thingName, shadowName, reportedState}: {thingName?: string, shadowName?: string, reportedState?: any}): Promise<any> {

    console.log('iot.service updateReportedShadow in:' + JSON.stringify({thingName, shadowName, reportedState}));

    let payload;


    if (reportedState) {
      payload = Buffer.from(JSON.stringify({
          "state": {
              "reported": reportedState
          }
      }));
    }

    const input: UpdateThingShadowCommandInput = {
      thingName,
      shadowName,
      payload
    };

    const command = new UpdateThingShadowCommand(input);

    const response: UpdateThingShadowCommandOutput = await this.client.send(command);

    let result = {};
    if (response) {
      const payloadString = new TextDecoder("utf-8").decode(response.payload);
      result = JSON.parse(payloadString);
    }

    console.log('iot.service updateReportedShadow out: result size:' + Buffer.byteLength(JSON.stringify(result)));

    return result;
  };


  public async deleteShadow({thingName, shadowName}: {thingName: string, shadowName: string}): Promise<any> { 

    console.log('iot.service deleteShadow in:' + JSON.stringify({thingName, shadowName}));

    if (!thingName || !shadowName) {
      throw new Error('Both thingName and shadowName are needed to DeleteThingShadow!!');
    }

    const input: DeleteThingShadowCommandInput = {
      thingName,
      shadowName
    };

    const command: DeleteThingShadowCommand = new DeleteThingShadowCommand(input);

    const response: DeleteThingShadowCommandOutput = await this.client.send(command);

    let result = {};
    if (response) {
      const payloadString = new TextDecoder("utf-8").decode(response.payload);
      result = JSON.parse(payloadString);
    }

    console.log('iot-api.deleteShadow out: result size:' + Buffer.byteLength(JSON.stringify(result)));

    return result;

  };

}