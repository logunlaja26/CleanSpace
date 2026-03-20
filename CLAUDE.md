# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CleanSpace** is a privacy-first iOS storage management app built with React Native + TypeScript that helps users free up device storage through intelligent duplicate detection, compression, and photo organization.

**Critical Architecture Principle: Local-First, Cloud-Optional**
- SQLite is the source of truth, handles all data operations locally
- All user actions update SQLite first (instant, offline-capable)
- Supabase sync is optional, happens in background via sync queue
- Never block UI on network requests
- Full functionality must work offline

## Development Commands

### Setup & Installation (Expo)
```bash
# Install dependencies
npm install

# Install Expo CLI and EAS CLI globally (recommended)
npm install -g expo-cli eas-cli

# For development builds (when you need native features):
# Option 1: Use EAS Build (cloud build)
eas build:configure
eas build --profile development --platform ios

# Option 2: Build locally with Expo prebuild
npx expo prebuild --platform ios
cd ios && pod install && cd ..
```

### Running the App
```bash
# Start Expo development server
npx expo start

# Run on iOS simulator (with development build)
npx expo run:ios

# Run on physical device with Expo Go (for basic testing)
npx expo start
# Then scan QR code with Expo Go app

 # Clear Metro bundler cache
npx expo start -c

# Run on specific physical device with development build (REQUIRED for photo library access)
npx expo run:ios --device

# Alternative: Use device name
npx expo run:ios --device "iPhone Name"
```

### Build & Clean
```bash
# Clean Expo build
rm -rf node_modules ios android .expo
npm install
npx expo prebuild --clean

# Build for release with EAS (recommended)
eas build --platform ios --profile production

# Traditional Xcode build (after expo prebuild)
cd ios && xcodebuild -workspace PhotoVideoCleaner.xcworkspace -scheme PhotoVideoCleaner -configuration Release
```

**Important:** Physical iOS device is REQUIRED for development and testing. Simulator cannot access real photo library or test PhotoKit features.

## Architecture Deep Dive

### Hybrid SQLite + Supabase Pattern

**Data Flow (Critical to Understand):**
```
User Action → SQLite (instant) → Sync Queue (enqueue) → Supabase (background)
```

**SQLite Database Layer** (`src/database/`)
- Primary data store, handles 100% of app operations
- Must achieve <100ms query response times
- Uses WAL mode for concurrent reads/writes
- All tables indexed appropriately for common queries
- Batch transactions for bulk operations (100+ rows)

**Supabase Cloud Layer** (optional)
- ONLY syncs: preferences, duplicate decisions, analytics summaries, photo hashes
- NEVER syncs: actual photos, full file URIs, sensitive data
- User must explicitly opt-in to cloud sync

### Database Schema (Critical Tables)

**Core Photo Tables:**
- `photos` - Master registry (metadata, flags, timestamps)
- `photo_hashes` - Multiple hash types (md5, perceptual, dhash, average)
- `duplicate_groups` - Organized duplicate collections with confidence scores
- `photo_duplicate_mapping` - Many-to-many links between photos and groups

**System Tables:**
- `usage_limits` - Freemium enforcement (scans_performed, duplicates_cleaned, period tracking)
- `scan_history` - Audit trail of all scans
- `sync_queue` - Local changes awaiting cloud sync
- `user_preferences` - App settings and feature toggles

**SQLite Performance PRAGMAs (Apply on DB Init):**
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456;
```

### Service Layer Architecture

**PhotoScanner Service** (`src/services/PhotoScanner.ts`)
- Batch processing: Load 100 photos at a time
- Two-phase hashing: MD5 immediate, advanced hashes in background
- Update scan_history and storage_analytics after completion
- Throttle if battery low

**DuplicateDetector Service** (`src/services/DuplicateDetector.ts`)
- Four detection algorithms:
  - Exact: Same MD5 (confidence 1.0)
  - Visual similarity: Perceptual hash + Hamming distance (0-5 = very similar)
  - Burst: Photos within 2 seconds + same location (confidence 0.95)
  - Screenshot groups: Date-based clustering (confidence 0.85)

**SyncService** (`src/services/SyncService.ts`)
- Never blocks local operations
- Processes sync_queue in background
- Batch API requests (50-100 items)
- Exponential backoff for retries

### Freemium Tier Enforcement

**Free Tier Limits:**
- 3 scans per month (monthly reset)
- 50 photos cleanup per period
- Compression, AI recommendations, background scanning, cloud sync: DISABLED

**Implementation Pattern:**
1. Check `usage_limits` table before scan/cleanup operations
2. Throw `LimitReachedError` if limit exceeded
3. Show remaining usage in UI proactively
4. Reset monthly counters based on `period_start_date`
5. Local-first: All checks happen in SQLite (no network)

**Pro Tier:**
- Unlimited scans and cleanup
- All features enabled
- Managed via RevenueCat (preferred) or StoreKit

### Performance Requirements

**Mandatory Optimizations:**
- Virtual scrolling for all photo lists (FlashList, not FlatList)
- Render only visible items + buffer
- Release photo objects after processing
- Clear thumbnail cache periodically
- Monitor iOS memory warnings
- Use React.memo for expensive components
- Avoid inline function definitions in render

**Batch Processing Pattern:**
- SQLite: Batch inserts in transactions (100+ rows)
- Network: Batch requests (50-100 items)
- Photo scanning: Process 100 at a time
- Commit after batch, not individual items

### iOS-Specific Requirements

**Required Info.plist Permissions:**
- `NSPhotoLibraryUsageDescription`
- `NSPhotoLibraryAddUsageDescription`
- `NSCameraUsageDescription`

**Required Xcode Capabilities:**
- Photo Library capability
- Code signing with Apple Developer account

**Testing Requirements:**
- Test on iPhone 8 (minimum spec) AND latest iPhone
- Test with 10,000+ photo libraries
- Measure battery drain during scanning
- All features MUST work offline

## Project Structure Conventions

```
src/
  database/           # SQLite layer - all DB operations here
    schema.ts         # Table definitions
    init.ts           # DB initialization + PRAGMAs
    migrations.ts     # Schema migrations
    queries/          # Query modules by domain
  services/           # Business logic - stateless services
  screens/            # Full-screen UI components
  components/         # Reusable UI components
  utils/              # Pure helper functions
```

**Key Conventions:**
- Database operations: ONLY in `src/database/queries/`
- Business logic: ONLY in `src/services/`
- Never put business logic in screens/components
- All services should be stateless and testable

## Privacy & Security

**Critical Privacy Rules:**
- Photo analysis happens 100% locally
- Never upload actual photo files to cloud
- Supabase sync requires explicit user opt-in
- Store only metadata and hashes, never full file paths in cloud
- All features must work with cloud sync disabled

## Testing Strategy

**Required Test Coverage:**
- Unit: Database operations, hash functions, duplicate detection algorithms
- Integration: Full scan workflow, duplicate detection end-to-end, deletion workflow
- Performance: Test with 0, 50, 500, 5000, 10,000+ photos
- Device: Multiple devices and iOS versions

**Performance Benchmarks:**
- SQLite queries: <100ms response time
- Photo scanning: Process 100 photos in <5 seconds
- Duplicate detection: Handle 10,000+ photos
- Memory: Stay under iOS memory limits

## Expo-Specific Code Patterns

### Database (expo-sqlite vs react-native-sqlite-storage)

**Expo SQLite Initialization:**
```typescript
import * as SQLite from 'expo-sqlite';

// Open database
const db = SQLite.openDatabase('cleanspace.db');

// Execute query
db.transaction(tx => {
  tx.executeSql(
    'SELECT * FROM photos WHERE is_deleted = 0',
    [],
    (_, { rows }) => console.log(rows._array),
    (_, error) => console.error(error)
  );
});

// Batch operations
db.transaction(tx => {
  photos.forEach(photo => {
    tx.executeSql(
      'INSERT INTO photos (uri, filename, size) VALUES (?, ?, ?)',
      [photo.uri, photo.filename, photo.size]
    );
  });
});
```

### Media Library Access (expo-media-library)

**Request Permissions:**
```typescript
import * as MediaLibrary from 'expo-media-library';

