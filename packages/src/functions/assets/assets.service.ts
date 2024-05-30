import { PropertyItem, CameraItem } from './assets.models';
import { AssetsDao } from './assets.dao';

import ShortUniqueId from 'short-unique-id';
import { MotionDetector, Options } from 'node-onvif-events';

import axios, { AxiosResponse } from 'axios';

export class AssetsService {

  private assetsDao: AssetsDao;
  private uid;
  private lastCallTime: number | null = null;
  
  public constructor() {
    this.assetsDao = new AssetsDao();

    this.uid = new ShortUniqueId();
  }

  public async saveProperty(hostId: string, propertyItem: PropertyItem): Promise<any> {
    console.log('assets.service saveProperty in' + JSON.stringify({hostId, propertyItem}));

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

  public async saveCameras(hostId: string, cameraItems: CameraItem[]): Promise<any> {
    console.log('assets.service saveProperty in' + JSON.stringify({hostId, cameraItems}));

    await this.assetsDao.deleteCameras(hostId);

    await Promise.all(cameraItems.map(async (cameraItem: CameraItem) => {
      cameraItem.hostId = hostId;
      cameraItem.uuid = this.uid.randomUUID(6);
      cameraItem.category = 'CAMERA';

      await this.assetsDao.createCamera(cameraItem);
    }));

    console.log('assets.service saveProperty out');

    return;
  }

  public async startOnvif(hostId: string): Promise<any> {
    console.log('assets.service startOnvif in' + JSON.stringify({hostId}));

    const cameraItems: CameraItem[] = await this.assetsDao.getCameras(hostId);

    await Promise.all(cameraItems.map(async (cameraItem: CameraItem, index: number) => {

      console.log('assets.service startOnvif cameraItem:' + JSON.stringify(cameraItem));

      if (!cameraItem.onvif) {
        return;
      }

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
      detector.listen(async (motion) => {
        if (motion) {
          console.log('>> Motion Detected on ' + options.hostname);

          const currentTime = Date.now();

          if (this.lastCallTime === null || (currentTime - this.lastCallTime) > 20000) {
            const response: AxiosResponse = await axios.post("http://localhost:8888/detect", { motion: motion });
            const responseData = response.data;

            console.log('assets.service startOnvif responseData:' + JSON.stringify(responseData));

            this.lastCallTime = currentTime;

            return responseData;
          }


        } else {
          console.log('>> Motion Stopped on ' + options.hostname);

          const currentTime = Date.now();

          if (this.lastCallTime !== null && (currentTime - this.lastCallTime) > 20000) {
            const response: AxiosResponse = await axios.post("http://localhost:8888/detect", { motion: motion });
            const responseData = response.data;

            console.log('assets.service startOnvif responseData:' + JSON.stringify(responseData));

            return responseData;
          }

        }
      });
    }));

    console.log('assets.service startOnvif out');

    return;
  }
}