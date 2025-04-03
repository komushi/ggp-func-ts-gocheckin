const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;
const ZB_CATS = process.env.ZB_CATS.split(",");
const ZB_CATS_WITH_KEYPAD = process.env.ZB_CAT_WITH_KEYPAD.split(",");

import { MemberDetectedItem, Z2mRemoved, Z2mRenamed, Z2mLock, Z2mEvent, PropertyItem, NamedShadowCamera, ScannerItem, ClassicShadowCamera, ClassicShadowCameras, ClassicShadowSpaces, ClassicShadowSpace } from './assets.models';
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

  public async processSpacesShadow(deltaShadowSpaces: ClassicShadowSpaces, desiredShadowSpaces: ClassicShadowSpaces): Promise<any> {
    console.log('assets.service processSpacesShadow in: ' + JSON.stringify({deltaShadowSpaces, desiredShadowSpaces}));

    const promises = Object.keys(deltaShadowSpaces).map(async (uuid: string) => {
      const classicShadowSpace: ClassicShadowSpace = desiredShadowSpaces[uuid];
      if (classicShadowSpace) {
        try {
          // await this.assetsDao.deleteSpaces(process.env.HOST_ID);
  
        } catch (err) {
          return {uuid, message: err.message, stack: err.stack};
        } 

        return {uuid};
      }
    });

    const results = await Promise.allSettled(promises);
    console.log('assets.service processSpacesShadow results:' + JSON.stringify(results));

    console.log('assets.service processSpacesShadow out');

  }

  private async processCamerasShadowDelta(uuid: string): Promise<any> {
    console.log('assets.service processCamerasShadowDelta in: ' + JSON.stringify({uuid}));

    const getShadowResult = await this.iotService.getShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: uuid
    });

    const delta: NamedShadowCamera = getShadowResult.state.desired;

    let existingCamera: NamedShadowCamera = await this.assetsDao.getCamera(process.env.HOST_ID, uuid);

    if (existingCamera) {
      existingCamera.username = delta.username;
      existingCamera.password = delta.password;
      existingCamera.isDetecting = delta.isDetecting;
      existingCamera.isRecording = delta.isRecording;
      existingCamera.rtsp = delta.rtsp;
      existingCamera.onvif = delta.onvif;
      existingCamera.locks = delta.locks;
      existingCamera.lastUpdateOn = delta.lastUpdateOn;
    } else {
      existingCamera = delta;
    }

    await this.assetsDao.updateCamera(existingCamera);

    // Update the named shadow
    await this.iotService.updateReportedShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: uuid,
      reportedState: delta
    });

    await this.iotService.publish({
      topic: `gocheckin/reset_camera`,
      payload: JSON.stringify({cam_ip: existingCamera.localIp})
    });

    console.log('assets.service processCamerasShadowDelta out');

    return;
  }

  private async processCamerasShadowDeleted(uuid: string): Promise<any> {
    console.log('assets.service processCamerasShadowDeleted in: ' + JSON.stringify({uuid}));    

    // const getShadowResult = await this.iotService.getShadow({
    //   thingName: AWS_IOT_THING_NAME,
    //   shadowName: uuid
    // });

    // const delta: NamedShadowCamera = getShadowResult.state.desired;

    // await this.iotService.deleteShadow({
    //   thingName: AWS_IOT_THING_NAME,
    //   shadowName: uuid     
    // }).catch(err => {
    //   console.log('processCamerasShadowDeleted deleteShadow err:' + JSON.stringify(err));
    //   return;
    // });

    await this.assetsDao.deleteCamera(process.env.HOST_ID, uuid);

    await this.iotService.publish({
      topic: `gocheckin/reset_camera`,
      payload: JSON.stringify({})
    });
    
    await this.iotService.publish({
      topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/camera_removed`,
      payload: JSON.stringify({uuid: uuid})
    });

    console.log('assets.service processCamerasShadowDeleted out');

    return;
  }

  public async processCamerasShadow(deltaShadowCameras: ClassicShadowCameras, desiredShadowCameras: ClassicShadowCameras): Promise<any> {
    console.log('assets.service processCamerasShadow in: ' + JSON.stringify({deltaShadowCameras, desiredShadowCameras}));

    const promises = Object.keys(deltaShadowCameras).map(async (uuid: string) => {
      const classicShadowCamera: ClassicShadowCamera = desiredShadowCameras[uuid];
      if (classicShadowCamera) {
        try {
          if (classicShadowCamera.action == 'UPDATE') {
            await this.processCamerasShadowDelta(uuid);
          } else {
            await this.processCamerasShadowDeleted(uuid);
          }
  
        } catch (err) {
          return {uuid, action: classicShadowCamera.action, message: err.message, stack: err.stack};
        } 

        return {uuid, action: classicShadowCamera.action};
      }
    });

    const results = await Promise.allSettled(promises);
    console.log('assets.service processCamerasShadow results:' + JSON.stringify(results));

    console.log('assets.service processCamerasShadow out');

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
          codec: 'h265',
          framerate: 10
        },
        onvif: {
          port: parseInt(parsedUrl.port) || 80,
          isPullpoint: false,
          isSubscription: false
        },
        locks: {},
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

  public async discoverZigbee(z2mEvent: Z2mEvent): Promise<any> {
    console.log('assets.service discoverZigbee in: ' + JSON.stringify(z2mEvent));

    if (z2mEvent.type && z2mEvent.type == 'device_interview') {
      if (z2mEvent.data) {
        if (z2mEvent.data.status && z2mEvent.data.status == 'successful') {
          if (z2mEvent.data.supported) {
            let category = 'UNKNOWN';
            let withKeypad = false;
            ZB_CATS.forEach((zbCat) => {
              if ((process.env[zbCat].split(",")).includes(z2mEvent.data.definition.model)) {
                category = zbCat;
                
                if (ZB_CATS_WITH_KEYPAD.includes(zbCat)) {
                  withKeypad = true;
                }
              }
            })

            const z2mLock: Z2mLock = {
              hostId: process.env.HOST_ID,
              uuid: z2mEvent.data.ieee_address,
              hostPropertyCode: `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`,
              propertyCode: process.env.PROPERTY_CODE,
              equipmentId: z2mEvent.data.ieee_address,
              equipmentName: z2mEvent.data.friendly_name,
              coreName: process.env.AWS_IOT_THING_NAME,
              withKeypad: withKeypad,
              category: category,
              vendor: z2mEvent.data.definition.vendor,
              model: z2mEvent.data.definition.model,
              state: false,
              lastUpdateOn: (new Date).toISOString()
            }
            
            await this.assetsDao.updateLock(z2mLock);

            await this.iotService.publish({
              topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/zb_lock_detected`,
              payload: JSON.stringify(z2mLock)
            });
          }
        }
      }

    }

    console.log('assets.service discoverZigbee out');

    return;
  }

  
  public async renameZigbee(z2mRenamed: Z2mRenamed): Promise<any> {
    console.log('assets.service renameZigbee in: ' + JSON.stringify(z2mRenamed));

    const z2mLocks: Z2mLock[] = await this.assetsDao.getZbLockByName(z2mRenamed.data.from);

    if (z2mLocks.length == 1) {
      z2mLocks[0].roomCode = z2mRenamed.data.to;
      z2mLocks[0].equipmentName = `${z2mRenamed.data.to}`;
      z2mLocks[0].lastUpdateOn = (new Date).toISOString();
      
      await this.assetsDao.updateLock(z2mLocks[0]);

      await this.iotService.publish({
        topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/zb_lock_detected`,
        payload: JSON.stringify(z2mLocks[0])
      });
  
      console.log('assets.service renameZigbee out ' + JSON.stringify(z2mLocks[0]));

      return;
    }

    console.log('assets.service renameZigbee out');

    return;
  }

  public async removeZigbee(z2mRemoved: Z2mRemoved): Promise<any> {
    console.log('assets.service removeZigbee in: ' + JSON.stringify(z2mRemoved));
    
    const z2mLocks: Z2mLock[] = await this.assetsDao.getZbLockByName(z2mRemoved.data.id);

    if (z2mLocks.length == 1) {
      await this.assetsDao.deleteZbLock(process.env.HOST_ID, z2mLocks[0].equipmentId);

      await this.iotService.publish({
        topic: `gocheckin/${process.env.STAGE}/${process.env.AWS_IOT_THING_NAME}/zb_lock_removed`,
        payload: JSON.stringify(z2mLocks[0])
      });
    }

    console.log('assets.service removeZigbee out');

    return;
  }

  public async unlockZbLock(memberDetectedItem: MemberDetectedItem): Promise<any> {
    console.log('assets.service unlockZbLock in: ' + JSON.stringify(memberDetectedItem));

    const cameraItem: NamedShadowCamera = await this.assetsDao.getCamera(memberDetectedItem.hostId, memberDetectedItem.equipmentId);

    console.log(`assets.service unlockZbLock locks: ${JSON.stringify(cameraItem.locks)}`);

    let zbLockPromises = [];
    if (cameraItem.locks) {
      zbLockPromises = Object.keys(cameraItem.locks).map(async (equipmentId) => {
        const z2mLock: Z2mLock = await this.assetsDao.getZbLockById(equipmentId);
        if (z2mLock) {
          let payload = {};
  
          if (z2mLock.state) {
            payload = {
              'state': 'ON'
            };
            z2mLock.state = false;
          } else {
            payload = {
              'state': 'OFF'
            };
            z2mLock.state = true;
          }
  
          await this.iotService.publish({
            topic: `zigbee2mqtt/${z2mLock.equipmentName}/set`,
              payload: JSON.stringify(payload)
          });

          await this.assetsDao.updateLock(z2mLock);
        }
      });
    }

    const results = await Promise.allSettled(zbLockPromises);
    results.forEach((result) => {
      console.log(`assets.service unlockZbLock promises result: ${JSON.stringify(result)}`);
    });

    console.log('assets.service unlockZbLock out');

    return;
  }

  

}