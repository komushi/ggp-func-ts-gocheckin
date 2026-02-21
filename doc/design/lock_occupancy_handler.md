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
| `MemberDetectedItem` new fields | ✅ DONE | `assets.models.ts:236-237` - `onvifTriggered`, `occupancyTriggeredLocks` |
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
gocheckin/member_detected { assetId, onvifTriggered, occupancyTriggeredLocks }
    → unlockByMemberDetected()
    → if occupancyTriggeredLocks.length > 0: unlock specific locks
    → if onvifTriggered: unlock legacy locks (category !== 'KEYPAD_LOCK')
    → if no context: fallback to unlock all (legacy behavior)
```

---

## MQTT Topics

| Topic | Direction | Payload |
|-------|-----------|---------|
| `zigbee2mqtt/{lock}/occupancy` | Input | `{ "occupancy": true/false }` |
| `gocheckin/member_detected` | Input | `{ assetId, onvifTriggered, occupancyTriggeredLocks, ... }` |
| `gocheckin/trigger_detection` | Output | `{ "cam_ip": "...", "lock_asset_id": "..." }` |
| `gocheckin/stop_detection` | Output | `{ "cam_ip": "...", "lock_asset_id": "..." }` |

---

## Selective Unlock Logic

| Trigger | member_detected Fields | Unlock Behavior |
|---------|------------------------|-----------------|
| Occupancy sensor | `occupancyTriggeredLocks: [lockId]` | Unlock specific lock only |
| ONVIF motion | `onvifTriggered: true` | Unlock legacy locks (`withKeypad !== true`) |
| Both (merged) | Both fields set | Unlock legacy + specific locks |
| No context | Both undefined/empty | Fallback: unlock all camera locks |

**Lock Sensor Flag (`withKeypad`):**
- `withKeypad: true` → has occupancy sensor, requires occupancy trigger to unlock
- `withKeypad: false` or missing → legacy lock, unlocks via ONVIF motion

**Note:** `camera.locks` is enriched with `withKeypad` from local `Z2mLock` records in `processCamerasShadowDelta()`.

---

## Files Modified

| File | Changes |
|------|---------|
| `assets.models.ts` | Added `category` to `GoCheckInLock`, added `onvifTriggered`/`occupancyTriggeredLocks` to `MemberDetectedItem` |
| `assets.service.ts` | Added `handleLockStopEvent()`, updated `handleLockTouchEvent()` to include `lock_asset_id`, updated `unlockByMemberDetected()` with selective logic |
| `handler.ts` | Added `occupancy:false` branch |
| `function.conf` | Added `stop_detection` to outputTopics |

---

## Related Documentation

- [Bidirectional Lock-Camera Reference](./bidirectional_lock_camera.md)
- [Python: Lock-Triggered Detection](../../ggp-func-py-gocheckin/doc/lock_triggered_detection.md)