// Request permission
const { status } = await MediaLibrary.requestPermissionsAsync();
if (status !== 'granted') {
  throw new Error('Permission denied');
}
```

**Fetch Photos in Batches:**
```typescript
const fetchPhotos = async (limit = 100, after?: string) => {
  const result = await MediaLibrary.getAssetsAsync({
    first: limit,
    after: after,
    mediaType: 'photo',
    sortBy: MediaLibrary.SortBy.creationTime,
  });

  return {
    assets: result.assets,
    hasNextPage: result.hasNextPage,
    endCursor: result.endCursor,
  };
};

// Process in batches
let after: string | undefined;
let hasMore = true;

while (hasMore) {
  const { assets, hasNextPage, endCursor } = await fetchPhotos(100, after);

  // Process batch
  await processBatch(assets);

  hasMore = hasNextPage;
  after = endCursor;
}
```

**Get Asset Info:**
```typescript
const getAssetInfo = async (assetId: string) => {
  const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
  return {
    uri: assetInfo.localUri || assetInfo.uri,
    filename: assetInfo.filename,
    width: assetInfo.width,
    height: assetInfo.height,
    fileSize: assetInfo.fileSize,
    creationTime: assetInfo.creationTime,
    location: assetInfo.location,
    exif: assetInfo.exif,
  };
};
```

### File System Operations (expo-file-system)

```typescript
import * as FileSystem from 'expo-file-system';

// Read file
const content = await FileSystem.readAsStringAsync(uri);

// Get file info
const info = await FileSystem.getInfoAsync(uri);
console.log(info.size); // File size in bytes

// Copy file
await FileSystem.copyAsync({
  from: sourceUri,
  to: destinationUri,
});

// Delete file
await FileSystem.deleteAsync(uri, { idempotent: true });
```

### Background Tasks (expo-task-manager + expo-background-fetch)

```typescript
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_SCAN_TASK = 'background-photo-scan';

