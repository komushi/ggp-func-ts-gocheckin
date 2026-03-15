const AWS_IOT_THING_NAME = process.env.AWS_IOT_THING_NAME;
const ZB_CATS = process.env.ZB_CATS.split(",");

import { MemberDetectedItem, Z2mRemoved, Z2mRenamed, Z2mLock, Z2mEvent, PropertyItem, NamedShadowCamera, ScannerItem, ClassicShadowCamera, ClassicShadowCameras, LockOccupancyEvent, LockButtonEvent, ButtonType } from './assets.models';
import { AssetsDao } from './assets.dao';
import { IotService } from '../iot/iot.service';

import ShortUniqueId from 'short-unique-id';
// import { MotionDetector, Options } from 'node-onvif-events';
import Onvif from 'node-onvif';

export class AssetsService {

  private assetsDao: AssetsDao;
  private uid;
  private iotService: IotService;

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

    // Enrich camera.locks with assetId and category from local lock records
    if (existingCamera.locks) {
      for (const lockAssetId of Object.keys(existingCamera.locks)) {
        existingCamera.locks[lockAssetId].assetId = lockAssetId;
        const lockRecord: Z2mLock = await this.assetsDao.getZbLockById(lockAssetId);
        if (lockRecord) {
          existingCamera.locks[lockAssetId].category = lockRecord.category;
        }
      }
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

  private async processLockButtonShadowDelta(uuid: string): Promise<any> {
    console.log('assets.service processLockButtonShadowDelta in: ' + JSON.stringify({ uuid }));

    const getShadowResult = await this.iotService.getShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: uuid
    });

    const delta = getShadowResult.state.desired;

    // Find existing LOCK_BUTTON record by assetId (uuid = assetId for zigbee devices)
    const lockButton: Z2mLock = await this.assetsDao.getZbLockById(uuid);
    if (!lockButton) {
      console.log(`assets.service processLockButtonShadowDelta out - lock button not found: ${uuid}`);
      return;
    }

    // Update companionOf and buttonType from shadow
    lockButton.companionOf = delta.companionOf || undefined;
    lockButton.buttonType = delta.buttonType || undefined;
    lockButton.lastUpdateOn = (new Date).toISOString();

    await this.assetsDao.updateLock(lockButton);

