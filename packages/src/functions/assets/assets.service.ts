import { PropertyItem, CameraItem, ScannerItem } from './assets.models';
import { AssetsDao } from './assets.dao';

import ShortUniqueId from 'short-unique-id';
import { MotionDetector, Options } from 'node-onvif-events';

import axios, { AxiosResponse } from 'axios';
import { inspect } from 'util';

export class AssetsService {

  private assetsDao: AssetsDao;
  private uid;
  // private lastMotionTime: number | null = null;
  // private timer: NodeJS.Timeout | null = null;
  
  public constructor() {
    this.assetsDao = new AssetsDao();

    this.uid = new ShortUniqueId();
  }

  public async saveProperty(hostId: string, propertyItem: PropertyItem): Promise<any> {
    console.log('assets.service saveProperty in: ' + JSON.stringify({hostId, propertyItem}));

    await this.assetsDao.deleteProperties(hostId);

    propertyItem.hostId = hostId;
    propertyItem.hostPropertyCode = `${hostId}-${propertyItem.propertyCode}`;
    propertyItem.category = 'PROPERTY';

    await this.assetsDao.createProperty(propertyItem);

    console.log('assets.service saveProperty out');

    return;
  }

  public async getProperty(hostId: string): Promise<any> {
    console.log('assets.service getProperty in' + JSON.stringify({hostId}));

    const propertyItem: PropertyItem = await this.assetsDao.getProperty(hostId);

    console.log('assets.service getProperty out' + JSON.stringify({propertyItem}));

    return propertyItem;
  }

  public async refreshCameras(hostId: string, cameraItems: CameraItem[]): Promise<any> {
    console.log('assets.service refreshCameras in: ' + JSON.stringify({hostId, cameraItems}));

    await this.assetsDao.deleteCameras(hostId);

    await Promise.all(cameraItems.map(async (cameraItem: CameraItem) => {
      cameraItem.hostId = hostId;
      cameraItem.uuid = this.uid.randomUUID(6);
      cameraItem.category = 'CAMERA';

      await this.assetsDao.createCamera(cameraItem);
    }));

    console.log('assets.service refreshCameras out');

    return;
  }

  public async refreshScanner(scannerItem: ScannerItem): Promise<any> {
    console.log('assets.service refreshScanner in: ' + JSON.stringify(scannerItem));

    const crtScanner:ScannerItem = await this.assetsDao.getScannerById(scannerItem.equipmentId);

    if (crtScanner) {
      scannerItem.lastUpdateOn = (new Date).toISOString();
      scannerItem.uuid = crtScanner.uuid;
      scannerItem.hostId = crtScanner.hostId;
      scannerItem.propertyCode = crtScanner.propertyCode;
      scannerItem.hostPropertyCode = crtScanner.hostPropertyCode;
      scannerItem.category = crtScanner.category;
      scannerItem.coreName = crtScanner.coreName;
    } else {                                                                                      
      scannerItem.hostId = process.env.HOST_ID;
      scannerItem.propertyCode = process.env.PROPERTY_CODE;
      scannerItem.hostPropertyCode = `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`;
      scannerItem.category = 'SCANNER';
      scannerItem.coreName = process.env.AWS_IOT_THING_NAME;
      scannerItem.uuid = this.uid.randomUUID(6);
      scannerItem.lastUpdateOn = (new Date).toISOString();
    }
      
    await this.assetsDao.createScanner(scannerItem);

    console.log('assets.service refreshScanner out: ' + JSON.stringify(scannerItem));

    return scannerItem;
  }

  public async startOnvif({hostId, identityId, propertyCode, thingName}: {hostId: string, identityId: string, propertyCode: string, thingName: string}): Promise<any> {
    console.log('assets.service startOnvif in: ' + JSON.stringify({hostId, identityId, propertyCode, thingName}));

    const cameraItems: CameraItem[] = await this.assetsDao.getCameras(hostId);

    const hostInfo = {
      hostId,
      identityId,
      propertyCode
    }

    const responses = await Promise.allSettled(cameraItems.filter((cameraItem: CameraItem) => {
      if (cameraItem.onvif) {
        return true;
      } else {
        return false;
      }
    }).map(async (cameraItem: CameraItem, index: number) => {
      console.log('assets.service startOnvif cameraItem:' + JSON.stringify(cameraItem));

      const options: Options = {
        id: index,                      // Any number id
        hostname: cameraItem.ip,  // IP Address of device
        username: cameraItem.username,          // User
        password: cameraItem.password,       // Password
        port: cameraItem.onvif.port,                   // Onvif device service port
      };

      console.log('assets.service startOnvif options:' + JSON.stringify(options));

      const detector = await MotionDetector.create(options.id, options);

      console.log('>> Motion Detection Listening on ' + options.hostname);

      detector.listen(async (motion: boolean) => {
        // const now = Date.now();

        if (motion) {
          // console.log('assets.service startOnvif motion detected at ' + cameraItem.ip);
          // this.lastMotionTime = now;
          console.log('assets.service startOnvif request scanner to start scan at ' + cameraItem.ip);
          const response = await axios.post(
            "http://localhost:7777/detect", 
            { motion: true, cameraItem, hostInfo })
          .catch(err => {
            console.log("request scanner err:" + JSON.stringify(err));
            return { status: "", data: {}};
          });
          console.log("request scannerstatus:" + response.status + " data:" + JSON.stringify(response.data));

        }
      });

    }));

    console.log('assets.service startOnvif responses:' + JSON.stringify(inspect(responses)));

    console.log('assets.service startOnvif out');

    return;
  }
}