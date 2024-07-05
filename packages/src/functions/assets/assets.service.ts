import { PropertyItem, CameraItem, ScannerItem, ShadowCameras } from './assets.models';
import { AssetsDao } from './assets.dao';
import { IotService } from '../iot/iot.service';

import ShortUniqueId from 'short-unique-id';
import { MotionDetector, Options } from 'node-onvif-events';
import Onvif from 'node-onvif';

import axios, { AxiosResponse } from 'axios';
import { inspect } from 'util';

export class AssetsService {

  private assetsDao: AssetsDao;
  private uid;
  private iotService: IotService;
  // private lastMotionTime: number | null = null;
  // private timer: NodeJS.Timeout | null = null;
  
  public constructor() {
    this.assetsDao = new AssetsDao();
    this.iotService = new IotService();

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

  public async refreshCameras(shadowCameraItems: ShadowCameras): Promise<any> {
    console.log('assets.service refreshCameras in: ' + JSON.stringify(shadowCameraItems));

    const cameraItems: CameraItem[] = Object.entries(shadowCameraItems).map(([uuid, cameraItem]: [string, CameraItem]) => {
      return cameraItem;
    });

    console.log('assets.service refreshCameras cameraItems: ' + JSON.stringify(cameraItems));

    if (cameraItems.length == 0) {
      await this.assetsDao.deleteCameras(process.env.HOST_ID);
    }

    await Promise.all(cameraItems.map(async (cameraItem: CameraItem) => {
      
      const existingCamera: CameraItem = await this.assetsDao.getCamera(cameraItem.hostId, cameraItem.uuid);

      if (existingCamera) {
        if (existingCamera.lastUpdateOn !== cameraItem.lastUpdateOn) {
          existingCamera.username = cameraItem.username;
          existingCamera.password = cameraItem.password;
          existingCamera.rtsp = cameraItem.rtsp;
          existingCamera.lastUpdateOn = cameraItem.lastUpdateOn;

          await this.assetsDao.createCamera(existingCamera);
        }
      } else {
        await this.assetsDao.createCamera(cameraItem);
      }
    }));

    console.log('assets.service refreshCameras out');

    return;
  }

  public async discoverCameras(hostId: string): Promise<any> {
    console.log('assets.service discoverCameras in: ' + JSON.stringify({hostId}));

    const discoveredCameras = await Onvif.startProbe();

    await Promise.allSettled(discoveredCameras.map(async (discoveredCamera) => {
      const uuid = discoveredCamera.urn.split(":").slice(-1)[0] ;
      const parsedUrl = new URL(discoveredCamera.xaddrs[0]);

      const existingCamera: CameraItem = await this.assetsDao.getCamera(hostId, uuid);

      let cameraItem: CameraItem = {
        hostId,
        uuid,
        propertyCode: process.env.PROPERTY_CODE,
        hostPropertyCode: `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`,
        category: 'CAMERA',
        coreName: process.env.AWS_IOT_THING_NAME,
        equipmentId: uuid,
        equipmentName: discoveredCamera.name,
        localIp: parsedUrl.hostname,
        username: '',
        password: '',
        rtsp: {
          port: 554,
          path: '',
          codec: 'h264',
          framerate: 10
        },
        onvif: {
          port: parseInt(parsedUrl.port) || 80
        },
        lastUpdateOn: (new Date).toISOString()
      }

      if (existingCamera) {
        const newIp = cameraItem.localIp;
        const newCoreName = cameraItem.coreName;
        cameraItem = existingCamera;
        if (newIp !== existingCamera.localIp || newCoreName !== existingCamera.coreName) {
          cameraItem.localIp = newIp;
          cameraItem.lastUpdateOn = (new Date).toISOString();
          cameraItem.coreName = newCoreName;

          await this.iotService.publish({
            topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/camera_detected`,
              payload: JSON.stringify(cameraItem)
          });
        }

        await this.assetsDao.createCamera(cameraItem);
      } else {

        await this.assetsDao.createCamera(cameraItem);
  
        await this.iotService.publish({
          topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/camera_detected`,
            payload: JSON.stringify(cameraItem)
        });
      }

    }));

    console.log('assets.service discoverCameras out');

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

		await this.iotService.publish({
			topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/scanner_detected`,
		    payload: JSON.stringify(scannerItem)
		});

    console.log('assets.service refreshScanner out');

    return;
  }

  public async startOnvif({hostId, identityId, propertyCode, credProviderHost}: {hostId: string, identityId: string, propertyCode: string, credProviderHost: string}): Promise<any> {
    console.log('assets.service startOnvif in: ' + JSON.stringify({hostId, identityId, propertyCode, credProviderHost}));

    const cameraItems: CameraItem[] = await this.assetsDao.getCameras(hostId);

    const hostInfo = {
      hostId,
      identityId,
      propertyCode,
      credProviderHost
    }

    const responses = await Promise.allSettled(cameraItems.filter((cameraItem: CameraItem) => {
      if (cameraItem.onvif && cameraItem.localIp && cameraItem.username && cameraItem.password && cameraItem.onvif.port) {
        return true;
      } else {
        return false;
      }
    }).map(async (cameraItem: CameraItem, index: number) => {
      console.log('assets.service startOnvif cameraItem:' + JSON.stringify(cameraItem));

      const options: Options = {
        id: index,                      // Any number id
        hostname: cameraItem.localIp,  // IP Address of device
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
          // console.log('assets.service startOnvif motion detected at ' + cameraItem.localIp);
          // this.lastMotionTime = now;
          console.log('assets.service startOnvif request scanner to start scan at ' + cameraItem.localIp);
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