    // Report shadow as received
    await this.iotService.updateReportedShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: uuid,
      reportedState: delta
    });

    console.log(`assets.service processLockButtonShadowDelta out - updated ${uuid} companionOf=${lockButton.companionOf} buttonType=${lockButton.buttonType}`);

    return;
  }

  public async processLockButtonsShadow(deltaShadowLockButtons: ClassicShadowCameras, desiredShadowLockButtons: ClassicShadowCameras): Promise<any> {
    console.log('assets.service processLockButtonsShadow in: ' + JSON.stringify({ deltaShadowLockButtons, desiredShadowLockButtons }));

    const promises = Object.keys(deltaShadowLockButtons).map(async (uuid: string) => {
      const entry: ClassicShadowCamera = desiredShadowLockButtons[uuid];
      if (entry) {
        try {
          if (entry.action === 'UPDATE') {
            await this.processLockButtonShadowDelta(uuid);
          }
          // REMOVE not needed — LOCK_BUTTON record stays (from zigbee discovery),
          // companionOf/buttonType are cleared via shadow null values
        } catch (err) {
          return { uuid, action: entry.action, message: err.message, stack: err.stack };
        }

        return { uuid, action: entry.action };
      }
    });

    const results = await Promise.allSettled(promises);
    console.log('assets.service processLockButtonsShadow results:' + JSON.stringify(results));

    console.log('assets.service processLockButtonsShadow out');

  }

  private async processLockShadowDelta(uuid: string): Promise<any> {
    console.log('assets.service processLockShadowDelta in: ' + JSON.stringify({ uuid }));

    const getShadowResult = await this.iotService.getShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: uuid
    });

    const delta = getShadowResult.state.desired;

    const lock: Z2mLock = await this.assetsDao.getZbLockById(uuid);
    if (!lock) {
      console.log(`assets.service processLockShadowDelta out - lock not found: ${uuid}`);
      return;
    }

    lock.roomCode = delta.roomCode || undefined;
    lock.lastUpdateOn = (new Date).toISOString();

    await this.assetsDao.updateLock(lock);

    await this.iotService.updateReportedShadow({
      thingName: AWS_IOT_THING_NAME,
      shadowName: uuid,
      reportedState: delta
    });

    console.log(`assets.service processLockShadowDelta out - updated ${uuid} roomCode=${lock.roomCode}`);

    return;
  }

  public async processLocksShadow(deltaShadowLocks: ClassicShadowCameras, desiredShadowLocks: ClassicShadowCameras): Promise<any> {
    console.log('assets.service processLocksShadow in: ' + JSON.stringify({ deltaShadowLocks, desiredShadowLocks }));

    const promises = Object.keys(deltaShadowLocks).map(async (uuid: string) => {
      const entry: ClassicShadowCamera = desiredShadowLocks[uuid];
      if (entry) {
        try {
          if (entry.action === 'UPDATE') {
            await this.processLockShadowDelta(uuid);
          }
        } catch (err) {
          return { uuid, action: entry.action, message: err.message, stack: err.stack };
        }

        return { uuid, action: entry.action };
      }
    });

    const results = await Promise.allSettled(promises);
    console.log('assets.service processLocksShadow results:' + JSON.stringify(results));

    console.log('assets.service processLocksShadow out');

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

  public async refreshScanner(): Promise<any> {
    console.log('assets.service refreshScanner in');

    // Get existing scanner from DB (to preserve UUID)
    const crtScanner: ScannerItem = await this.assetsDao.getScannerById(process.env.AWS_IOT_THING_NAME);

    // Build scanner item from local sources
    const scannerItem: ScannerItem = {
      assetId: process.env.AWS_IOT_THING_NAME,
      assetName: process.env.AWS_IOT_THING_NAME,
      localIp: this.getLocalIpAddress(),
      hostId: process.env.HOST_ID,
      propertyCode: process.env.PROPERTY_CODE,
      hostPropertyCode: `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`,
      category: 'SCANNER',
      coreName: process.env.AWS_IOT_THING_NAME,
      uuid: crtScanner ? crtScanner.uuid : this.uid.randomUUID(6),
      longitude: '',
      latitude: '',
      lastUpdateOn: (new Date).toISOString()
    };

    console.log('assets.service refreshScanner scannerItem: ' + JSON.stringify(scannerItem));

    await this.assetsDao.createScanner(scannerItem);

    await this.iotService.publish({
      topic: `gocheckin/${process.env.AWS_IOT_THING_NAME}/scanner_detected`,
      payload: JSON.stringify(scannerItem)
    });

    console.log('assets.service refreshScanner out');

    return;
  }

  private getLocalIpAddress(): string {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  public async discoverZigbee(z2mEvent: Z2mEvent): Promise<any> {
    console.log('assets.service discoverZigbee in: ' + JSON.stringify(z2mEvent));

    if (z2mEvent.type && z2mEvent.type == 'device_interview') {
      if (z2mEvent.data) {
        if (z2mEvent.data.status && z2mEvent.data.status == 'successful') {
          if (z2mEvent.data.supported) {
            let category = 'UNKNOWN';
            ZB_CATS.forEach((zbCat) => {
              if ((process.env[zbCat].split(",")).includes(z2mEvent.data.definition.model)) {
                category = zbCat;
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

    if (!cameraItem?.locks) {
      console.log('assets.service unlockByMemberDetected out - no locks for camera');
      return;
    }

    console.log(`assets.service unlockByMemberDetected locks: ${JSON.stringify(cameraItem.locks)}`);

    const zbLockPromises: Promise<void>[] = [];

    // Unlock specific locks from occupancy/button triggers
    // Per Decision 28: all locks require a 'clicked' signal (occupancy sensor or button press).
    // ONVIF motion only starts surveillance-mode detection — it never directly unlocks.
    if (memberDetectedItem.clickedLocks && memberDetectedItem.clickedLocks.length > 0) {
      for (const lockAssetId of memberDetectedItem.clickedLocks) {
        console.log(`assets.service unlockByMemberDetected - unlocking specific lock: ${lockAssetId}`);
        zbLockPromises.push(this.unlockZbLock(lockAssetId));
      }
    } else {
      console.log('assets.service unlockByMemberDetected - no occupancy locks to unlock (ONVIF-only triggers do not unlock)');
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
        payload: JSON.stringify({ cam_ip: camera.localIp, lock_asset_id: lock.assetId })
      });

      return { cameraIp: camera.localIp, status: 'triggered' };
    });

    const results = await Promise.allSettled(triggerPromises);
    console.log('assets.service handleLockTouchEvent results: ' + JSON.stringify(results));

    console.log('assets.service handleLockTouchEvent out');

    return;
  }

  public async handleLockStopEvent(event: LockOccupancyEvent): Promise<any> {
    console.log('assets.service handleLockStopEvent in: ' + JSON.stringify(event));

    // 1. Look up lock by friendly name
    const z2mLocks: Z2mLock[] = await this.assetsDao.getZbLockByName(event.lockAssetName);

    if (z2mLocks.length === 0) {
      console.log(`assets.service handleLockStopEvent out - lock not found: ${event.lockAssetName}`);
      return;
    }

    const lock = z2mLocks[0];

    // 2. Use lock.cameras directly (populated by syncLockCameraReference)
    if (!lock.cameras || Object.keys(lock.cameras).length === 0) {
      console.log(`assets.service handleLockStopEvent out - no cameras for lock: ${lock.assetId}`);
      return;
    }

    // 3. Send stop_detection for each camera
    const stopPromises = Object.keys(lock.cameras).map(async (cameraAssetId: string) => {
      const camera = lock.cameras[cameraAssetId];
      console.log(`assets.service handleLockStopEvent stopping for camera: ${camera.localIp}`);

      await this.iotService.publish({
        topic: `gocheckin/stop_detection`,
        payload: JSON.stringify({ cam_ip: camera.localIp, lock_asset_id: lock.assetId })
      });

      return { cameraIp: camera.localIp, status: 'stop_sent' };
    });

    const results = await Promise.allSettled(stopPromises);
    console.log('assets.service handleLockStopEvent results: ' + JSON.stringify(results));

    console.log('assets.service handleLockStopEvent out');

    return;
  }

  public async handleButtonClickEvent(event: LockButtonEvent): Promise<any> {
    console.log('assets.service handleButtonClickEvent in: ' + JSON.stringify(event));

    // 1. Look up button by friendly name
    const z2mLocks: Z2mLock[] = await this.assetsDao.getZbLockByName(event.lockAssetName);

    if (z2mLocks.length === 0) {
      console.log(`assets.service handleButtonClickEvent out - button not found: ${event.lockAssetName}`);
      return;
    }

    const button = z2mLocks[0];

    // 2. Verify this is a companion button
    if (!button.companionOf) {
      console.log(`assets.service handleButtonClickEvent out - not a companion button: ${button.assetId}`);
      return;
    }

    // 3. Resolve parent lock
    const parentLock: Z2mLock = await this.assetsDao.getZbLockById(button.companionOf);
    if (!parentLock) {
      console.log(`assets.service handleButtonClickEvent out - parent lock not found: ${button.companionOf}`);
      return;
    }

    // 4. Handle based on button type
    if (button.buttonType === 'EXIT') {
      // EXIT button → direct unlock
      console.log(`assets.service handleButtonClickEvent EXIT button -> unlocking lock ${parentLock.assetId}`);
      await this.unlockZbLock(parentLock.assetId);
    } else if (button.buttonType === 'ENTRY') {
      // ENTRY button → trigger detection on parent lock's cameras
      if (!parentLock.cameras || Object.keys(parentLock.cameras).length === 0) {
        console.log(`assets.service handleButtonClickEvent out - no cameras for parent lock: ${parentLock.assetId}`);
        return;
      }

      const triggerPromises = Object.keys(parentLock.cameras).map(async (cameraAssetId: string) => {
        const camera = parentLock.cameras[cameraAssetId];
        console.log(`assets.service handleButtonClickEvent ENTRY button -> triggering detection for camera: ${camera.localIp}`);

        await this.iotService.publish({
          topic: `gocheckin/trigger_detection`,
          payload: JSON.stringify({ cam_ip: camera.localIp, lock_asset_id: parentLock.assetId })
        });

        return { cameraIp: camera.localIp, status: 'triggered' };
      });

      const results = await Promise.allSettled(triggerPromises);
      console.log('assets.service handleButtonClickEvent results: ' + JSON.stringify(results));
    }

    console.log('assets.service handleButtonClickEvent out');

    return;
  }

}