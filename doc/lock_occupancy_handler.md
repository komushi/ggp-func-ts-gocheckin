# Lock Occupancy Handler

## Overview

This document describes the implementation of the lock occupancy event handler in the TypeScript component. When a Zigbee lock's occupancy sensor is triggered, this handler looks up associated cameras and publishes `trigger_detection` messages to start face detection.

## Prerequisites

The following must be implemented before this handler (see [Bidirectional Lock-Camera Reference](./bidirectional_lock_camera.md)):

| Component | Status |
|-----------|--------|
| `Z2mLockCamera`, `Z2mLockCameras` interfaces | ✅ DONE |
| `Z2mLock.cameras` field | ✅ DONE |
| `syncLockCameraReference()` | ✅ DONE |
| `removeCameraFromLock()` | ✅ DONE |
| `processCamerasShadowDelta()` bidirectional sync | ✅ DONE |
| `processCamerasShadowDeleted()` cleanup | ✅ DONE |

---

## Implementation Status

| Component | Status | Description |
|-----------|--------|-------------|
| `LockOccupancyEvent` interface | ✅ DONE | Event model for occupancy handler |
| `handleLockTouchEvent()` | ✅ DONE | Publishes trigger_detection for each camera |
| `handler.ts` occupancy pattern | ✅ DONE | Handles `zigbee2mqtt/+/occupancy` topic |
| `function.conf` inputTopics | ✅ DONE | Add `zigbee2mqtt/+/occupancy` |
| `function.conf` outputTopics | ✅ DONE | Add `trigger_detection` topic |

---

## Flow Diagram

```
zigbee2mqtt/{lockAssetName}/occupancy
Payload: { "occupancy": true }
         │
         ▼
handler.ts (function_handler)
         │
         ├─── z2mOccupancyPattern.test(topic)
         │
         └─── if (event.occupancy === true)
                   │
                   ▼
              assetsService.handleLockTouchEvent({
                  lockAssetName: "DC006",
                  occupancy: true
              })
                   │
                   ▼
              getZbLockByName(lockAssetName)
                   │
                   ▼
              Use lock.cameras{} directly
                   │
                   ▼
              For each camera in lock.cameras:
                   │
                   ▼
              iotService.publish({
                  topic: "gocheckin/trigger_detection",
                  payload: { cam_ip: camera.localIp }
              })
                   │
                   ▼
              Python component receives trigger_detection
              → starts face detection
```

---

## Code Changes

### 1. assets.models.ts - Add LockOccupancyEvent

Add the following interface:

```typescript
export interface LockOccupancyEvent {
    lockAssetName: string;  // Friendly name from zigbee2mqtt (e.g., "DC006")
    occupancy: boolean;     // Sensor state
}
```

**Location:** After the `Z2mLockCameras` interface (around line 212)

---

### 2. assets.service.ts - Add handleLockTouchEvent()

Add the following import to the imports section:

```typescript
import { ..., LockOccupancyEvent } from './assets.models';
```

Add the following method to the `AssetsService` class:

```typescript
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

    return;
}
```

**Location:** After `unlockByMemberDetected()` method (around line 459)

---

### 3. handler.ts - Add Occupancy Event Handler

Add the regex pattern at the top of the file (with other patterns):

```typescript
const z2mOccupancyPattern = new RegExp(`^zigbee2mqtt\/(.+)\/occupancy$`);
```

Add the handler in `function_handler()` (in the topic matching chain):

```typescript
} else if (z2mOccupancyPattern.test(context.clientContext.Custom.subject)) {
    const match = context.clientContext.Custom.subject.match(z2mOccupancyPattern);
    const lockAssetName = match ? match[1] : null;

    console.log('z2mOccupancyPattern topic: ' + context.clientContext.Custom.subject
                + ' event: ' + JSON.stringify(event));

    if (event.occupancy === true && lockAssetName) {
        await assetsService.handleLockTouchEvent({
            lockAssetName: lockAssetName,
            occupancy: event.occupancy
        });
    }
}
```

**Location:** Add as a new `else if` branch in the topic matching chain

---

### 4. function.conf - Update Topics

