const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;

import { PropertyItem, NamedShadowCamera, ScannerItem, ClassicShadowCamera, ClassicShadowCameras } from './assets.models';
import { AssetsDao } from './assets.dao';
import { IotService } from '../iot/iot.service';

import ShortUniqueId from 'short-unique-id';
// import { MotionDetector, Options } from 'node-onvif-events';
import Onvif from 'node-onvif';

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

  /*
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
        existingCamera.onvif = cameraItem.onvif;
        existingCamera.lastUpdateOn = cameraItem.lastUpdateOn;

        await this.assetsDao.updateCamera(existingCamera);
      } else {
        await this.assetsDao.updateCamera(cameraItem);
      }
    }));

    if (deltaCameraItems.length > 0) {
      await this.iotService.publish({
        topic: 'gocheckin/fetch_cameras',
        payload: ''
      });
    }

    console.log('assets.service refreshCameras out');

    return;
  }
  */
 
  private async processShadowDelta(uuid: string): Promise<any> {
    console.log('assets.service processShadowDelta in: ' + JSON.stringify({uuid}));

    const getShadowResult = await this.iotService.getShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: uuid
    });

    const delta: NamedShadowCamera = getShadowResult.state.desired;

    const existingCamera: NamedShadowCamera = await this.assetsDao.getCamera(delta.hostId, delta.uuid);

    if (existingCamera) {
      existingCamera.username = delta.username;
      existingCamera.password = delta.password;
      existingCamera.isDetecting = delta.isDetecting;
      existingCamera.isRecording = delta.isRecording;
      existingCamera.rtsp = delta.rtsp;
      existingCamera.onvif = delta.onvif;
      existingCamera.lastUpdateOn = delta.lastUpdateOn;

      await this.assetsDao.updateCamera(existingCamera);
    } else {
      await this.assetsDao.updateCamera(delta);
    }

    // Update the named shadow
    await this.iotService.updateReportedShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: uuid,
      reportedState: delta
    });

    console.log('assets.service processShadowDelta out');

    return;
  }

  private async processShadowDeleted(uuid: string): Promise<any> {
    console.log('assets.service processShadowDeleted in: ' + JSON.stringify({uuid}));

    const getShadowResult = await this.iotService.getShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: uuid
    });

    const delta: NamedShadowCamera = getShadowResult.state.desired;

    await this.assetsDao.deleteCamera(delta.hostId, uuid);

    await this.iotService.deleteShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: uuid     
    }).catch(err => {
      console.log('processShadowDeleted deleteShadow err:' + JSON.stringify(err));
      return;
    });

    console.log('assets.service processShadowDeleted out');

    return;
  }

  public async processShadow(deltaShadowCameras: ClassicShadowCameras, desiredShadowCameras: ClassicShadowCameras): Promise<any> {
    console.log('assets.service processShadow in: ' + JSON.stringify({deltaShadowCameras, desiredShadowCameras}));

    const promises = Object.keys(deltaShadowCameras).map(async (uuid: string) => {
      const classicShadowCamera: ClassicShadowCamera = desiredShadowCameras[uuid];
      if (classicShadowCamera) {
        try {
          if (!classicShadowCamera.active) {
            await this.processShadowDeleted(uuid);
          } else {
            await this.processShadowDelta(uuid);
          }
  
        } catch (err) {
          return {uuid, action: classicShadowCamera.active, message: err.message, stack: err.stack};
        } 

        return {uuid, action: classicShadowCamera.active};
      }
    });

    const results = await Promise.allSettled(promises);
    console.log('assets.service processShadow results:' + JSON.stringify(results));

    console.log('assets.service processShadow out');

  }

  public async discoverCameras(hostId: string): Promise<any> {
    console.log(`assets.service discoverCameras in hostId: ${hostId}`);

    const discoveredCameras = await Onvif.startProbe();

    await Promise.allSettled(discoveredCameras.map(async (discoveredCamera) => {
      const uuid = discoveredCamera.urn.split(":").slice(-1)[0] ;
      const parsedUrl = new URL(discoveredCamera.xaddrs[0]);

      const existingCamera: NamedShadowCamera = await this.assetsDao.getCamera(hostId, uuid);

      let cameraItem: NamedShadowCamera = {
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
          port: parseInt(parsedUrl.port) || 80,
          isPullpoint: false,
          isSubscription: false
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

    console.log(`assets.service discoverCameras out ${discoveredCameras.length} found`);

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

}