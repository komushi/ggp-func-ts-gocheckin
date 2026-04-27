# Scanner `undefined` Values in `hostPropertyCode`

## Overview

After a Greengrass restart, the TypeScript module logs show literal `"undefined"` strings embedded in `hostPropertyCode` (e.g. `"rulin-undefined"` and `"undefined-undefined"`). This causes the scanner record in DynamoDB to be saved with corrupted identifiers.

---

## Symptoms

| Symptom | Example from Log |
|---------|------------------|
| Existing DB record has partial `undefined` | `"hostPropertyCode":"rulin-undefined"` |
| New save after restart has full `undefined` | `"hostPropertyCode":"undefined-undefined"` |
| `scanner_detected` payload carries bad data | `hostId`, `propertyCode`, `hostPropertyCode` all affected |

**Log excerpt:**
```
assets.dao getScannerById out: [{"assetId":"neoseed_Core",...,"hostPropertyCode":"rulin-undefined",...}]
assets.dao createScanner in{"assetId":"neoseed_Core",...,"hostPropertyCode":"undefined-undefined",...}
```

---

## Root Cause

### 1. String interpolation of missing env vars

`assets.service.ts:455-462` builds the scanner item directly from `process.env` without checking whether the variables are set:

```typescript
const scannerItem: ScannerItem = {
  assetId: process.env.AWS_IOT_THING_NAME,
  ...
  hostId: process.env.HOST_ID,
  propertyCode: process.env.PROPERTY_CODE,
  hostPropertyCode: `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`,
  ...
};
```

When `HOST_ID` or `PROPERTY_CODE` is `undefined`, JavaScript coerces the value to the literal string `"undefined"`, producing concatenations like `"undefined-undefined"`.

### 2. Race condition at startup

`handler.ts` schedules two independent startup timers:

| Timer | Delay | Purpose |
|-------|-------|---------|
| `initializationService.intializeEnvVar()` | 1000 ms | Reads `Host` and `Property` from DynamoDB and populates `process.env.HOST_ID` / `process.env.PROPERTY_CODE` |
| `assetsService.refreshScanner()` | 2000 ms | Builds and saves the scanner record |

`refreshScanner()` runs unconditionally after 2 seconds. It does **not** wait for `intializeEnvVar()` to finish, nor does it wait for the IoT Classic Shadow delta (the other path that populates these env vars). If the DB queries inside `intializeEnvVar()` are slow, or if the shadow delta has not yet arrived, `HOST_ID` and `PROPERTY_CODE` are still `undefined` when `refreshScanner()` executes.

### 3. Existing record values are not reused

`refreshScanner()` fetches the existing scanner from DB to preserve `uuid`:

```typescript
const crtScanner: ScannerItem = await this.assetsDao.getScannerById(...);
```

…but it only reuses `uuid`. It does **not** fall back to the existing record's `hostId`, `propertyCode`, or `hostPropertyCode` when the env vars are missing. This means a restart can overwrite a previously valid `hostId` (`"rulin"`) with `undefined`.

---

## Affected Code

| File | Lines | Issue |
|------|-------|-------|
| `handler.ts` | 179-187 | `refreshScanner()` fires independently via `setTimeout(..., 2000)` |
| `assets.service.ts` | 448-482 | `refreshScanner()` builds scanner from env vars without null-checks |
| `assets.service.ts` | 455-462 | `hostPropertyCode` concatenation uses unchecked env vars |

---

## Proposed Fixes

### Option A: Make `refreshScanner` wait for initialization (recommended)

Move the `refreshScanner()` call to the end of `intializeEnvVar()` instead of a blind `setTimeout`:

```typescript
// In initialization.service.ts
public async intializeEnvVar(): Promise<any> {
  ...
  console.log('initialization.service intializeEnvVar out');

  // Only register scanner after env vars are confirmed present
  if (process.env.HOST_ID && process.env.PROPERTY_CODE) {
    await assetsService.refreshScanner();
  }
}
```

Remove the separate `setTimeout(refreshScanner, 2000)` from `handler.ts`.

**Pros:** Guarantees env vars exist before scanner registration.  
**Cons:** Slightly delays scanner availability on first cold start.

### Option B: Guard inside `refreshScanner`

Skip the DB write (or retry later) if required env vars are missing:

```typescript
public async refreshScanner(): Promise<any> {
  if (!process.env.HOST_ID || !process.env.PROPERTY_CODE) {
    console.warn('assets.service refreshScanner skipped: HOST_ID or PROPERTY_CODE not set');
    return;
  }
  ...
}
```

**Pros:** Minimal change, defensive.  
**Cons:** Scanner may never register if the env vars are never populated (hides the real problem).

### Option C: Preserve existing record fields

When an existing scanner record is present, fall back to its `hostId` / `propertyCode` / `hostPropertyCode` instead of rebuilding from env vars:

```typescript
const scannerItem: ScannerItem = {
  ...
  hostId: process.env.HOST_ID ?? crtScanner?.hostId ?? '',
  propertyCode: process.env.PROPERTY_CODE ?? crtScanner?.propertyCode ?? '',
  hostPropertyCode: (process.env.HOST_ID && process.env.PROPERTY_CODE)
    ? `${process.env.HOST_ID}-${process.env.PROPERTY_CODE}`
    : (crtScanner?.hostPropertyCode ?? ''),
  ...
};
```

**Pros:** Prevents corrupt overwrites on restart.  
**Cons:** Does not fix the underlying initialization race; may propagate stale values if host/property actually changed.

---

## Recommended Approach

Combine **Option A** (wait for initialization) with **Option B** (guard clause) for defense in depth. This ensures:

1. The scanner is only registered after the environment is confirmed ready.
2. Even if called from another path, `refreshScanner` will refuse to save garbage data.

---

## Related Files

- `handler.ts`
- `assets.service.ts`
- `initialization.service.ts`
