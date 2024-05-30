import { PropertyItem, CameraItem } from './assets.models';
import { AssetsDao } from './assets.dao';

import ShortUniqueId from 'short-unique-id';
import { MotionDetector, Options } from 'node-onvif-events';

export class AssetsService {

  private assetsDao: AssetsDao;
  private uid;
  
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

    await Promise.allSettled(cameraItems.map(async (cameraItem: CameraItem, index: number) => {
      const options: Options = {
        id: index,                      // Any number id
        hostname: cameraItem.ip,  // IP Address of device
        username: cameraItem.username,          // User
        password: cameraItem.password,       // Password
        port: cameraItem.onvif.port,                   // Onvif device service port
      };

      const detector = await MotionDetector.create(options.id, options);

      console.log(new Date(), `>> Motion Detection Listening on ${options.hostname}`);
      detector.listen((motion) => {
        if (motion) {
          console.log(new Date(), `>> Motion Detected on ${options.hostname}`);
        } else {
          console.log(new Date(), `>> Motion Stopped on ${options.hostname}`);
        }
      });
    }));

    console.log('assets.service startOnvif out');

    return;
  }
}