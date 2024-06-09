import { PropertyItem, CameraItem, ScannerItem } from './assets.models';
import { AssetsDao } from './assets.dao';

import ShortUniqueId from 'short-unique-id';
import { MotionDetector, Options } from 'node-onvif-events';

import axios, { AxiosResponse } from 'axios';
import { inspect } from 'util';

export class AssetsService {

  private assetsDao: AssetsDao;
  private uid;
  private lastMotionTime: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  
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

  public async startOnvif(hostId: string): Promise<any> {
    console.log('assets.service startOnvif in: ' + JSON.stringify({hostId}));

    const cameraItems: CameraItem[] = await this.assetsDao.getCameras(hostId);

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
        const now = Date.now();

        console.log('assets.service startOnvif motion:' + motion + ' at ' + cameraItem.ip);

        if (motion) {
          // if (this.timer) {
          //   console.log('assets.service startOnvif timer._destroyed:' + this.timer['_destroyed']);  
          // } else {
          //   console.log('assets.service startOnvif timer null');
          // }

          console.log('assets.service startOnvif motion detected at ' + cameraItem.ip);
          
          if (!this.timer || this.timer['_destroyed']) {;
            this.lastMotionTime = now;
            console.log('assets.service startOnvif request scanner to start scan at ' + cameraItem.ip);
            const response = await axios.post("http://localhost:8888/detect", { motion: true, cameraItem });
            console.log("status:" + response.status + " data:" + response.data);
          }

          // Set a new 10-second timer to call call_remote(false)
          clearTimeout(this.timer);
          this.timer = setTimeout(async () => {
            console.log('assets.service startOnvif request scanner to stop scan at ' + cameraItem.ip + ' by timer');
            const response = await axios.post("http://localhost:8888/detect", { motion: false, cameraItem });
            console.log("status:" + response.status + " data:" + response.data);

          }, 20000);

        } else {
          // Check if the last timer has finished before calling call_remote(false)
          if ((now - this.lastMotionTime) >= 60000) {
            console.log('assets.service startOnvif request scanner to stop scan at ' + cameraItem.ip + ' after 60 seconds');

            clearTimeout(this.timer);
            const response = await axios.post("http://localhost:8888/detect", { motion: false, cameraItem });
            console.log("status:" + response.status + " data:" + response.data);
          }
        }
      });

    }));

    console.log('assets.service startOnvif responses:' + JSON.stringify(inspect(responses)));

    console.log('assets.service startOnvif out');

    return;
  }
}