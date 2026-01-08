const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;
const ZB_CATS = process.env.ZB_CATS.split(",");
const ZB_CATS_WITH_KEYPAD = process.env.ZB_CAT_WITH_KEYPAD.split(",");

import { MemberDetectedItem, Z2mRemoved, Z2mRenamed, Z2mLock, Z2mEvent, PropertyItem, NamedShadowCamera, ScannerItem, ClassicShadowCamera, ClassicShadowCameras, ClassicShadowSpaces, ClassicShadowSpace, LockOccupancyEvent } from './assets.models';
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

  public async saveHost({ hostId, identityId, stage, credProviderHost }: { hostId: string, identityId: string, stage: string, credProviderHost: string }): Promise<any> {

    console.log('assets.service saveHost in:' + JSON.stringify({ hostId, identityId, stage, credProviderHost }));

    await this.assetsDao.updateHost({ hostId, identityId, stage, credProviderHost });

    console.log('assets.service saveHost out');

    return;
  }

  public async saveProperty(hostId: string, propertyItem: PropertyItem): Promise<any> {
    console.log('assets.service saveProperty in: ' + JSON.stringify({ hostId, propertyItem }));

    await this.assetsDao.deleteProperties(hostId);

    propertyItem.hostId = hostId;
    propertyItem.hostPropertyCode = `${hostId}-${propertyItem.propertyCode}`;
    propertyItem.category = 'PROPERTY';

    await this.assetsDao.createProperty(propertyItem);

    console.log('assets.service saveProperty out');

    return;
  }

  public async getProperty(hostId: string): Promise<any> {
    console.log('assets.service getProperty in' + JSON.stringify({ hostId }));

    const propertyItem: PropertyItem = await this.assetsDao.getProperty(hostId);

    console.log('assets.service getProperty out' + JSON.stringify({ propertyItem }));

    return propertyItem;
  }

  private async processSpacesShadowDelta(uuid: string): Promise<any> {
    console.log('assets.service processSpacesShadowDelta in: ' + JSON.stringify({ uuid }));


    // await this.assetsDao.updateSpace(existingCamera);

    console.log('assets.service processSpacesShadowDelta out');

    return;
  }

  public async processSpacesShadow(deltaShadowSpaces: ClassicShadowSpaces, desiredShadowSpaces: ClassicShadowSpaces): Promise<any> {
    console.log('assets.service processSpacesShadow in: ' + JSON.stringify({ deltaShadowSpaces, desiredShadowSpaces }));

    const newSpaceUUIDs = Object.keys(desiredShadowSpaces)
      .filter(uuid => desiredShadowSpaces[uuid].action == 'UPDATE');

    const removedSpaceUUIDs = Object.keys(desiredShadowSpaces)
      .filter(uuid => desiredShadowSpaces[uuid].action == 'REMOVE');

    await this.assetsDao.refreshSpaces(process.env.HOST_ID, newSpaceUUIDs, removedSpaceUUIDs);

    console.log('assets.service processSpacesShadow out');

    return;
  }

  private async processCamerasShadowDelta(uuid: string): Promise<any> {
    console.log('assets.service processCamerasShadowDelta in: ' + JSON.stringify({ uuid }));

    const getShadowResult = await this.iotService.getShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: uuid
    });

    const delta: NamedShadowCamera = getShadowResult.state.desired;

    let existingCamera: NamedShadowCamera = await this.assetsDao.getCamera(process.env.HOST_ID, uuid);

    // Capture old locks before updating (for bidirectional sync)
    const oldLocks = existingCamera?.locks || {};
    const newLocks = delta.locks || {};

    if (existingCamera) {
      existingCamera.username = delta.username;
      existingCamera.password = delta.password;
      existingCamera.isDetecting = delta.isDetecting;
      existingCamera.isRecording = delta.isRecording;
      existingCamera.rtsp = delta.rtsp;
      existingCamera.onvif = delta.onvif;
      existingCamera.locks = delta.locks;
      existingCamera.layoutId = delta.layoutId;
      existingCamera.position = delta.position;
      existingCamera.inSpaces = delta.inSpaces;
      existingCamera.lastUpdateOn = delta.lastUpdateOn;
    } else {
      existingCamera = delta;
    }

    await this.assetsDao.updateCamera(existingCamera);

    // Sync lock camera references (bidirectional relationship)
    // 1. Remove camera from locks that are no longer associated
    const oldLockIds = Object.keys(oldLocks);
    const newLockIds = Object.keys(newLocks);
    const removedLockIds = oldLockIds.filter(id => !newLockIds.includes(id));

    for (const lockAssetId of removedLockIds) {
      await this.removeCameraFromLock(lockAssetId, existingCamera.assetId);
    }

    // 2. Add/update camera in locks that are associated
    for (const lockAssetId of newLockIds) {
      await this.syncLockCameraReference(lockAssetId, existingCamera);
    }

    // Update the named shadow
    await this.iotService.updateReportedShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: uuid,
      reportedState: delta
    });

    await this.iotService.publish({
      topic: `gocheckin/reset_camera`,
      payload: JSON.stringify({ cam_ip: existingCamera.localIp })
    });

    console.log('assets.service processCamerasShadowDelta out');

    return;
  }

  private async processCamerasShadowDeleted(uuid: string): Promise<any> {
    console.log('assets.service processCamerasShadowDeleted in: ' + JSON.stringify({ uuid }));

    // Get camera before deletion to know which locks to clean up
    const camera: NamedShadowCamera = await this.assetsDao.getCamera(process.env.HOST_ID, uuid);

    // Clean up lock camera references (bidirectional relationship)
    if (camera && camera.locks) {
      for (const lockAssetId of Object.keys(camera.locks)) {
        await this.removeCameraFromLock(lockAssetId, camera.assetId);
      }
    }

    await this.assetsDao.deleteCamera(process.env.HOST_ID, uuid);

    await this.iotService.publish({
      topic: `gocheckin/reset_camera`,
      payload: JSON.stringify({})
    });

    await this.iotService.publish({
      topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/camera_removed`,
      payload: JSON.stringify({ uuid: uuid })
    });

    console.log('assets.service processCamerasShadowDeleted out');

    return;
  }

  private async syncLockCameraReference(lockAssetId: string, camera: NamedShadowCamera): Promise<void> {
    console.log(`assets.service syncLockCameraReference in: ${JSON.stringify({ lockAssetId, cameraAssetId: camera.assetId })}`);

    // 1. Get the lock record
    const lock: Z2mLock = await this.assetsDao.getZbLockById(lockAssetId);
    if (!lock) {
      console.log(`assets.service syncLockCameraReference out - lock not found: ${lockAssetId}`);
      return;
    }

    // 2. Initialize cameras object if not exists
    if (!lock.cameras) {
      lock.cameras = {};
    }

    // 3. Check if camera needs to be added or updated
    const existing = lock.cameras[camera.assetId];

    if (!existing || existing.localIp !== camera.localIp) {
      // Add or update camera reference
      lock.cameras[camera.assetId] = {
        assetId: camera.assetId,
        localIp: camera.localIp
      };
      await this.assetsDao.updateLock(lock);
      console.log(`assets.service syncLockCameraReference ${existing ? 'updated' : 'added'} camera ${camera.assetId} in lock ${lockAssetId}`);
    }

    console.log(`assets.service syncLockCameraReference out`);
  }

  private async removeCameraFromLock(lockAssetId: string, cameraAssetId: string): Promise<void> {
    console.log(`assets.service removeCameraFromLock in: ${JSON.stringify({ lockAssetId, cameraAssetId })}`);

    // 1. Get the lock record
    const lock: Z2mLock = await this.assetsDao.getZbLockById(lockAssetId);
    if (!lock) {
      console.log(`assets.service removeCameraFromLock out - lock not found: ${lockAssetId}`);
      return;
    }

    // 2. Check if camera exists in lock's cameras
    if (lock.cameras && lock.cameras[cameraAssetId]) {
      delete lock.cameras[cameraAssetId];
      await this.assetsDao.updateLock(lock);
      console.log(`assets.service removeCameraFromLock removed camera ${cameraAssetId} from lock ${lockAssetId}`);
    }

    console.log(`assets.service removeCameraFromLock out`);
  }

  public async processCamerasShadow(deltaShadowCameras: ClassicShadowCameras, desiredShadowCameras: ClassicShadowCameras): Promise<any> {
    console.log('assets.service processCamerasShadow in: ' + JSON.stringify({ deltaShadowCameras, desiredShadowCameras }));

    const promises = Object.keys(deltaShadowCameras).map(async (uuid: string) => {
      const classicShadowCamera: ClassicShadowCamera = desiredShadowCameras[uuid];
      if (classicShadowCamera) {
        try {
          if (classicShadowCamera.action === 'UPDATE') {
            await this.processCamerasShadowDelta(uuid);
          } else if (classicShadowCamera.action === 'REMOVE') {
            await this.processCamerasShadowDeleted(uuid);
          }

        } catch (err) {
          return { uuid, action: classicShadowCamera.action, message: err.message, stack: err.stack };
        }

        return { uuid, action: classicShadowCamera.action };
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
      const uuid = discoveredCamera.urn.split(":").slice(-1)[0];
      const parsedUrl = new URL(discoveredCamera.xaddrs[0]);

      const existingCamera: NamedShadowCamera = await this.assetsDao.getCamera(hostId, uuid);

      let cameraItem: NamedShadowCamera = {
        hostId,
        uuid,
        propertyCode: process.env.PROPERTY_CODE,
        hostPropertyCode: `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`,
        category: 'CAMERA',
        coreName: process.env.AWS_IOT_THING_NAME,
        assetId: uuid,
        assetName: discoveredCamera.name,
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
        inSpaces: [],
        layoutId: 0,
        position: 0,
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
        topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/camera_detected`,
        payload: JSON.stringify(cameraItem)
      });
    }));

    console.log(`assets.service discoverCameras out ${discoveredCameras.length} found`);

    return;
  }

  public async refreshScanner(scannerItem: ScannerItem): Promise<any> {
    console.log('assets.service refreshScanner in: ' + JSON.stringify(scannerItem));

    const crtScanner: ScannerItem = await this.assetsDao.getScannerById(scannerItem.assetId);

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
      topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/scanner_detected`,
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
              assetId: z2mEvent.data.ieee_address,
              assetName: z2mEvent.data.friendly_name,
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
              topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/zb_lock_detected`,
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
      z2mLocks[0].assetName = `${z2mRenamed.data.to}`;
      z2mLocks[0].lastUpdateOn = (new Date).toISOString();

      await this.assetsDao.updateLock(z2mLocks[0]);

      await this.iotService.publish({
        topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/zb_lock_detected`,
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
      await this.assetsDao.deleteZbLock(process.env.HOST_ID, z2mLocks[0].assetId);

      await this.iotService.publish({
        topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/zb_lock_removed`,
        payload: JSON.stringify(z2mLocks[0])
      });
    }

    console.log('assets.service removeZigbee out');

    return;
  }

  public async unlockZbLock(assetId: string): Promise<any> {
    console.log('assets.service unlockZbLock in assetId: ' + assetId);

    const z2mLock: Z2mLock = await this.assetsDao.getZbLockById(assetId);

    if (z2mLock) {
      // Send TOGGLE command - let zigbee2mqtt handle the state
      await this.iotService.publish({
        topic: `zigbee2mqtt/${z2mLock.assetName}/set`,
        payload: JSON.stringify({ state: 'TOGGLE' })
      });

      console.log(`assets.service unlockZbLock sent TOGGLE to: ${z2mLock.assetName}`);
    }

    console.log('assets.service unlockZbLock out');

    return;
  }

  public async unlockByMemberDetected(memberDetectedItem: MemberDetectedItem): Promise<any> {
    console.log('assets.service unlockByMemberDetected in: ' + JSON.stringify(memberDetectedItem));

    const cameraItem: NamedShadowCamera = await this.assetsDao.getCamera(memberDetectedItem.hostId, memberDetectedItem.assetId);

    console.log(`assets.service unlockByMemberDetected locks: ${JSON.stringify(cameraItem.locks)}`);

    let zbLockPromises = [];
    if (cameraItem.locks) {
      zbLockPromises = Object.keys(cameraItem.locks).map(async (assetId) => {

        await this.unlockZbLock(assetId);

      });
    }

    const results = await Promise.allSettled(zbLockPromises);
    results.forEach((result) => {
      console.log(`assets.service unlockByMemberDetected promises result: ${JSON.stringify(result)}`);
    });

    console.log('assets.service unlockByMemberDetected out');

    return;
  }

  public async handleLockTouchEvent(event: LockOccupancyEvent): Promise<any> {
    console.log('assets.service handleLockTouchEvent in: ' + JSON.stringify(event));

    // 1. Look up lock by friendly name
    const z2mLocks: Z2mLock[] = await this.assetsDao.getZbLockByName(event.lockAssetName);

    if (z2mLocks.length === 0) {
      console.log(`assets.service handleLockTouchEvent out - lock not found: ${event.lockAssetName}`);
      return;
    }

    const lock = z2mLocks[0];

    // 2. Use lock.cameras directly (populated by syncLockCameraReference)
    if (!lock.cameras || Object.keys(lock.cameras).length === 0) {
      console.log(`assets.service handleLockTouchEvent out - no cameras for lock: ${lock.assetId}`);
      return;
    }

    // 3. Trigger face detection on each camera
    const triggerPromises = Object.keys(lock.cameras).map(async (cameraAssetId: string) => {
      const camera = lock.cameras[cameraAssetId];
      console.log(`assets.service handleLockTouchEvent triggering for camera: ${camera.localIp}`);

      await this.iotService.publish({
        topic: `gocheckin/trigger_detection`,
        payload: JSON.stringify({ cam_ip: camera.localIp })
      });

      return { cameraIp: camera.localIp, status: 'triggered' };
    });

    const results = await Promise.allSettled(triggerPromises);
    console.log('assets.service handleLockTouchEvent results: ' + JSON.stringify(results));

    console.log('assets.service handleLockTouchEvent out');

    return;
  }

}