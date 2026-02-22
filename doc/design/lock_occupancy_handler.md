# Lock Occupancy Handler (TypeScript)

## Overview

Handles Zigbee lock occupancy events and publishes `trigger_detection` / `stop_detection` messages to the Python component. For Python implementation, see [lock_triggered_detection.md](../../ggp-func-py-gocheckin/doc/lock_triggered_detection.md).

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Prerequisites** ([bidirectional_lock_camera.md](./bidirectional_lock_camera.md)) | ✅ DONE | `Z2mLockCameras`, `syncLockCameraReference()`, etc. |
| `LockOccupancyEvent` interface | ✅ DONE | `assets.models.ts:215-218` |
| `handleLockTouchEvent()` | ✅ DONE | `assets.service.ts:527` - publishes `trigger_detection` with `lock_asset_id` |
| `handleLockStopEvent()` | ✅ DONE | `assets.service.ts:559` - publishes `stop_detection` |
| `z2mOccupancyPattern` + handler | ✅ DONE | `handler.ts:12,57-76` - handles both `occupancy:true` and `occupancy:false` |
| `function.conf` topics | ✅ DONE | Both `trigger_detection` and `stop_detection` in outputTopics |
| `unlockByMemberDetected()` selective | ✅ DONE | `assets.service.ts:378` - selective unlock with fallback |
| `MemberDetectedItem` new fields | ✅ DONE | `assets.models.ts` - `clickedLocks` (was `occupancyTriggeredLocks`; `onvifTriggered` removed per Decision 28) |
| `GoCheckInLock.category` field | ✅ DONE | `assets.models.ts:48` - required for selective unlock |

---

## Flow Diagrams

### Occupancy:true (Start Detection)
```
zigbee2mqtt/{lockAssetName}/occupancy { "occupancy": true }
    → handler.ts: z2mOccupancyPattern.test()
    → assetsService.handleLockTouchEvent()
    → getZbLockByName() → lock.cameras
    → iotService.publish("gocheckin/trigger_detection", { cam_ip, lock_asset_id })
```

### Occupancy:false (Stop Detection)
```
zigbee2mqtt/{lockAssetName}/occupancy { "occupancy": false }
    → handler.ts: z2mOccupancyPattern.test()
    → assetsService.handleLockStopEvent()
    → iotService.publish("gocheckin/stop_detection", { cam_ip, lock_asset_id })
```

### Unlock Flow (member_detected)
```
gocheckin/member_detected { assetId, clickedLocks }
    → unlockByMemberDetected()
    → if clickedLocks.length > 0: unlock specific locks
    → else: no unlock (ONVIF-only triggers do not unlock, per Decision 28)
```

---

## MQTT Topics

| Topic | Direction | Payload |
|-------|-----------|---------|
| `zigbee2mqtt/{lock}/occupancy` | Input | `{ "occupancy": true/false }` |
| `gocheckin/member_detected` | Input | `{ assetId, clickedLocks, ... }` |
| `gocheckin/trigger_detection` | Output | `{ "cam_ip": "...", "lock_asset_id": "..." }` |
| `gocheckin/stop_detection` | Output | `{ "cam_ip": "...", "lock_asset_id": "..." }` |

---

## Selective Unlock Logic

| Trigger | member_detected Fields | Unlock Behavior |
|---------|------------------------|-----------------|
| Clicked event (occupancy sensor or LOCK_BUTTON) | `clickedLocks: [lockId]` | Unlock specific lock(s) |
| ONVIF motion only | `clickedLocks` empty/undefined | No unlock (surveillance only, per Decision 28) |

Per **Decision 28**, all locks require a "clicked" signal to unlock. ONVIF motion only starts surveillance-mode detection — it never directly unlocks.

---

## Files Modified

| File | Changes |
|------|---------|
| `assets.models.ts` | Added `category` to `GoCheckInLock`, added `clickedLocks` to `MemberDetectedItem` (was `occupancyTriggeredLocks`; `onvifTriggered` removed per Decision 28) |
| `assets.service.ts` | Added `handleLockStopEvent()`, updated `handleLockTouchEvent()` to include `lock_asset_id`, updated `unlockByMemberDetected()` with selective logic |
| `handler.ts` | Added `occupancy:false` branch |
| `function.conf` | Added `stop_detection` to outputTopics |

---

## Related Documentation

- [Bidirectional Lock-Camera Reference](./bidirectional_lock_camera.md)
- [Python: Lock-Triggered Detection](../../ggp-func-py-gocheckin/doc/lock_triggered_detection.md)