// Define background task
TaskManager.defineTask(BACKGROUND_SCAN_TASK, async () => {
  try {
    // Check battery level and WiFi
    const batteryLevel = await getBatteryLevel();
    if (batteryLevel < 0.2) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Perform quick scan
    await quickScan();

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Register background task
const registerBackgroundTask = async () => {
  await BackgroundFetch.registerTaskAsync(BACKGROUND_SCAN_TASK, {
    minimumInterval: 60 * 60 * 24, // 24 hours
    stopOnTerminate: false,
    startOnBoot: true,
  });
};
```

## Common Patterns

### Check Usage Limits Before Actions
```typescript
const usageManager = new UsageManager();
const {allowed, remaining} = await usageManager.canPerformScan();
if (!allowed) {
  throw new LimitReachedError('free_scan_limit');
}
// Perform action...
await usageManager.recordScan();
```

### Batch Database Operations
```typescript
await db.transaction(async (tx) => {
  for (const batch of photos.chunked(100)) {
    await tx.executeBatch(insertStatement, batch);
  }
});
```

### Optimistic UI Updates
```typescript
// Update UI immediately
updateLocalState(optimisticValue);

// Update SQLite
await db.update(...);

// Queue for sync (background)
await syncQueue.enqueue(change);
```

## Tech Stack Summary

- **Framework:** Expo (with development builds for native access)
- **Frontend:** React Native + TypeScript, React Navigation, NativeWind/Tailwind, FlashList
- **Local Storage:** expo-sqlite
- **Cloud Backend:** Supabase (Postgres, Auth, Storage, Edge Functions)
- **Device APIs:** expo-media-library, expo-file-system, expo-image-picker, PhotoKit (via custom module if needed)
- **Monetization:** expo-in-app-purchases or RevenueCat (react-native-purchases)
- **Permissions:** expo-permissions + config plugins
- **Background Tasks:** expo-task-manager, expo-background-fetch
- **Build & Deploy:** EAS Build, EAS Submit, EAS Update

## Key Features Implementation Notes

**Compression (Pro Only):**
- JPEG → HEIC conversion
- H.264 → HEVC conversion
- Preserve all EXIF metadata, timestamps, album associations

**AI Quality Scoring (Future Enhancement - SHELVED):**
- Current: Basic heuristic ranking (file size, resolution, format)
- Future: Advanced ML-based scoring (sharpness, exposure, composition)
- Local ML only - Cloud-based AI shelved to maintain privacy-first principle
- Mark best photo with `is_primary` flag in `photo_duplicate_mapping`

**Background Scanning (Pro Only):**
- Use react-native-background-fetch
- Respect battery state
- Throttle when battery low or app backgrounded

---

## Step-by-Step Development Plan

This is the recommended sequence for building the CleanSpace app from scratch. Following this order ensures you can see and interact with the app early, then progressively add functionality.

### Phase 0: Project Initialization (Expo)

**Goal:** Get a working Expo iOS project with all dependencies installed.

- [X] **Create Expo Project with TypeScript**
   ```bash
   npx create-expo-app@latest . --template expo-template-blank-typescript

   # Install Expo and EAS CLI globally (recommended)
   npm install -g expo-cli eas-cli
   ```

- [X] **Install All Expo-Compatible Dependencies**
   ```bash
   # Core Expo libraries
   npx expo install expo-sqlite expo-media-library expo-image-picker
   npx expo install expo-file-system expo-permissions
   npx expo install expo-device expo-application
   npx expo install expo-task-manager expo-background-fetch

   # External libraries
   npm install @supabase/supabase-js @tanstack/react-query

   # UI libraries
   npm install @shopify/flash-list
   npx expo install @react-navigation/native @react-navigation/native-stack
   npx expo install react-native-screens react-native-safe-area-context
   npm install nativewind tailwindcss

   # Monetization (choose one)
   npm install react-native-purchases
   ```

- [X] **Configure app.json for iOS Permissions**
   - [X] Set app name, slug, and bundle identifier
   - [X] Add iOS-specific configuration
   - [X] Configure Info.plist permissions:
     - [X] NSPhotoLibraryUsageDescription
     - [X] NSPhotoLibraryAddUsageDescription
     - [X] NSCameraUsageDescription
   - [X] Add expo-media-library plugin with permissions

- [X] **Set Up NativeWind/Tailwind**
   - [X] Create `tailwind.config.js`: `npx tailwindcss init`
   - [X] Configure `babel.config.js` for NativeWind with expo preset
   - [X] Add nativewind/babel plugin

- [X] **Create Development Build (for native features)**
   ```bash
   # Option 1: EAS Build (cloud-based)
   eas build:configure
   eas build --profile development --platform ios

   # Option 2: Local build
   npx expo prebuild --platform ios
   cd ios && pod install && cd ..
   ```

- [X] **Test Run**
   ```bash
   # Start Expo dev server
   npx expo start

   # Run on iOS simulator (requires development build)
   npx expo run:ios
   ```
   - [X] Verify app launches successfully on simulator or device

---

### Phase 1: UI/UX Development (Build All Screens First)

**Goal:** Create all screen layouts and navigation with mock data. This lets you see the app flow and refine UX before implementing complex backend logic.

#### 1.1 Navigation Structure Setup

**Create:**
- [X] `src/navigation/AppNavigator.tsx` - Main navigation container
- [X] Set up React Navigation with stack navigator
- [X] Define all screen routes (Dashboard, PhotoLibrary, Duplicates, LargeFiles, Screenshots, Settings)

**Mock navigation flow:**
```
Dashboard (Home)
├── Photo Library
├── Duplicates
├── Large Files
├── Screenshots
└── Settings
```

#### 1.2 Dashboard Screen (Home)

**File:** `src/screens/Dashboard.tsx`

**Build with mock data:**
- [X] Storage overview card (total used/free space)
- [X] Storage breakdown chart (photos, videos, screenshots)
- [X] Duplicate groups summary card
- [X] Potential savings estimate
- [X] Quick action cards for each category
- [X] Last scan timestamp
- [X] "Start Scan" primary CTA button

**Mock data examples:**
```typescript
const mockData = {
  totalPhotos: 5420,
  totalSize: '12.3 GB',
  duplicateGroups: 47,
  potentialSavings: '2.1 GB',
  lastScan: '2 hours ago'
};
```

#### 1.3 Photo Library Screen

**File:** `src/screens/PhotoLibrary.tsx`

**Build components:**
- [X] `src/components/PhotoGrid.tsx` - Grid layout using FlashList
- [X] Filter bar (date range, size range, type)
- [X] Sort options dropdown (date, size, name)
- [X] Bulk selection mode toggle
- [X] Selection counter and action bar

**Mock data:**
- [X] Array of 50-100 mock photo objects with thumbnails (use placeholder images or random image URLs)
- [X] Demonstrate virtual scrolling performance

#### 1.4 Duplicates Screen

**File:** `src/screens/Duplicates.tsx`

**Build components:**
- [X] `src/components/DuplicateGroup.tsx` - Expandable group card
- [X] Side-by-side comparison view
- [X] Quality indicators (blur detection, exposure, size)
- [X] "Keep" vs "Delete" selection UI
- [X] Batch action buttons
- [X] Savings estimate per group

**Mock data:**
```typescript
const mockDuplicates = [
  {
    groupId: 1,
    type: 'exact',
    photoCount: 3,
    totalSize: '8.4 MB',
    savings: '5.6 MB',
    confidence: 1.0,
    photos: [...]
  }
];
```

#### 1.5 Large Files Screen

**File:** `src/screens/LargeFiles.tsx`

**Build components:**
- [X] List view with file size emphasis
- [X] Color coding by size (red for >10MB, yellow for 5-10MB)
- [X] Compression options for each file
- [X] Estimated savings after compression
- [X] Bulk delete option

- [X] **Mock large file items with sizes ranging from 5MB to 50MB**

#### 1.6 Screenshots Screen

**File:** `src/screens/Screenshots.tsx`

**Build components:**
- [X] Grouped by date ranges (Today, Yesterday, Last Week, Last Month, Older)
- [X] Quick delete buttons per group
- [X] Select all within date range
- [X] Preview grid

- [X] **Mock 20-30 screenshot items grouped by dates**

#### 1.7 Settings Screen

**File:** `src/screens/Settings.tsx`

**Build sections:**
- [X] Account & Subscription
  - [X] Current tier display (Free/Pro)
  - [X] Upgrade button
  - [X] Usage stats (scans remaining, cleanups remaining)
- [X] Scanning Preferences
  - [X] Auto-scan toggle
  - [X] Scan frequency
  - [X] Scan only when charging
- [X] Duplicate Detection
  - [X] Similarity threshold slider
  - [X] Include screenshots toggle
  - [X] Include burst photos toggle
- [X] Cloud Sync
  - [X] Enable/disable toggle
  - [X] Last sync timestamp
  - [X] Sync now button
- [X] Storage Management
  - [X] Clear cache button
  - [X] Reset database (danger zone)
- [X] About
  - [X] App version
  - [X] Privacy policy
  - [X] Terms of service

#### 1.8 Shared Components

**Create reusable components:**
- [X] `src/components/ProgressBar.tsx` - Progress indicator (completed in Phase 2)
- [ ] `src/components/StorageChart.tsx` - Pie/donut chart for storage breakdown (deferred)
- [ ] `src/components/ConfirmDialog.tsx` - Modal for confirmations (deferred)
- [ ] `src/components/UsageBanner.tsx` - Free tier limit display (deferred)
- [X] `src/components/Button.tsx` - Styled button component (completed in Phase 2)
- [X] `src/components/Card.tsx` - Card container component (completed in Phase 2)
- [X] `src/components/Badge.tsx` - Badge/pill component (completed in Phase 2)
- [X] `src/components/LoadingSpinner.tsx` - Loading indicator (completed in Phase 2)
- [X] `src/components/EmptyState.tsx` - Empty state display (completed in Phase 2)
- [X] `src/components/ErrorState.tsx` - Error state display (completed in Phase 2)

#### 1.9 Paywall/Upgrade Screen

**File:** `src/screens/Paywall.tsx`

**Build:**
- [X] Feature comparison table (Free vs Pro)
- [X] Pricing display
- [X] Purchase button (non-functional at this stage)
- [X] Restore purchases button
- [X] Close/dismiss option

**Checkpoint:** ✅ COMPLETED - At this point, you should be able to navigate through all screens, interact with UI elements (with mock data), and have a complete visual sense of the app.

---

### Phase 2: Theme & Design System

**Goal:** Establish consistent styling and theming.

- [X] **Create Design Tokens**
   - [X] `src/theme/colors.ts` - Color palette with semantic tokens
   - [X] `src/theme/typography.ts` - Font styles, sizes, weights
   - [X] `src/theme/spacing.ts` - Spacing scale, layout values, shadows
   - [X] `src/theme/index.ts` - Export theme object and style presets

- [X] **Create Shared UI Components**
   - [X] `src/components/Button.tsx` - Themed button with haptic feedback
   - [X] `src/components/Card.tsx` - Card container component
   - [X] `src/components/Badge.tsx` - Badge/pill for status indicators
   - [X] `src/components/ProgressBar.tsx` - Progress indicator
   - [X] `src/components/LoadingSpinner.tsx` - Loading states
   - [X] `src/components/EmptyState.tsx` - Empty state display
   - [X] `src/components/ErrorState.tsx` - Error state display
   - [X] `src/components/index.ts` - Component exports

- [X] **Apply Consistent Styling**
   - [X] Update Dashboard screen to use theme and components
   - [X] Extended tailwind.config.js with brand colors
   - [ ] Update remaining screens to use theme (deferred to Phase 5)
   - [ ] Add light/dark mode support (optional, deferred)

- [X] **Polish Interactions**
   - [X] Add haptic feedback to buttons (expo-haptics installed)
   - [X] Loading states and spinners (LoadingSpinner component)
   - [X] Error states and empty states (ErrorState, EmptyState components)
   - [ ] Smooth transitions between screens (deferred)

**Checkpoint:** ✅ COMPLETED - Theme system and shared components are in place. Design tokens provide consistent colors, typography, and spacing throughout the app.

---

### Phase 3: Database Layer

**Goal:** Implement SQLite database with all tables and queries.

#### 3.1 Database Initialization

**Create:**
- [X] `src/database/init.ts`
  - [X] Database connection setup
  - [X] Apply PRAGMAs (WAL mode, cache settings)
  - [X] Create database instance
  - [X] Error handling for database failures

#### 3.2 Schema Definitions

**Create:** `src/database/schema.ts`

**Define all table creation SQL:**
- [X] `photos` table
- [X] `photo_hashes` table
- [X] `duplicate_groups` table
- [X] `photo_duplicate_mapping` table
- [X] `videos` table
- [X] `scan_history` table
- [X] `storage_analytics` table
- [X] `user_preferences` table
- [X] `sync_queue` table
- [X] `cloud_sync_state` table
- [X] `usage_limits` table (for freemium enforcement)

**Add indexes:**
- [X] Index on `photos.file_size` for large file queries
- [X] Index on `photos.is_screenshot` for screenshot filtering
- [X] Index on `photo_hashes.md5_hash` for duplicate detection
- [X] Index on `scan_history.created_at` for recent scans

#### 3.3 Database Migrations

**Create:** `src/database/migrations.ts`

- [X] Version management system
- [X] Migration runner
- [X] Schema version tracking
- [X] Rollback capability (optional)

#### 3.4 Query Modules

**Create query modules by domain:**

**`src/database/queries/photos.ts`**
- [X] `getAllPhotos()` - Get all photos with pagination
- [X] `getPhotoById(id)` - Get single photo
- [X] `insertPhotos(photos[])` - Batch insert
- [X] `updatePhoto(id, data)` - Update photo metadata
- [X] `deletePhoto(id)` - Soft delete (set is_deleted flag)
- [X] `getPhotosByFilter(filter)` - Filtered queries
- [X] `getScreenshots()` - Get all screenshots
- [X] `getLargeFiles(minSize)` - Get files above size threshold

**`src/database/queries/hashes.ts`**
- [X] `insertHash(photoId, hashes)` - Store hash data
- [X] `getHashByPhotoId(photoId)` - Retrieve hashes
- [X] `getAllHashesForDuplicateDetection()` - Bulk retrieval
- [X] `updateHash(photoId, hashType, value)` - Update specific hash

**`src/database/queries/duplicates.ts`**
- [X] `createDuplicateGroup(group)` - Create new group
- [X] `addPhotoToGroup(photoId, groupId, isPrimary)` - Link photo to group
- [X] `getDuplicateGroups()` - Get all groups with photos
- [X] `getDuplicateGroupById(id)` - Get single group with details
- [X] `deleteDuplicateGroup(id)` - Remove group
- [X] `updateGroupRecommendation(groupId, primaryPhotoId)` - Set best photo

**`src/database/queries/sync.ts`**
- [X] `enqueueSyncItem(item)` - Add to sync queue
- [X] `getPendingSyncItems(limit)` - Get items to sync
- [X] `markSyncItemComplete(id)` - Remove from queue
- [X] `markSyncItemFailed(id, error)` - Handle failures
- [X] `getSyncState()` - Get sync status

**`src/database/queries/usage.ts`**
- [X] `getUsageLimits()` - Get current usage and limits
- [X] `incrementScanCount()` - Increment scan counter
- [X] `incrementCleanupCount(count)` - Increment cleanup counter
- [X] `resetMonthlyUsage()` - Reset counters for new period
- [X] `updateSubscriptionTier(tier)` - Change free/pro status

**`src/database/queries/preferences.ts`**
- [X] `getPreference(key)` - Get single preference
- [X] `getAllPreferences()` - Get all settings
- [X] `setPreference(key, value)` - Update setting
- [X] `resetPreferences()` - Reset to defaults

**Checkpoint:** ✅ COMPLETED - Database layer is complete and testable. All 130+ functions implemented with full TypeScript support.

---

### Phase 4: Services Layer (Business Logic)

**Goal:** Implement core business logic services that use the database.

#### 4.1 Usage Manager Service

**File:** `src/services/UsageManager.ts`

**Implement:**
- [X] `getUserTier()` - Get current subscription tier
- [X] `canPerformScan()` - Check if scan allowed
- [X] `recordScan()` - Increment scan counter
- [X] `canCleanupDuplicates(count)` - Check cleanup limit
- [X] `recordCleanup(count)` - Increment cleanup counter
- [X] `shouldResetPeriod()` - Check if monthly reset needed
- [X] `resetMonthlyUsage()` - Reset counters
- [X] `getRemainingUsage()` - Get remaining scans/cleanups

**Test thoroughly** - This controls freemium enforcement

#### 4.2 Photo Scanner Service

**File:** `src/services/PhotoScanner.ts`

**Implement:**
- [X] `startScan(type: 'full' | 'incremental' | 'quick')` - Main scan entry point
  - [X] Check usage limits first
  - [X] Request photo library permissions
  - [X] Load photos in batches of 100
  - [X] Extract metadata (use expo-media-library)
  - [X] Generate MD5 hashes
  - [X] Insert into database
  - [X] Update scan_history
  - [X] Return scan results
- [X] `cancelScan()` - Stop ongoing scan
- [X] `getScanProgress()` - Return progress percentage
- [X] `onScanProgress(callback)` - Progress callback for UI

**Optimization:**
- [X] Process in batches
- [X] Use batch transactions
- [X] Throttle capability (placeholder for battery check)

#### 4.3 Hash Generator Service

**File:** `src/services/HashGenerator.ts`

**Implement:**
- [X] `generateMD5(photo)` - Simple hash for exact duplicates
- [X] `generatePerceptualHash(photo)` - Visual similarity hash
- [X] `generateDHash(photo)` - Difference hash for rotations
- [X] `generateAverageHash(photo)` - Basic similarity hash
- [X] `generateAllHashes(photo)` - Generate all hash types
- [X] `processHashQueue()` - Background processing of advanced hashes

**Note:** Perceptual hashing requires image processing libraries. Current implementation uses simplified algorithms. For production, consider using native modules or specialized libraries.

#### 4.4 Duplicate Detector Service

**File:** `src/services/DuplicateDetector.ts`

**Implement:**
- [X] `detectExactDuplicates()` - Find same MD5 hashes
- [X] `detectVisualSimilarity(threshold)` - Compare perceptual hashes
- [X] `detectBurstPhotos()` - Photos within 2 seconds, same location
- [X] `detectScreenshotGroups()` - Group screenshots by date ranges
- [X] `calculateHammingDistance(hash1, hash2)` - Compare hashes
- [X] `createDuplicateGroups()` - Organize findings into groups
- [X] `rankPhotosInGroup(groupId)` - Determine best photo to keep

**Algorithms:**
- Hamming distance for perceptual hash comparison
- Time + location proximity for burst detection
- Date clustering for screenshots

#### 4.5 Subscription Manager Service

**File:** `src/services/SubscriptionManager.ts`

**Implement (using RevenueCat):**
- [X] `initialize()` - Configure RevenueCat SDK
- [X] `getUserTier()` - Get current subscription status
- [X] `getOfferings()` - Fetch available products
- [X] `purchasePro(product)` - Purchase subscription
- [X] `restorePurchases()` - Restore previous purchases
- [X] `onSubscriptionUpdate(callback)` - Listen for changes
- [X] `updateLocalTier(tier)` - Update usage_limits table

#### 4.6 Sync Service

**File:** `src/services/SyncService.ts`

**Implement:**
- [X] `initialize()` - Set up Supabase client
- [X] `startSync()` - Begin sync process
- [X] `syncPreferences()` - Upload settings
- [X] `syncDuplicateDecisions()` - Upload user choices
- [X] `syncAnalytics()` - Upload summaries
- [X] `processSyncQueue()` - Process pending items
- [X] `handleSyncError(error)` - Retry logic with exponential backoff
- [X] `isSyncEnabled()` - Check user preference

**Important:** Never block on sync operations. Always update SQLite first.

#### 4.7 Storage Analytics Service

**File:** `src/services/StorageAnalytics.ts`

**Implement:**
- [X] `calculateTotalStorage()` - Sum all photo/video sizes
- [X] `getStorageBreakdown()` - Photos vs videos vs screenshots
- [X] `estimateSavings()` - Calculate potential space recovery
- [X] `trackSavings(amount)` - Record successful cleanups
- [X] `getStorageTrends()` - Historical data for charts
- [X] `takeStorageSnapshot()` - Periodic snapshot for analytics

**Checkpoint:** ✅ COMPLETED - All core business logic is functional. Services can be tested independently.

---

### Phase 5: Integration (Connect UI to Services)

**Goal:** Replace mock data with real data from services and database.

#### 5.1 Dashboard Integration

**Update:** `src/screens/Dashboard.tsx`

- [X] Connect to `StorageAnalytics.calculateTotalStorage()`
- [X] Display real duplicate groups from database
- [X] Show actual last scan timestamp from `scan_history`
- [X] Connect "Start Scan" button to `PhotoScanner.startScan()`
- [X] Show usage limits from `UsageManager.getRemainingUsage()`

#### 5.2 Photo Library Integration

**Update:** `src/screens/PhotoLibrary.tsx`

- [X] Load real photos from `queries/photos.getAllPhotos()`
- [X] Implement pagination with FlashList
- [X] Connect filters to database queries
- [X] Implement sort functionality
- [X] Enable bulk selection and deletion

#### 5.3 Duplicates Integration

**Update:** `src/screens/Duplicates.tsx`

- [X] Load duplicate groups from `queries/duplicates.getDuplicateGroups()`
- [X] Show real confidence scores
- [X] Connect "Keep" selection to database
- [X] Implement deletion with usage limit checks
- [X] Update savings calculations based on actual file sizes

#### 5.4 Large Files Integration

**Update:** `src/screens/LargeFiles.tsx`

- [X] Query `queries/photos.getLargeFiles(minSize)`
- [X] Show real file sizes
- [ ] Implement compression (Pro feature) - Deferred to Phase 6
- [X] Connect deletion to database

#### 5.5 Screenshots Integration

**Update:** `src/screens/Screenshots.tsx`

- [X] Query `queries/photos.getScreenshots()`
- [X] Group by actual dates
- [X] Connect deletion functionality

#### 5.6 Settings Integration

**Update:** `src/screens/Settings.tsx`

- [X] Load preferences from `queries/preferences.getAllPreferences()`
- [X] Connect all toggles to database
- [X] Show real subscription tier from `UsageManager.getUserTier()`
- [X] Display actual usage stats
- [X] Implement sync controls

#### 5.7 Paywall Integration

**Update:** `src/screens/Paywall.tsx`

- [X] Connect to `SubscriptionManager.getOfferings()`
- [X] Implement purchase flow with `SubscriptionManager.purchasePro()`
- [X] Handle success/failure states
- [X] Update UI based on subscription status

#### 5.8 Video Support Implementation

**Goal:** Add full support for scanning, storing, and displaying videos alongside photos.

**Phase 1: Database & Scanning**
- [X] Create video query module `src/database/queries/videos.ts` with 22 functions:
  - getAllVideos, getVideoById, getVideosByFilter
  - getLargeVideos, getVideosByDuration
  - getVideoCount, getTotalVideosSize, getVideoStats
  - insertVideos, updateVideo, deleteVideo/deleteVideos
  - hardDeleteVideo, videoExists, getVideosByAlbum
  - getRecentVideos, searchVideos
- [X] Update `src/database/queries/index.ts` to export videos module
- [X] Update `PhotoScanner.ts` to scan videos in separate pass:
  - Added Video imports and types
  - Updated ScanResult interface with video counts
  - Added video scanning after photo scanning (photos: 0-50%, videos: 50-95%)
  - Created `processVideoBatch()` method
  - Updated progress reporting to show both photos and videos

**Phase 2: Analytics & Display**
- [X] Update `StorageAnalytics.ts` to include videos:
  - `calculateTotalStorage()` now includes both photo and video sizes
  - `getStorageBreakdown()` queries videos table directly
  - `takeStorageSnapshot()` uses videos table for accurate counts
- [X] Update `Dashboard.tsx` to display video statistics:
  - Added totalVideos and totalMedia fields
  - Storage Overview Card shows breakdown: Total Media, Photos, Videos
  - Scan success message shows both photos and videos scanned
  - Updated "All Media" card to show photo & video counts

**Implementation Notes:**
- Videos table already existed but was unused
- PhotoScanner now performs two-pass scanning (photos then videos)
- Each media type scanned with appropriate MediaLibrary.MediaType
- Video-specific properties tracked: duration, file_size
- Transaction methods updated to use `executeTransaction` helper
- File size detection via `AssetInfo` not available in expo-media-library (defaults to 0)

**TypeScript Fixes Applied:**
- Removed duplicate PaginationOptions export from videos.ts
- Fixed transaction methods to use executeTransaction helper
- Updated preference type casting to handle PreferenceValue union type
- Fixed ScanType enum conversions in BackgroundScanService
- Fixed null vs undefined for optional hash fields

**Checkpoint:** ✅ COMPLETED - App now fully supports videos. Scanning, storage analytics, and dashboard display all include video data. All TypeScript compilation errors resolved.

---

### Phase 6: Advanced Features (Pro Tier)

**Goal:** Implement premium features.

#### 6.1 Compression Feature

**Create:** `src/services/CompressionService.ts`

- [X] JPEG → HEIC conversion (uses optimized JPEG; full HEIC requires native module)
- [X] H.264 → HEVC conversion for videos (framework in place; requires native module for implementation)
- [X] Preserve EXIF metadata (framework in place; requires native module for full support)
- [X] Show before/after size comparison
- [X] Gate behind Pro tier check

**Status:** ✅ COMPLETED with notes

**Implementation Details:**
- Image compression using `expo-image-manipulator`
- Supports JPEG/PNG compression with quality control
- Batch compression support with progress callbacks
- Compression estimates before processing
- Pro tier enforcement via UsageManager
- Full HEIC format support requires native module (e.g., custom module with ImageIO)
- Video compression (H.264→HEVC) requires native module (e.g., react-native-compressor, AVFoundation)
- EXIF preservation requires native module (e.g., ExifInterface for Android, ImageIO for iOS)

**Future Enhancements (Native Modules Required):**
- Complete HEIC format support
- Video transcoding (H.264 → HEVC)
- Full EXIF metadata preservation

#### 6.2 AI Quality Scoring

**Status:** Cloud-based option shelved for later implementation. Basic heuristic ranking already functional in DuplicateDetector.

**Options:**
1. **Local ML Model** (using TensorFlow Lite or Core ML) - FUTURE CONSIDERATION
   - [ ] Analyze sharpness, exposure, composition
   - [ ] Rank photos within duplicate groups
2. **Cloud-based** (Supabase Edge Function) - **SHELVED**
   - ~~Send photo hashes to cloud~~
   - ~~Receive quality scores~~
   - ~~Update local database~~

**Current Implementation:**
- ✅ Basic photo ranking using simple heuristics (file size, resolution, format preference)
- ✅ Manual selection by user in duplicate groups
- ✅ `DuplicateDetector.rankPhotosInGroup()` provides basic auto-ranking

**Future Implementation (when ready):**
- [ ] `src/services/AIQualityScorer.ts` - Local ML model only
- [ ] Integration with `DuplicateDetector` for advanced auto-selection
- [ ] Blur detection, exposure analysis, composition scoring (local-only)

**Note:** The app is fully functional without advanced AI scoring. Cloud-based AI is not needed for core duplicate detection features and would violate the local-first privacy principle.

#### 6.3 Background Scanning

**Setup:**
- [X] Configure `expo-background-fetch` and `expo-task-manager`
- [X] Implement background task handler
- [X] Check battery state before running
- [X] Respect user preference from Settings
- [X] Gate behind Pro tier

**Status:** ✅ COMPLETED

**Implementation Details:**
- Background scanning using `expo-task-manager` and `expo-background-fetch`
- Battery level monitoring with `expo-battery` (just installed)
- Configurable scan intervals (default: 24 hours)
- Battery and charging state checks before scanning
- User preferences integration (enable/disable, interval, battery requirements)
- Pro tier enforcement via UsageManager
- Quick/incremental scans only (not full scans)
- Persists after app termination and device reboot

**Files Created:**
- `src/services/BackgroundScanService.ts` - Main background scan service
- `src/services/backgroundTasksInit.ts` - Initialization helper

**How to Use:**
1. Import at app startup in `App.tsx`:
   ```typescript
   import './src/services/backgroundTasksInit';
   ```

2. Enable background scanning:
   ```typescript
   import { backgroundScanService } from './src/services/BackgroundScanService';

   await backgroundScanService.enable({
     enabled: true,
     intervalHours: 24,
     requireCharging: true,
     minimumBatteryLevel: 20,
     scanType: 'quick'
   });
   ```

3. Check status:
   ```typescript
   const status = await backgroundScanService.getStatus();
   console.log(status); // { available, registered, enabled, isPro, config }
   ```

**User Preferences (stored in database):**
- `background_scan_enabled` - Enable/disable background scanning
- `background_scan_interval` - Scan interval in hours (default: 24)
- `background_scan_only_charging` - Only scan when charging (default: true)
- `background_scan_min_battery` - Minimum battery percentage (default: 20)
- `background_scan_type` - Scan type: 'quick' or 'incremental' (default: 'quick')

#### 6.4 Cloud Sync Full Implementation

**Status:** **SHELVED** for future implementation

**Complete:**
- ~~Upload preferences, duplicate decisions, analytics to Supabase~~
- ~~Implement conflict resolution~~
- ~~Cross-device duplicate detection~~
- ~~Real-time sync status updates~~

**Current State:**
- ✅ Basic SyncService already implemented in Phase 4.6
- ✅ Framework for sync queue, preferences upload, and analytics sync exists
- ✅ App is fully functional without advanced cloud sync features

**Future Implementation (when ready):**
- [ ] Advanced conflict resolution for cross-device scenarios
- [ ] Real-time sync status updates with webhooks
- [ ] Cross-device duplicate detection and merging
- [ ] Supabase realtime subscriptions for live updates
- [ ] Advanced sync queue processing with retry logic

**Note:** The app maintains its "Local-First, Cloud-Optional" architecture. Basic cloud sync functionality exists but advanced features are deferred to maintain focus on core local functionality.

---

**Phase 6 Summary:**

✅ **Completed:**
- 6.1 Compression Feature (with framework for native enhancements)
- 6.3 Background Scanning (fully functional with Pro tier enforcement)

⏭️ **Shelved for Future:**
- 6.2 AI Quality Scoring (Cloud-based option - violates privacy-first principle)
- 6.4 Cloud Sync Full Implementation (basic sync already exists from Phase 4)

**Checkpoint:** ✅ PHASE 6 COMPLETED - Core Pro features implemented. App has compression, background scanning, and maintains local-first architecture.

---

### Phase 6.5: RevenueCat Integration & Testing

**Goal:** Complete full RevenueCat integration for iOS subscription management, connect to existing SubscriptionManager service, and enable production-ready in-app purchases.

**Important Context:** CleanSpace already has:
- ✅ `src/services/SubscriptionManager.ts` service with RevenueCat integration (Phase 4.5)
- ✅ SQLite-based usage limits system (`usage_limits` table)
- ✅ Paywall screen with UI (Phase 1.9, integrated in Phase 5.7)
- ✅ Free tier enforcement via `UsageManager.ts`

**This phase focuses on:** Production setup, testing, and ensuring everything works end-to-end.

---

#### 6.5.1 RevenueCat Dashboard Setup

**Prerequisites:**
- Apple Developer Account (required for App Store Connect access)
- App Bundle Identifier (e.g., `com.cleanspace.app`)

**Step 1: Create RevenueCat Account & Project**
- ✅ Go to [revenueCat.com](https://revenuecat.com) and sign up
- ✅ Create new project for CleanSpace
- ✅ Select iOS platform
- [ ] Save the **iOS API Key** (starts with `appl_...`) - store in `src/config/revenueCat.ts`

**Step 2: Configure Apple App Store Connect**
- [ ] Log into [App Store Connect](https://appstoreconnect.apple.com)
- [ ] Navigate to: **My Apps** → **CleanSpace** (or create app if needed)
- [ ] Go to **Features** → **In-App Purchases**
- [ ] Create subscription products:

**Recommended Subscription Structure:**
```
Product ID: cleanspace_pro_monthly
Type: Auto-Renewable Subscription
Subscription Group: CleanSpace Pro
Price: $4.99/month (adjust as needed)
Description: "Unlimited scans, compression, background scanning"

Product ID: cleanspace_pro_annual
Type: Auto-Renewable Subscription
Subscription Group: CleanSpace Pro
Price: $39.99/year (adjust as needed)
Description: "Unlimited scans, compression, background scanning - Annual billing"
```

**Step 3: Generate App Store Connect API Key**
- [ ] In App Store Connect: **Users and Access** → **Keys** → **In-App Purchase**
- [ ] Click **Generate API Key**
- [ ] Download the `.p8` file (ONLY available once - save securely!)
- [ ] Note the **Key ID** and **Issuer ID**

**Step 4: Link RevenueCat to App Store**
- [ ] In RevenueCat dashboard: **Project Settings** → **iOS app**
- [ ] Upload the App Store Connect API key (`.p8` file)
- [ ] Enter **Bundle ID**, **Key ID**, and **Issuer ID**
- [ ] Click **Save**

**Step 5: Create Entitlements & Offerings**
- [ ] In RevenueCat: **Entitlements** → **Create New Entitlement**
  - Name: `pro` (matches `ENTITLEMENT_ID` in code)
  - Description: "CleanSpace Pro Access"
- [ ] In RevenueCat: **Offerings** → **Create New Offering**
  - Identifier: `default`
  - Display Name: "CleanSpace Pro"
- [ ] Add packages to the `default` offering:
  - **Monthly Package:**
    - Identifier: `monthly`
    - Product: Link to `cleanspace_pro_monthly`
    - Attach Entitlement: `pro`
  - **Annual Package:**
    - Identifier: `annual`
    - Product: Link to `cleanspace_pro_annual`
    - Attach Entitlement: `pro`

---

#### 6.5.2 Code Configuration

**Step 1: Verify RevenueCat SDK Installation**
```bash
# Should already be installed from Phase 0
npm list react-native-purchases

# If not installed:
npm install react-native-purchases
npx expo install expo-dev-client  # Required for native modules
```

**Step 2: Create RevenueCat Configuration File**

Create or update `src/config/revenueCat.ts`:

```typescript
// src/config/revenueCat.ts
export const REVENUECAT_CONFIG = {
  // Get this from RevenueCat dashboard → Project Settings → API Keys
  apiKey: {
    ios: 'appl_YOUR_IOS_API_KEY_HERE',
    android: 'goog_YOUR_ANDROID_KEY_HERE', // For future Android support
  },

  // Must match RevenueCat entitlement identifier
  entitlementId: 'pro',

  // Must match RevenueCat offering identifier
  defaultOfferingId: 'default',

  // Product identifiers (must match App Store Connect)
  products: {
    monthly: 'cleanspace_pro_monthly',
    annual: 'cleanspace_pro_annual',
  },
} as const;

export type SubscriptionTier = 'free' | 'pro';
```

**Step 3: Update app.json for iOS Permissions**

Verify `app.json` has proper configuration:

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.cleanspace.app",
      "infoPlist": {
        "NSPhotoLibraryUsageDescription": "CleanSpace needs access to your photos to find duplicates and help free up storage.",
        "NSPhotoLibraryAddUsageDescription": "CleanSpace needs permission to save compressed photos.",
        "NSCameraUsageDescription": "CleanSpace needs camera access for photo capture."
      }
    }
  }
}
```

---

#### 6.5.3 Update SubscriptionManager Service

**File:** `src/services/SubscriptionManager.ts`

Ensure the existing service implements all required methods:

```typescript
import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
  LOG_LEVEL
} from 'react-native-purchases';
import { REVENUECAT_CONFIG, SubscriptionTier } from '../config/revenueCat';
import { updateSubscriptionTier } from '../database/queries/usage';

class SubscriptionManager {
  private static instance: SubscriptionManager;
  private initialized: boolean = false;
  private customerInfo: CustomerInfo | null = null;

  private constructor() {}

  static getInstance(): SubscriptionManager {
    if (!SubscriptionManager.instance) {
      SubscriptionManager.instance = new SubscriptionManager();
    }
    return SubscriptionManager.instance;
  }

  /**
   * Initialize RevenueCat SDK
   * MUST be called in App.tsx on app launch
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[SubscriptionManager] Already initialized');
      return;
    }

    try {
      const apiKey = Platform.select({
        ios: REVENUECAT_CONFIG.apiKey.ios,
        android: REVENUECAT_CONFIG.apiKey.android,
      });

      if (!apiKey) {
        throw new Error('RevenueCat API key not configured for platform');
      }

      // Configure RevenueCat
      Purchases.setLogLevel(LOG_LEVEL.DEBUG); // Use LOG_LEVEL.INFO in production
      Purchases.configure({ apiKey });

      // Get initial customer info
      this.customerInfo = await Purchases.getCustomerInfo();

      // Sync subscription status to SQLite
      await this.syncSubscriptionStatus();

      // Listen for updates
      Purchases.addCustomerInfoUpdateListener(this.handleCustomerInfoUpdate.bind(this));

      this.initialized = true;
      console.log('[SubscriptionManager] Initialized successfully');
    } catch (error) {
      console.error('[SubscriptionManager] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Handle customer info updates from RevenueCat
   */
  private async handleCustomerInfoUpdate(customerInfo: CustomerInfo): Promise<void> {
    this.customerInfo = customerInfo;
    await this.syncSubscriptionStatus();
  }

  /**
   * Sync RevenueCat subscription status to local SQLite database
   * Critical: This keeps usage_limits table in sync with RevenueCat
   */
  private async syncSubscriptionStatus(): Promise<void> {
    try {
      const tier = this.getUserTier();
      await updateSubscriptionTier(tier);
      console.log(`[SubscriptionManager] Synced tier to database: ${tier}`);
    } catch (error) {
      console.error('[SubscriptionManager] Error syncing subscription status:', error);
    }
  }

  /**
   * Get current subscription tier (free or pro)
   * Checks RevenueCat entitlements
   */
  getUserTier(): SubscriptionTier {
    if (!this.customerInfo) {
      return 'free';
    }

    const hasProEntitlement =
      this.customerInfo.entitlements.active[REVENUECAT_CONFIG.entitlementId] !== undefined;

    return hasProEntitlement ? 'pro' : 'free';
  }

  /**
   * Check if user has pro subscription
   */
  isPro(): boolean {
    return this.getUserTier() === 'pro';
  }

  /**
   * Get available subscription offerings
   * Call this in Paywall screen
   */
  async getOfferings(): Promise<PurchasesOfferings | null> {
    try {
      const offerings = await Purchases.getOfferings();

      if (offerings.current === null) {
        console.warn('[SubscriptionManager] No current offering found');
      }

      return offerings;
    } catch (error) {
      console.error('[SubscriptionManager] Error fetching offerings:', error);
      throw error;
    }
  }

  /**
   * Purchase a subscription package
   * @param packageToPurchase - Package from offerings
   */
  async purchasePro(packageToPurchase: PurchasesPackage): Promise<CustomerInfo> {
    try {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);

      this.customerInfo = customerInfo;
      await this.syncSubscriptionStatus();

      console.log('[SubscriptionManager] Purchase successful');
      return customerInfo;
    } catch (error: any) {
      // Handle user cancellation gracefully
      if (error.userCancelled) {
        console.log('[SubscriptionManager] Purchase cancelled by user');
      } else {
        console.error('[SubscriptionManager] Purchase error:', error);
      }
      throw error;
    }
  }

  /**
   * Restore previous purchases
   * Required by App Store guidelines - must have a restore button
   */
  async restorePurchases(): Promise<CustomerInfo> {
    try {
      const customerInfo = await Purchases.restorePurchases();

      this.customerInfo = customerInfo;
      await this.syncSubscriptionStatus();

      console.log('[SubscriptionManager] Purchases restored');
      return customerInfo;
    } catch (error) {
      console.error('[SubscriptionManager] Restore error:', error);
      throw error;
    }
  }

  /**
   * Get current customer info
   * Refreshes from RevenueCat servers
   */
  async refreshCustomerInfo(): Promise<CustomerInfo> {
    try {
      this.customerInfo = await Purchases.getCustomerInfo();
      await this.syncSubscriptionStatus();
      return this.customerInfo;
    } catch (error) {
      console.error('[SubscriptionManager] Error refreshing customer info:', error);
      throw error;
    }
  }

  /**
   * Listen for subscription updates
   * @param callback - Called when subscription status changes
   */
  onSubscriptionUpdate(callback: (tier: SubscriptionTier) => void): void {
    Purchases.addCustomerInfoUpdateListener((customerInfo) => {
      this.customerInfo = customerInfo;
      callback(this.getUserTier());
    });
  }

  /**
   * Update local tier in database
   * Used when subscription status changes
   */
  async updateLocalTier(tier: SubscriptionTier): Promise<void> {
    await updateSubscriptionTier(tier);
  }
}

// Export singleton instance
export const subscriptionManager = SubscriptionManager.getInstance();
```

---

#### 6.5.4 Update App.tsx to Initialize RevenueCat

**File:** `App.tsx`

Add initialization:

```typescript
import { useEffect } from 'react';
import { subscriptionManager } from './src/services/SubscriptionManager';
import { initializeDatabase } from './src/database/init';

export default function App() {
  useEffect(() => {
    async function initializeApp() {
      try {
        // Initialize database first
        await initializeDatabase();

        // Initialize RevenueCat
        await subscriptionManager.initialize();

        console.log('App initialized successfully');
      } catch (error) {
        console.error('App initialization error:', error);
      }
    }

    initializeApp();
  }, []);

  return (
    // Your app components
  );
}
```

---

#### 6.5.5 Create useSubscription Hook

**File:** `src/hooks/useSubscription.ts`

```typescript
import { useEffect, useState } from 'react';
import { subscriptionManager } from '../services/SubscriptionManager';
import { SubscriptionTier } from '../config/revenueCat';

export interface UseSubscriptionResult {
  isPro: boolean;
  tier: SubscriptionTier;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * React hook for accessing subscription status
 * Automatically updates when subscription changes
 */
export function useSubscription(): UseSubscriptionResult {
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial status
    checkSubscription();

    // Listen for updates
    subscriptionManager.onSubscriptionUpdate((newTier) => {
      setTier(newTier);
    });
  }, []);

  const checkSubscription = async () => {
    try {
      await subscriptionManager.refreshCustomerInfo();
      setTier(subscriptionManager.getUserTier());
    } catch (error) {
      console.error('[useSubscription] Error checking subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    isPro: tier === 'pro',
    tier,
    loading,
    refresh: checkSubscription,
  };
}
```

---

#### 6.5.6 Update Paywall Screen

**File:** `src/screens/Paywall.tsx`

---

#### 6.5.7 Update Dashboard to Show Subscription Status

**File:** `src/screens/Dashboard.tsx`

Add subscription status display:

```typescript
import { useSubscription } from '../hooks/useSubscription';

export default function Dashboard({ navigation }: any) {
  const { isPro, tier, loading } = useSubscription();

  // ... existing code ...

  return (
    <ScrollView>
      {/* Subscription Status Banner */}
      {!loading && (
        <View className={`p-4 ${isPro ? 'bg-blue-900' : 'bg-gray-800'}`}>
          <Text className="text-white text-center">
            {isPro
              ? '⭐ CleanSpace Pro - Unlimited Access'
              : '📦 Free Tier - Upgrade for unlimited access'
            }
          </Text>
          {!isPro && (
            <TouchableOpacity
              onPress={() => navigation.navigate('Paywall')}
              className="bg-blue-600 rounded-lg py-2 px-4 mt-2"
            >
              <Text className="text-white text-center font-bold">
                Upgrade to Pro
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Rest of dashboard */}
    </ScrollView>
  );
}
```

---

#### 6.5.8 Testing Strategy

**A. Sandbox Testing Setup**

**Step 1: Create Sandbox Test Account**
- [x] Go to App Store Connect → **Users and Access** → **Sandbox Testers**
- [x] Click **+** to create new sandbox tester
- [x] Use a UNIQUE email (e.g., `cleanspace.test1@gmail.com`)
- [x] Save the credentials securely

**Step 2: Configure Test Device**
- [ ] On your iPhone: **Settings** → **App Store** → Sign out of your real Apple ID
- [ ] DO NOT sign in with sandbox account yet (wait for purchase prompt)

**B. Build Development Version**

```bash
# Create development build with RevenueCat
eas build --profile development --platform ios

# Or local build
npx expo prebuild --platform ios
cd ios && pod install && cd ..
npx expo run:ios --device
```

**C. Test Scenarios Checklist**

- [ ] **Test 1: App Launch**
  - App starts without crashes
  - RevenueCat initializes successfully
  - Default tier is 'free'
  - Dashboard shows "Free Tier" banner

- [ ] **Test 2: View Offerings**
  - Navigate to Paywall screen
  - Monthly and Annual packages load
  - Prices display correctly
  - Product descriptions show

- [ ] **Test 3: Purchase Monthly**
  - Tap Monthly package
  - iOS purchase dialog appears
  - Sign in with sandbox tester account when prompted
  - Complete purchase (sandbox purchases are instant)
  - Verify success alert shows
  - Dashboard updates to "CleanSpace Pro"
  - SQLite `usage_limits` table shows `subscription_tier = 'pro'`

- [ ] **Test 4: Verify Pro Features Unlock**
  - Scan limit check: `canPerformScan()` returns `{allowed: true, unlimited: true}`
  - Background scanning toggle is enabled
  - Compression feature is accessible
  - No usage limit warnings show

- [ ] **Test 5: Restore Purchases**
  - Delete app and reinstall
  - Launch app (should show Free tier initially)
  - Go to Paywall → Tap "Restore Purchases"
  - Verify Pro access restored
  - Verify SQLite synced correctly

- [ ] **Test 6: Subscription Expiration**
  - In Sandbox: Subscriptions expire quickly (monthly = 5 minutes)
  - Wait for expiration
  - Verify app reverts to Free tier
  - Verify usage limits re-appear
  - Verify Pro features are locked

- [ ] **Test 7: Cancel Subscription**
  - In sandbox account: Settings → Apple ID → Subscriptions
  - Cancel CleanSpace Pro
  - Verify subscription remains active until period end
  - Verify access continues until expiration
  - After expiration: verify downgrade to Free

- [ ] **Test 8: Offline Behavior**
  - Enable Airplane Mode
  - Launch app
  - Verify RevenueCat uses cached subscription status
  - Verify Pro features work offline (if previously Pro)

**D. Common Sandbox Testing Issues**

1. **"Cannot connect to App Store"**
   - Solution: Sign out of real Apple ID in device settings
   - Only sign in with sandbox account when purchase prompt appears

2. **"Purchase failed - Invalid Product ID"**
   - Solution: Verify Product IDs in App Store Connect match RevenueCat configuration
   - Ensure products are in "Ready to Submit" or "Approved" status

3. **"No products available"**
   - Solution: Wait 24-48 hours after creating products in App Store Connect
   - Check RevenueCat dashboard for product sync status

4. **Subscription doesn't unlock features**
   - Solution: Check RevenueCat entitlement is correctly attached to product
   - Verify `ENTITLEMENT_ID` in code matches RevenueCat dashboard

---

#### 6.5.9 Production Readiness Checklist

**Before App Store Submission:**

- [ ] **RevenueCat Configuration**
  - [ ] Production API keys configured (not test keys)
  - [ ] App Store Connect integration verified
  - [ ] Entitlements properly linked to products
  - [ ] Offerings configured with correct packages

- [ ] **Code Review**
  - [ ] Remove `LOG_LEVEL.DEBUG` from SubscriptionManager
  - [ ] Remove any test/development code
  - [ ] Error handling is production-ready
  - [ ] User-facing error messages are friendly

- [ ] **Privacy & Legal**
  - [ ] Privacy Policy URL added to app
  - [ ] Terms of Service URL added to app
  - [ ] Subscription terms displayed in Paywall
  - [ ] "Restore Purchases" button is visible

- [ ] **App Store Connect**
  - [ ] Subscription products approved
  - [ ] Pricing configured for all regions
  - [ ] Subscription marketing content added
  - [ ] Free trial configuration (if applicable)

- [ ] **Database Migration**
  - [ ] Ensure existing users migrate to RevenueCat smoothly
  - [ ] Test upgrade flow for users with existing free accounts

**Production Build:**

```bash
# Create production build
eas build --profile production --platform ios

# Or submit directly to App Store
eas submit --platform ios
```

---

#### 6.5.10 Post-Launch Monitoring

**Use RevenueCat Dashboard to track:**
- [ ] Active subscribers count
- [ ] Monthly Recurring Revenue (MRR)
- [ ] Churn rate
- [ ] Trial conversion rate (if applicable)
- [ ] Platform revenue breakdown

**Set up webhooks (optional):**
- [ ] Configure RevenueCat webhooks for backend notifications
- [ ] Track subscription lifecycle events
- [ ] Sync subscription data to analytics platform

---

**Checkpoint:** ✅ PHASE 6.5 COMPLETED when:
- RevenueCat fully configured and tested in sandbox
- All test scenarios pass
- Production build submitted to App Store with working subscriptions
- UsageManager correctly enforces Free vs Pro tiers
- Paywall screen displays offerings and handles purchases
- Subscription status syncs between RevenueCat and SQLite

**Key Integration Points:**
- ✅ RevenueCat → SubscriptionManager → SQLite `usage_limits` table
- ✅ UsageManager reads from `usage_limits` for tier enforcement
- ✅ Paywall screen uses SubscriptionManager for purchases
- ✅ Dashboard/Settings show real-time subscription status
- ✅ All Pro features gated behind `isPro()` checks

---

### Phase 7: Polish & Optimization

**Goal:** Refine performance, UX, and edge cases.

#### 7.1 Performance Optimization

- [ ] Profile and optimize slow database queries
- [ ] Ensure <100ms query response times
- [ ] Optimize FlashList rendering
- [ ] Implement thumbnail caching
- [ ] Monitor memory usage with large photo libraries
- [ ] Battery drain testing

#### 7.2 Error Handling

- [ ] Graceful permission denial handling
- [ ] Network error handling for sync
- [ ] Database error recovery
- [ ] User-friendly error messages
- [ ] Crash reporting setup (optional: Sentry)

#### 7.3 Edge Cases

- [ ] Handle 0 photos scenario
- [ ] Handle interrupted scans
- [ ] Handle app backgrounding during operations
- [ ] Handle storage full scenarios
- [ ] Handle subscription status changes

#### 7.4 Loading States

- [ ] Skeleton screens for all loading states
- [ ] Progress indicators for long operations
- [ ] Optimistic UI updates
- [ ] Pull-to-refresh on lists

#### 7.5 Accessibility

- [ ] VoiceOver support for key features
- [ ] Proper labels for all interactive elements
- [ ] Sufficient color contrast
- [ ] Text scaling support

---

### Phase 8: Testing

**Goal:** Comprehensive testing before deployment.

#### 8.1 Unit Tests

- [ ] All database query functions
- [ ] All service layer functions
- [ ] Utility functions
- [ ] Hash generation algorithms
- [ ] Duplicate detection logic

#### 8.2 Integration Tests

- [ ] Complete scan workflow
- [ ] Duplicate detection end-to-end
- [ ] Deletion workflow
- [ ] Subscription purchase flow
- [ ] Sync workflow

#### 8.3 Performance Tests

- [ ] Test with 0, 50, 500, 5000, 10,000+ photos
- [ ] Measure scan times
- [ ] Measure query response times
- [ ] Memory profiling
- [ ] Battery drain measurement

#### 8.4 Device Testing

- [ ] Test on iPhone 8 (minimum spec)
- [ ] Test on latest iPhone
- [ ] Test on different iOS versions (12.0+)
- [ ] Test with poor network connectivity
- [ ] Test in airplane mode (offline)

#### 8.5 User Acceptance Testing

- [ ] Recruit beta testers
- [ ] Gather feedback on UX
- [ ] Identify confusing workflows
- [ ] Fix critical bugs

---

### Phase 9: Deployment Preparation

**Goal:** Prepare for App Store submission.

- [ ] **App Store Assets**
   - [ ] App icon (all sizes)
   - [ ] Screenshots for all device sizes
   - [ ] App preview video (optional)
   - [ ] App description and keywords
   - [ ] Privacy policy URL
   - [ ] Terms of service URL

- [ ] **Build Configuration**
   - [ ] Set bundle identifier
   - [ ] Configure app version and build number
   - [ ] Set deployment target (iOS 12.0+)
   - [ ] Configure code signing for distribution
   - [ ] Create App Store provisioning profile

- [ ] **Release Build**
   ```bash
   cd ios
   xcodebuild -workspace PhotoVideoCleaner.xcworkspace \
              -scheme PhotoVideoCleaner \
              -configuration Release \
              -archivePath build/PhotoVideoCleaner.xcarchive \
              archive
   ```

- [ ] **App Store Submission**
   - [ ] Upload build via Xcode or Transporter
   - [ ] Fill out App Store Connect details
   - [ ] Submit for review

- [ ] **Post-Launch**
   - [ ] Monitor crash reports
   - [ ] Respond to user reviews
   - [ ] Plan first update based on feedback

---

## Development Best Practices for This Project

1. **Always Test on Physical Device**
   - Simulator cannot access photo library
   - Real performance can only be measured on device

2. **Commit Frequently**
   - Commit after each completed screen
   - Commit after each service implementation
   - Use descriptive commit messages

3. **Start Simple, Add Complexity**
   - Build basic version of each feature first
   - Add optimizations and edge cases later
   - Don't prematurely optimize

4. **UI First, Then Backend**
   - Seeing working UI motivates development
   - Easier to refine UX with mock data
   - Backend implementation is more focused when UI requirements are clear

5. **Test Incrementally**
   - Don't wait until end to test
   - Test each service as it's built
   - Fix bugs immediately, don't let them accumulate
