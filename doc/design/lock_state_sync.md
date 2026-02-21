# Lock Toggle Command Fix

## Overview

This document describes the simplification of the `unlockZbLock()` method to use the `TOGGLE` command instead of tracking lock state in DynamoDB.

## Problem

### Previous Implementation

```typescript
public async unlockZbLock(assetId: string): Promise<any> {
    const z2mLock = await this.assetsDao.getZbLockById(assetId);

    if (z2mLock) {
        let payload = {};

        if (z2mLock.state) {
            payload = { 'state': 'ON' };
            z2mLock.state = false;
        } else {
            payload = { 'state': 'OFF' };
            z2mLock.state = true;
        }

        await this.iotService.publish({
            topic: `zigbee2mqtt/${z2mLock.assetName}/set`,
            payload: JSON.stringify(payload)
        });

        await this.assetsDao.updateLock(z2mLock);  // ← Unnecessary state tracking
    }
}
```

**Issues:**
1. Tracks `state` in DynamoDB unnecessarily
2. State can drift if lock is controlled externally (dashboard, keypad)
3. Extra database write on every toggle

---

## Solution

Use `TOGGLE` command and let zigbee2mqtt handle state management:

```typescript
public async unlockZbLock(assetId: string): Promise<any> {
    const z2mLock = await this.assetsDao.getZbLockById(assetId);

    if (z2mLock) {
        await this.iotService.publish({
            topic: `zigbee2mqtt/${z2mLock.assetName}/set`,
            payload: JSON.stringify({ state: 'TOGGLE' })
        });
    }
}
```

**Benefits:**
- No state tracking needed in DynamoDB
- No state drift issues
- Simpler code, fewer database writes
- zigbee2mqtt handles the actual state

---

## Code Changes

### assets.service.ts - Simplified unlockZbLock()

```typescript
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
```

---

## MQTT Topics

| Topic | Payload |
|-------|---------|
| `zigbee2mqtt/{assetName}/set` | `{ "state": "TOGGLE" }` |

---

## Files Modified

| File | Change |
|------|--------|
| `packages/src/functions/assets/assets.service.ts` | Simplified `unlockZbLock()` to use TOGGLE |

---

## Note on Z2mLock.state

The `state` field in `Z2mLock` model is no longer used for toggle logic. It can be removed from the model if not needed elsewhere.

