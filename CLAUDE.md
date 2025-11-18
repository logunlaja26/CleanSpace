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

**AI Quality Scoring (Pro Only):**
- Rank photos within duplicate groups
- Consider: sharpness, exposure, composition
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

- [ ] **Create Expo Project with TypeScript**
   ```bash
   npx create-expo-app@latest . --template expo-template-blank-typescript

   # Install Expo and EAS CLI globally (recommended)
   npm install -g expo-cli eas-cli
   ```

- [ ] **Install All Expo-Compatible Dependencies**
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
   npx expo install expo-in-app-purchases
   # OR
   npm install react-native-purchases
   ```

- [ ] **Configure app.json for iOS Permissions**
   - [ ] Set app name, slug, and bundle identifier
   - [ ] Add iOS-specific configuration
   - [ ] Configure Info.plist permissions:
     - [ ] NSPhotoLibraryUsageDescription
     - [ ] NSPhotoLibraryAddUsageDescription
     - [ ] NSCameraUsageDescription
   - [ ] Add expo-media-library plugin with permissions

- [ ] **Set Up NativeWind/Tailwind**
   - [ ] Create `tailwind.config.js`: `npx tailwindcss init`
   - [ ] Configure `babel.config.js` for NativeWind with expo preset
   - [ ] Add nativewind/babel plugin

- [ ] **Create Development Build (for native features)**
   ```bash
   # Option 1: EAS Build (cloud-based)
   eas build:configure
   eas build --profile development --platform ios

   # Option 2: Local build
   npx expo prebuild --platform ios
   cd ios && pod install && cd ..
   ```

- [ ] **Test Run**
   ```bash
   # Start Expo dev server
   npx expo start

   # Run on iOS simulator (requires development build)
   npx expo run:ios
   ```
   - [ ] Verify app launches successfully on simulator or device

---

### Phase 1: UI/UX Development (Build All Screens First)

**Goal:** Create all screen layouts and navigation with mock data. This lets you see the app flow and refine UX before implementing complex backend logic.

#### 1.1 Navigation Structure Setup

**Create:**
- [ ] `src/navigation/AppNavigator.tsx` - Main navigation container
- [ ] Set up React Navigation with stack navigator
- [ ] Define all screen routes (Dashboard, PhotoLibrary, Duplicates, LargeFiles, Screenshots, Settings)

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
- [ ] Storage overview card (total used/free space)
- [ ] Storage breakdown chart (photos, videos, screenshots)
- [ ] Duplicate groups summary card
- [ ] Potential savings estimate
- [ ] Quick action cards for each category
- [ ] Last scan timestamp
- [ ] "Start Scan" primary CTA button

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
- [ ] `src/components/PhotoGrid.tsx` - Grid layout using FlashList
- [ ] Filter bar (date range, size range, type)
- [ ] Sort options dropdown (date, size, name)
- [ ] Bulk selection mode toggle
- [ ] Selection counter and action bar

**Mock data:**
- [ ] Array of 50-100 mock photo objects with thumbnails (use placeholder images or random image URLs)
- [ ] Demonstrate virtual scrolling performance

#### 1.4 Duplicates Screen

**File:** `src/screens/Duplicates.tsx`

**Build components:**
- [ ] `src/components/DuplicateGroup.tsx` - Expandable group card
- [ ] Side-by-side comparison view
- [ ] Quality indicators (blur detection, exposure, size)
- [ ] "Keep" vs "Delete" selection UI
- [ ] Batch action buttons
- [ ] Savings estimate per group

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
- [ ] List view with file size emphasis
- [ ] Color coding by size (red for >10MB, yellow for 5-10MB)
- [ ] Compression options for each file
- [ ] Estimated savings after compression
- [ ] Bulk delete option

- [ ] **Mock large file items with sizes ranging from 5MB to 50MB**

#### 1.6 Screenshots Screen

**File:** `src/screens/Screenshots.tsx`

**Build components:**
- [ ] Grouped by date ranges (Today, Yesterday, Last Week, Last Month, Older)
- [ ] Quick delete buttons per group
- [ ] Select all within date range
- [ ] Preview grid

- [ ] **Mock 20-30 screenshot items grouped by dates**

#### 1.7 Settings Screen

**File:** `src/screens/Settings.tsx`

**Build sections:**
- [ ] Account & Subscription
  - [ ] Current tier display (Free/Pro)
  - [ ] Upgrade button
  - [ ] Usage stats (scans remaining, cleanups remaining)
- [ ] Scanning Preferences
  - [ ] Auto-scan toggle
  - [ ] Scan frequency
  - [ ] Scan only when charging
- [ ] Duplicate Detection
  - [ ] Similarity threshold slider
  - [ ] Include screenshots toggle
  - [ ] Include burst photos toggle
- [ ] Cloud Sync
  - [ ] Enable/disable toggle
  - [ ] Last sync timestamp
  - [ ] Sync now button
- [ ] Storage Management
  - [ ] Clear cache button
  - [ ] Reset database (danger zone)
- [ ] About
  - [ ] App version
  - [ ] Privacy policy
  - [ ] Terms of service

#### 1.8 Shared Components

**Create reusable components:**
- [ ] `src/components/ProgressBar.tsx` - Progress indicator
- [ ] `src/components/StorageChart.tsx` - Pie/donut chart for storage breakdown
- [ ] `src/components/ConfirmDialog.tsx` - Modal for confirmations
- [ ] `src/components/UsageBanner.tsx` - Free tier limit display
- [ ] `src/components/Button.tsx` - Styled button component
- [ ] `src/components/Card.tsx` - Card container component

#### 1.9 Paywall/Upgrade Screen

**File:** `src/screens/Paywall.tsx`

**Build:**
- [ ] Feature comparison table (Free vs Pro)
- [ ] Pricing display
- [ ] Purchase button (non-functional at this stage)
- [ ] Restore purchases button
- [ ] Close/dismiss option

**Checkpoint:** At this point, you should be able to navigate through all screens, interact with UI elements (with mock data), and have a complete visual sense of the app.

---

### Phase 2: Theme & Design System

**Goal:** Establish consistent styling and theming.

- [ ] **Create Design Tokens**
   - [ ] `src/theme/colors.ts` - Color palette
   - [ ] `src/theme/typography.ts` - Font styles
   - [ ] `src/theme/spacing.ts` - Spacing scale
   - [ ] `src/theme/index.ts` - Export theme object

- [ ] **Apply Consistent Styling**
   - [ ] Update all screens and components to use theme
   - [ ] Ensure consistent spacing, colors, typography
   - [ ] Add light/dark mode support (optional)

- [ ] **Polish Interactions**
   - [ ] Add haptic feedback to buttons
   - [ ] Loading states and spinners
   - [ ] Error states and empty states
   - [ ] Smooth transitions between screens

**Checkpoint:** App looks polished and professional with consistent design language.

---

### Phase 3: Database Layer

**Goal:** Implement SQLite database with all tables and queries.

#### 3.1 Database Initialization

**Create:**
- [ ] `src/database/init.ts`
  - [ ] Database connection setup
  - [ ] Apply PRAGMAs (WAL mode, cache settings)
  - [ ] Create database instance
  - [ ] Error handling for database failures

#### 3.2 Schema Definitions

**Create:** `src/database/schema.ts`

**Define all table creation SQL:**
- [ ] `photos` table
- [ ] `photo_hashes` table
- [ ] `duplicate_groups` table
- [ ] `photo_duplicate_mapping` table
- [ ] `videos` table
- [ ] `scan_history` table
- [ ] `storage_analytics` table
- [ ] `user_preferences` table
- [ ] `sync_queue` table
- [ ] `cloud_sync_state` table
- [ ] `usage_limits` table (for freemium enforcement)

**Add indexes:**
- [ ] Index on `photos.file_size` for large file queries
- [ ] Index on `photos.is_screenshot` for screenshot filtering
- [ ] Index on `photo_hashes.md5_hash` for duplicate detection
- [ ] Index on `scan_history.created_at` for recent scans

#### 3.3 Database Migrations

**Create:** `src/database/migrations.ts`

- [ ] Version management system
- [ ] Migration runner
- [ ] Schema version tracking
- [ ] Rollback capability (optional)

#### 3.4 Query Modules

**Create query modules by domain:**

**`src/database/queries/photos.ts`**
- [ ] `getAllPhotos()` - Get all photos with pagination
- [ ] `getPhotoById(id)` - Get single photo
- [ ] `insertPhotos(photos[])` - Batch insert
- [ ] `updatePhoto(id, data)` - Update photo metadata
- [ ] `deletePhoto(id)` - Soft delete (set is_deleted flag)
- [ ] `getPhotosByFilter(filter)` - Filtered queries
- [ ] `getScreenshots()` - Get all screenshots
- [ ] `getLargeFiles(minSize)` - Get files above size threshold

**`src/database/queries/hashes.ts`**
- [ ] `insertHash(photoId, hashes)` - Store hash data
- [ ] `getHashByPhotoId(photoId)` - Retrieve hashes
- [ ] `getAllHashesForDuplicateDetection()` - Bulk retrieval
- [ ] `updateHash(photoId, hashType, value)` - Update specific hash

**`src/database/queries/duplicates.ts`**
- [ ] `createDuplicateGroup(group)` - Create new group
- [ ] `addPhotoToGroup(photoId, groupId, isPrimary)` - Link photo to group
- [ ] `getDuplicateGroups()` - Get all groups with photos
- [ ] `getDuplicateGroupById(id)` - Get single group with details
- [ ] `deleteDuplicateGroup(id)` - Remove group
- [ ] `updateGroupRecommendation(groupId, primaryPhotoId)` - Set best photo

**`src/database/queries/sync.ts`**
- [ ] `enqueueSyncItem(item)` - Add to sync queue
- [ ] `getPendingSyncItems(limit)` - Get items to sync
- [ ] `markSyncItemComplete(id)` - Remove from queue
- [ ] `markSyncItemFailed(id, error)` - Handle failures
- [ ] `getSyncState()` - Get sync status

**`src/database/queries/usage.ts`**
- [ ] `getUsageLimits()` - Get current usage and limits
- [ ] `incrementScanCount()` - Increment scan counter
- [ ] `incrementCleanupCount(count)` - Increment cleanup counter
- [ ] `resetMonthlyUsage()` - Reset counters for new period
- [ ] `updateSubscriptionTier(tier)` - Change free/pro status

**`src/database/queries/preferences.ts`**
- [ ] `getPreference(key)` - Get single preference
- [ ] `getAllPreferences()` - Get all settings
- [ ] `setPreference(key, value)` - Update setting
- [ ] `resetPreferences()` - Reset to defaults

**Checkpoint:** Database layer is complete and testable. Write unit tests for all query functions.

---

### Phase 4: Services Layer (Business Logic)

**Goal:** Implement core business logic services that use the database.

#### 4.1 Usage Manager Service

**File:** `src/services/UsageManager.ts`

**Implement:**
- [ ] `getUserTier()` - Get current subscription tier
- [ ] `canPerformScan()` - Check if scan allowed
- [ ] `recordScan()` - Increment scan counter
- [ ] `canCleanupDuplicates(count)` - Check cleanup limit
- [ ] `recordCleanup(count)` - Increment cleanup counter
- [ ] `shouldResetPeriod()` - Check if monthly reset needed
- [ ] `resetMonthlyUsage()` - Reset counters
- [ ] `getRemainingUsage()` - Get remaining scans/cleanups

**Test thoroughly** - This controls freemium enforcement

#### 4.2 Photo Scanner Service

**File:** `src/services/PhotoScanner.ts`

**Implement:**
- [ ] `startScan(type: 'full' | 'incremental' | 'quick')` - Main scan entry point
  - [ ] Check usage limits first
  - [ ] Request photo library permissions
  - [ ] Load photos in batches of 100
  - [ ] Extract metadata (use @react-native-camera-roll/camera-roll)
  - [ ] Generate MD5 hashes
  - [ ] Insert into database
  - [ ] Update scan_history
  - [ ] Return scan results
- [ ] `cancelScan()` - Stop ongoing scan
- [ ] `getScanProgress()` - Return progress percentage
- [ ] `onScanProgress(callback)` - Progress callback for UI

**Optimization:**
- [ ] Process in background thread if possible
- [ ] Use batch transactions
- [ ] Throttle if battery low (use react-native-device-info)

#### 4.3 Hash Generator Service

**File:** `src/services/HashGenerator.ts`

**Implement:**
- [ ] `generateMD5(photo)` - Simple hash for exact duplicates
- [ ] `generatePerceptualHash(photo)` - Visual similarity hash
- [ ] `generateDHash(photo)` - Difference hash for rotations
- [ ] `generateAverageHash(photo)` - Basic similarity hash
- [ ] `generateAllHashes(photo)` - Generate all hash types
- [ ] `processHashQueue()` - Background processing of advanced hashes

**Note:** Perceptual hashing requires image processing libraries. Consider:
- Using native modules for performance
- Or implementing simple algorithms in JavaScript

#### 4.4 Duplicate Detector Service

**File:** `src/services/DuplicateDetector.ts`

**Implement:**
- [ ] `detectExactDuplicates()` - Find same MD5 hashes
- [ ] `detectVisualSimilarity(threshold)` - Compare perceptual hashes
- [ ] `detectBurstPhotos()` - Photos within 2 seconds, same location
- [ ] `detectScreenshotGroups()` - Group screenshots by date ranges
- [ ] `calculateHammingDistance(hash1, hash2)` - Compare hashes
- [ ] `createDuplicateGroups()` - Organize findings into groups
- [ ] `rankPhotosInGroup(groupId)` - Determine best photo to keep

**Algorithms:**
- Hamming distance for perceptual hash comparison
- Time + location proximity for burst detection
- Date clustering for screenshots

#### 4.5 Subscription Manager Service

**File:** `src/services/SubscriptionManager.ts`

**Implement (using RevenueCat):**
- [ ] `initialize()` - Configure RevenueCat SDK
- [ ] `getUserTier()` - Get current subscription status
- [ ] `getOfferings()` - Fetch available products
- [ ] `purchasePro(product)` - Purchase subscription
- [ ] `restorePurchases()` - Restore previous purchases
- [ ] `onSubscriptionUpdate(callback)` - Listen for changes
- [ ] `updateLocalTier(tier)` - Update usage_limits table

#### 4.6 Sync Service

**File:** `src/services/SyncService.ts`

**Implement:**
- [ ] `initialize()` - Set up Supabase client
- [ ] `startSync()` - Begin sync process
- [ ] `syncPreferences()` - Upload settings
- [ ] `syncDuplicateDecisions()` - Upload user choices
- [ ] `syncAnalytics()` - Upload summaries
- [ ] `processSyncQueue()` - Process pending items
- [ ] `handleSyncError(error)` - Retry logic with exponential backoff
- [ ] `isSyncEnabled()` - Check user preference

**Important:** Never block on sync operations. Always update SQLite first.

#### 4.7 Storage Analytics Service

**File:** `src/services/StorageAnalytics.ts`

**Implement:**
- [ ] `calculateTotalStorage()` - Sum all photo/video sizes
- [ ] `getStorageBreakdown()` - Photos vs videos vs screenshots
- [ ] `estimateSavings()` - Calculate potential space recovery
- [ ] `trackSavings(amount)` - Record successful cleanups
- [ ] `getStorageTrends()` - Historical data for charts
- [ ] `takeStorageSnapshot()` - Periodic snapshot for analytics

**Checkpoint:** All core business logic is functional. Services can be tested independently.

---

### Phase 5: Integration (Connect UI to Services)

**Goal:** Replace mock data with real data from services and database.

#### 5.1 Dashboard Integration

**Update:** `src/screens/Dashboard.tsx`

- [ ] Connect to `StorageAnalytics.calculateTotalStorage()`
- [ ] Display real duplicate groups from database
- [ ] Show actual last scan timestamp from `scan_history`
- [ ] Connect "Start Scan" button to `PhotoScanner.startScan()`
- [ ] Show usage limits from `UsageManager.getRemainingUsage()`

#### 5.2 Photo Library Integration

**Update:** `src/screens/PhotoLibrary.tsx`

- [ ] Load real photos from `queries/photos.getAllPhotos()`
- [ ] Implement pagination with FlashList
- [ ] Connect filters to database queries
- [ ] Implement sort functionality
- [ ] Enable bulk selection and deletion

#### 5.3 Duplicates Integration

**Update:** `src/screens/Duplicates.tsx`

- [ ] Load duplicate groups from `queries/duplicates.getDuplicateGroups()`
- [ ] Show real confidence scores
- [ ] Connect "Keep" selection to database
- [ ] Implement deletion with usage limit checks
- [ ] Update savings calculations based on actual file sizes

#### 5.4 Large Files Integration

**Update:** `src/screens/LargeFiles.tsx`

- [ ] Query `queries/photos.getLargeFiles(minSize)`
- [ ] Show real file sizes
- [ ] Implement compression (Pro feature)
- [ ] Connect deletion to database

#### 5.5 Screenshots Integration

**Update:** `src/screens/Screenshots.tsx`

- [ ] Query `queries/photos.getScreenshots()`
- [ ] Group by actual dates
- [ ] Connect deletion functionality

#### 5.6 Settings Integration

**Update:** `src/screens/Settings.tsx`

- [ ] Load preferences from `queries/preferences.getAllPreferences()`
- [ ] Connect all toggles to database
- [ ] Show real subscription tier from `SubscriptionManager.getUserTier()`
- [ ] Display actual usage stats
- [ ] Implement sync controls

#### 5.7 Paywall Integration

**Update:** `src/screens/Paywall.tsx`

- [ ] Connect to `SubscriptionManager.getOfferings()`
- [ ] Implement purchase flow with `SubscriptionManager.purchasePro()`
- [ ] Handle success/failure states
- [ ] Update UI based on subscription status

**Checkpoint:** App is fully functional with real data. All features work end-to-end.

---

### Phase 6: Advanced Features (Pro Tier)

**Goal:** Implement premium features.

#### 6.1 Compression Feature

**Create:** `src/services/CompressionService.ts`

- [ ] JPEG → HEIC conversion
- [ ] H.264 → HEVC conversion for videos
- [ ] Preserve EXIF metadata
- [ ] Show before/after size comparison
- [ ] Gate behind Pro tier check

#### 6.2 AI Quality Scoring

**Options:**
1. **Local ML Model** (using TensorFlow Lite or Core ML)
   - [ ] Analyze sharpness, exposure, composition
   - [ ] Rank photos within duplicate groups
2. **Cloud-based** (Supabase Edge Function)
   - [ ] Send photo hashes to cloud
   - [ ] Receive quality scores
   - [ ] Update local database

**Implement:**
- [ ] `src/services/AIQualityScorer.ts`
- [ ] Integration with `DuplicateDetector` to auto-select best photos

#### 6.3 Background Scanning

**Setup:**
- [ ] Configure `react-native-background-fetch`
- [ ] Implement background task handler
- [ ] Check battery state before running
- [ ] Respect user preference from Settings
- [ ] Gate behind Pro tier

#### 6.4 Cloud Sync Full Implementation

**Complete:**
- [ ] Upload preferences, duplicate decisions, analytics to Supabase
- [ ] Implement conflict resolution
- [ ] Cross-device duplicate detection
- [ ] Real-time sync status updates

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
