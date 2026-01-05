# Bidirectional Lock-Camera Reference

## Overview

This document describes the data model enhancement that creates a bidirectional relationship between locks and cameras, enabling efficient lookup of cameras when a lock occupancy event is received.

## Problem

The current data model only stores the Camera → Locks relationship:

```typescript
interface NamedShadowCamera {
    locks: {
        [lockAssetId: string]: GoCheckInLock;
    };
}
```

When a lock occupancy event arrives, we need to find which cameras are associated with that lock. Without a reverse reference, this requires querying all cameras and filtering - inefficient for frequent events.

## Solution

Extend the `Z2mLock` model to include a `cameras` object that stores references back to associated cameras.

---

## Data Model Changes

### Extended Z2mLock Model

```typescript
export interface Z2mLock {
    hostId: string;
    uuid: string;
    propertyCode: string;
    hostPropertyCode: string;
    coreName: string;
    assetName: string;       // Friendly name (e.g., "DC006")
    assetId: string;         // IEEE address
    roomCode?: string;
    withKeypad: boolean;
    category: string;
    vendor: string;
    model: string;
    state: boolean;
    lastUpdateOn: string;
    cameras?: Z2mLockCameras;  // NEW: cameras associated with this lock
}

export interface Z2mLockCamera {
    assetId: string;   // Camera asset ID (same as key)
    localIp: string;   // Camera IP for trigger_detection payload
}

export interface Z2mLockCameras {
    [assetId: string]: Z2mLockCamera;  // Keyed by camera assetId
}
```

### Existing Camera Model (Unchanged)

```typescript
interface NamedShadowCamera {
    hostId: string;
    uuid: string;
    localIp: string;
    assetId: string;
    locks: {
        [assetId: string]: {
            assetId: string;
            assetName: string;
            withKeypad: boolean;
        }
    };
    // ... other fields
}
```

---

## Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BIDIRECTIONAL RELATIONSHIP                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

   NamedShadowCamera                              Z2mLock
┌─────────────────────┐                     ┌─────────────────────┐
│ uuid: "cam-001"     │                     │ assetId: "lock-001" │
│ assetId: "cam-001"  │                     │ assetName: "DC006"  │
│ localIp: "10.0.0.1" │                     │ cameras: {          │
│ locks: {            │ ───────────────────>│   "cam-001": {      │
│   "lock-001": {...} │                     │     assetId: "cam-001",
│ }                   │ <───────────────────│     localIp:"10.0.0.1"
└─────────────────────┘                     │   }                 │
                                            │ }                   │
        Camera → Lock                       └─────────────────────┘
     (existing, from cloud)                      Lock → Camera
                                            (new, synced locally)
```

---

## Scenario Coverage

| Scenario | Handler | Action |
|----------|---------|--------|
| Camera created with locks | `processCamerasShadowDelta()` | `syncLockCameraReference()` for each lock |
| Camera updated - lock added | `processCamerasShadowDelta()` | `syncLockCameraReference()` for new lock |
| Camera updated - lock removed | `processCamerasShadowDelta()` | `removeCameraFromLock()` for removed lock |
| Camera updated - lock unchanged | `processCamerasShadowDelta()` | `syncLockCameraReference()` (updates if IP changed) |
| Camera deleted | `processCamerasShadowDeleted()` | `removeCameraFromLock()` for all associated locks |
| Lock deleted | `removeZigbee()` | No cleanup needed (lock record deleted with cameras) |

---

## Sync Mechanism

### When Camera Shadow is Updated

In `processCamerasShadowDelta()`, compare old and new locks to handle additions and removals:

```typescript
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

    // ... rest of existing code ...
}
```

### When Camera Shadow is Deleted

In `processCamerasShadowDeleted()`, get camera before deletion to clean up lock references:

```typescript
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

    // ... rest of existing code (publish events) ...
}
```

---

## Helper Methods

### syncLockCameraReference

Adds or updates a camera reference in a lock's `cameras` object:

```typescript
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
```

### removeCameraFromLock

Removes a camera reference from a lock's `cameras` object:

```typescript
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
```

---

## Usage in Lock Occupancy Handler

When an occupancy event is received, the lock record already contains the camera references:

```typescript
public async handleLockTouchEvent(event: LockOccupancyEvent): Promise<any> {
    // 1. Look up lock by friendly name
    const z2mLocks = await this.assetsDao.getZbLockByName(event.lockAssetName);
    const lock = z2mLocks[0];

    // 2. Use lock.cameras directly - no additional query needed!
    if (!lock.cameras || Object.keys(lock.cameras).length === 0) {
        return;  // No cameras associated
    }

    // 3. Trigger detection on each camera
    for (const cameraAssetId of Object.keys(lock.cameras)) {
        const camera = lock.cameras[cameraAssetId];
        await this.iotService.publish({
            topic: `gocheckin/${AWS_IOT_THING_NAME}/trigger_detection`,
            payload: JSON.stringify({ cam_ip: camera.localIp })
        });
    }
}
```

---

## Performance Comparison

| Operation | Without Bidirectional | With Bidirectional |
|-----------|----------------------|-------------------|
| Lock occupancy event | O(n) - query all cameras, filter | O(1) - direct lookup |
| Camera shadow update | O(1) | O(k) - k = number of locks |
| Camera shadow delete | O(1) | O(k) - k = number of locks |
| Memory overhead | None | ~50 bytes per lock-camera pair |

For frequent occupancy events (multiple per minute), the bidirectional approach significantly reduces database queries.

---

## DynamoDB Considerations

The `cameras` object is stored as a Map attribute in DynamoDB. Maximum item size (400KB) should not be a concern as each camera reference is ~50 bytes.

```json
{
    "hostId": "host-123",
    "uuid": "0x00158d0001234567",
    "assetId": "0x00158d0001234567",
    "assetName": "DC006",
    "category": "LOCK",
    "cameras": {
        "cam-001": { "assetId": "cam-001", "localIp": "192.168.1.100" },
        "cam-002": { "assetId": "cam-002", "localIp": "192.168.1.101" }
    }
}
```

---

## Related Documentation

- [Lock-Triggered Face Detection](../../ggp-func-py-gocheckin/doc/lock_triggered_detection.md) - Main feature documentation