Update the `inputTopics` to include the occupancy topic:

```hocon
inputTopics = [
    "$aws/things/"${AWS_IOT_THING_NAME}"/shadow/name/+/update/delta",
    "$aws/things/"${AWS_IOT_THING_NAME}"/shadow/update/delta",
    "gocheckin/member_detected",
    "zigbee2mqtt/bridge/event",
    "zigbee2mqtt/bridge/response/device/rename",
    "zigbee2mqtt/bridge/response/device/remove",
    "zigbee2mqtt/+/occupancy"
]
```

Update the `outputTopics` to include the trigger_detection topic:

```hocon
outputTopics = [
    "$aws/things/"${AWS_IOT_THING_NAME}"/shadow/name/+/update",
    "$aws/things/"${AWS_IOT_THING_NAME}"/shadow/name/+/get",
    "$aws/things/"${AWS_IOT_THING_NAME}"/shadow/update",
    "gocheckin/"${AWS_IOT_THING_NAME}"/camera_detected",
    "gocheckin/"${AWS_IOT_THING_NAME}"/scanner_detected",
    "gocheckin/"${AWS_IOT_THING_NAME}"/zb_lock_detected",
    "gocheckin/"${AWS_IOT_THING_NAME}"/zb_lock_removed",
    "gocheckin/"${AWS_IOT_THING_NAME}"/camera_removed",
    "gocheckin/fetch_cameras",
    "gocheckin/reset_camera",
    "zigbee2mqtt/+/set",
    "gocheckin/trigger_detection"
]
```

---

## MQTT Topics

### Input Topic

| Topic | Publisher | Payload |
|-------|-----------|---------|
| `zigbee2mqtt/{lockAssetName}/occupancy` | zigbee2mqtt | `{ "occupancy": true }` |

### Output Topic

| Topic | Subscriber | Payload |
|-------|------------|---------|
| `gocheckin/trigger_detection` | Python component | `{ "cam_ip": "192.168.1.x" }` |

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Lock not found by assetName | No detection triggered, warning logged |
| Lock has no cameras associated | No detection triggered, warning logged |
| Lock has multiple cameras | Detection triggered on ALL cameras |
| `occupancy: false` received | Ignored (only `true` triggers) |
| Lock assetName contains special chars | Regex captures full name between slashes |

---

## Testing

### Manual Test Steps

1. **Verify lock-camera association:**
   ```bash
   # Check if lock has cameras in DynamoDB
   aws dynamodb scan --table-name iot-ggv2-component-asset \
     --filter-expression "category = :cat" \
     --expression-attribute-values '{":cat":{"S":"LOCK"}}'
   ```

2. **Simulate occupancy event:**
   ```bash
   # Publish test message to zigbee2mqtt topic
   mosquitto_pub -h localhost -t "zigbee2mqtt/DC006/occupancy" \
     -m '{"occupancy": true}'
   ```

3. **Verify trigger_detection published:**
   ```bash
   # Subscribe to trigger_detection topic
   mosquitto_sub -h localhost -t "gocheckin/trigger_detection"
   ```

4. **Check Python component logs:**
   ```bash
   # Verify face detection started
   tail -f /greengrass/v2/logs/ggp-func-py-gocheckin.log | grep trigger_detection
   ```

---

## Files to Modify

| File | Change |
|------|--------|
| `packages/src/functions/assets/assets.models.ts` | Add `LockOccupancyEvent` interface |
| `packages/src/functions/assets/assets.service.ts` | Add `handleLockTouchEvent()` method |
| `packages/src/handler.ts` | Add `z2mOccupancyPattern` and handler |
| `function.conf` | Add input/output topics |

---

## Related Documentation

- [Bidirectional Lock-Camera Reference](./bidirectional_lock_camera.md) - Prerequisite: lock→camera data model (✅ DONE)
- [Lock-Triggered Face Detection](../../ggp-func-py-gocheckin/doc/lock_triggered_detection.md) - Main feature documentation
- [ONVIF Notifications](../../ggp-func-py-gocheckin/doc/onvif_notifications.md) - Original motion handling (now recording only)
