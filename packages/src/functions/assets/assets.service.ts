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
  public async getHost(): Promise<any> {

    console.log('assets.service getHost in');

    const rtn = await this.assetsDao.getHost();

    console.log('assets.service saveHost out:' + JSON.stringify(rtn));

    return rtn;
  }

  public async saveHost({hostId, identityId, stage, credProviderHost}: {hostId: string, identityId: string, stage: string, credProviderHost: string}): Promise<any> {

    console.log('assets.service saveHost in:' + JSON.stringify({hostId, identityId, stage, credProviderHost}));

    await this.assetsDao.updateHost({hostId, identityId, stage, credProviderHost});

    console.log('assets.service saveHost out');

    return;
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

  public async refreshCameras(deltaShadowCameras: ShadowCameras, desiredShadowCameras: ShadowCameras): Promise<any> {
    console.log('assets.service refreshCameras in: ' + JSON.stringify({deltaShadowCameras, desiredShadowCameras}));

    const deltaCameraItems: CameraItem[] = Object.entries(desiredShadowCameras).map(([uuid, cameraItem]: [string, CameraItem]) => {
      return cameraItem;
    }).filter((cameraItem: CameraItem) => {
      if (deltaShadowCameras[cameraItem.uuid]) {
        return true;
      } else {
        return false;
      }
    });

    console.log('assets.service refreshCameras deltaCameraItems: ' + JSON.stringify(deltaCameraItems));

    await Promise.all(deltaCameraItems.map(async (cameraItem: CameraItem) => {
      
      const existingCamera: CameraItem = await this.assetsDao.getCamera(cameraItem.hostId, cameraItem.uuid);

      if (existingCamera) {
        existingCamera.username = cameraItem.username;
        existingCamera.password = cameraItem.password;
        existingCamera.isDetecting = cameraItem.isDetecting;
        existingCamera.isRecording = cameraItem.isRecording;
        existingCamera.rtsp = cameraItem.rtsp;
        existingCamera.lastUpdateOn = cameraItem.lastUpdateOn;

        await this.assetsDao.updateCamera(existingCamera);
      } else {
        await this.assetsDao.updateCamera(cameraItem);
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
        isDetecting: false,
        isRecording: false,
        lastUpdateOn: (new Date).toISOString()
      }

      if (existingCamera) {
        const newIp = cameraItem.localIp;
        const newCoreName = cameraItem.coreName;
        const propertyCode = cameraItem.propertyCode;
        const hostPropertyCode = cameraItem.hostPropertyCode;

        cameraItem = existingCamera;
        cameraItem.localIp = newIp;
        cameraItem.lastUpdateOn = (new Date).toISOString();
        cameraItem.coreName = newCoreName;
        cameraItem.propertyCode = propertyCode;
        cameraItem.hostPropertyCode = hostPropertyCode;
      }
      await this.assetsDao.updateCamera(cameraItem);
  
      await this.iotService.publish({
        topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/camera_detected`,
          payload: JSON.stringify(cameraItem)
      });
    }));

    console.log('assets.service discoverCameras out');

    return;
  }

  public async refreshScanner(scannerItem: ScannerItem): Promise<any> {
    console.log('assets.service refreshScanner in: ' + JSON.stringify(scannerItem));

    const crtScanner:ScannerItem = await this.assetsDao.getScannerById(scannerItem.equipmentId);

    if (crtScanner) {
      scannerItem.hostId = process.env.HOST_ID;
      scannerItem.propertyCode = process.env.PROPERTY_CODE;
      scannerItem.hostPropertyCode = `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`;
      scannerItem.category = 'SCANNER';
      scannerItem.coreName = process.env.AWS_IOT_THING_NAME;
      scannerItem.uuid = crtScanner.uuid;
      scannerItem.lastUpdateOn = (new Date).toISOString();

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

  public async startOnvif({hostId, propertyCode}: {hostId: string, propertyCode: string}): Promise<any> {
    console.log('assets.service startOnvif in: ' + JSON.stringify({hostId, propertyCode}));

    const cameraItems: CameraItem[] = await this.assetsDao.getCameras(`${hostId}-${propertyCode}`);

    const listenerResponses = await Promise.allSettled(cameraItems.filter((cameraItem: CameraItem) => {
      if (cameraItem.onvif && cameraItem.localIp && cameraItem.username && cameraItem.password && cameraItem.onvif.port && cameraItem.rtsp.codec) {
        if (cameraItem.isDetecting || cameraItem.isRecording) {
          return true;
        }
      }
      
      return false;
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
          console.log('assets.service startOnvif request scanner to detect at ' + cameraItem.localIp);
          
          const responseRecord = await axios.post(
            "http://localhost:7777/detect_record", 
            { 
              cam_ip: cameraItem.localIp
            }
          ).catch(err => {
            console.log("request scanner err:" + JSON.stringify(err));
            return { status: "", data: {}};
          });

          console.log("request detect_record status:" + responseRecord.status + " data:" + JSON.stringify(responseRecord.data));

        }
      });

      return cameraItem;

    }));

    // console.log('assets.service startOnvif listenerResponses:' + JSON.stringify(inspect(listenerResponses)));

    listenerResponses.filter(listenerResponse => {
      if (listenerResponse.status === 'fulfilled') {
        return true;
      } else {
        return false;
      }
    }).map(async(listenerResponse) => {
      console.log('assets.service startOnvif request scanner to start scanner at ' + JSON.stringify(listenerResponse));

      let cameraItem = listenerResponse['value'] as CameraItem;
          
      const response = await axios.post(
        "http://localhost:7777/start", { cam_ip: cameraItem.localIp }
      ).catch(err => {
        console.log("request scanner err:" + JSON.stringify(err));
        return { status: "", data: {}};
      });
      
      console.log("request scanner status:" + response.status + " data:" + JSON.stringify(response.data));
    })

    console.log('assets.service startOnvif out');

    return;
  }
}