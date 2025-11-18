# 📸 CleanSpace - Smart Photo & Video Cleaner

An AI-powered iOS app built with React Native that helps users reclaim device storage by intelligently cleaning, compressing, and optimizing photos and videos.

---

## 🚀 Overview

CleanSpace is a privacy-first, offline-capable iOS storage management app that uses a hybrid SQLite + Supabase architecture to analyze your iPhone media library and help you free up space through:

- **Duplicate Detection**: Find and remove exact and visually similar photos
- **Intelligent Compression**: Convert **JPEG** → **HEIC** and **H.264** → **HEVC** without quality loss
- **AI Quality Scoring**: Automatically identify the best photos in each cluster
- **Storage Visualization**: See your storage usage and track savings over time
- **Privacy-Focused**: All photo analysis happens locally on your device

---

## Architecture Overview

### Hybrid Approach: SQLite + Supabase

This app uses a two-layer architecture that prioritizes local performance while offering optional cloud features.

**Local Layer (SQLite) - The Primary Brain**
- Stores all photo metadata and analysis results
- Provides instant query responses (under 100ms)
- Works completely offline
- Respects user privacy (data stays on device)
- Handles large photo libraries (50,000+ photos)

**Cloud Layer (Supabase) - Optional Enhancement**
- Cross-device duplicate detection
- Preferences backup and sync
- Usage analytics aggregation
- User-controlled opt-in feature

**Data Flow Pattern**
```
User Action � SQLite (instant update) � Sync Queue � Supabase (background)
```

### Why This Architecture?

**Traditional Cloud-First Problems:**
- Slow: Every action requires network request
- Fragile: Breaks when offline
- Expensive: High API usage costs
- Privacy concerns: All data goes to cloud

**Our Hybrid Solution Benefits:**
- Instant app responsiveness (no loading spinners)
- Full offline functionality
- Privacy by default (local-first)
- Optional cloud features for power users
- Battery efficient (minimal network usage)
- Works with poor/no connectivity

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | Expo | Development framework with native access |
| **Frontend** | React Native (TypeScript) | Core mobile app |
| | React Navigation | Screen transitions |
| | NativeWind / Tailwind RN | Design system |
| | FlashList | High-performance media lists |
| **Backend** | Supabase (Postgres + Auth + Storage) | User data, sync, reports |
| | Supabase Edge Functions | AI scoring, scheduled jobs |
| **Local Storage** | expo-sqlite | Offline cache of media hashes & scores |
| **Device APIs** | expo-media-library | Photo library access |
| | expo-file-system | File system operations |
| | expo-image-picker | Image selection |
| | PhotoKit / AVFoundation (custom) | Advanced iOS photo features |
| **Permissions** | expo-permissions + config plugins | Permission management |
| **Utilities** | expo-device, expo-application | Device and app info |
| | expo-task-manager | Background task management |
| | expo-background-fetch | Background scanning |
| **Build & Deploy** | EAS Build, EAS Submit | Cloud build and deployment |
| | EAS Update | Over-the-air updates |

---

## Prerequisites

### Required Hardware

**For Development:**
- Mac computer (MacBook, iMac, Mac Mini, or Mac Studio)
- Minimum: 8GB RAM, 20GB free storage
- macOS 12.0 or later

**For Testing:**
- iPhone or iPad (iOS 12.0 or later)
- Lightning or USB-C cable
- Recommended: One older device (iPhone 8-11) and one newer device

**Why Physical Device is Essential:**
- iOS Simulator cannot access real photo library
- PhotoKit features require actual device storage
- Performance testing needs real hardware
- Permission flows only work on physical devices

### Required Software

**Core Development Tools:**
1. **Xcode** - Apple's IDE for iOS development (download from Mac App Store)
2. **Homebrew** - Package manager for Mac
3. **Node.js** - JavaScript runtime (version 18 or later)
4. **Watchman** - File watching service for React Native
5. **Expo CLI** - Expo command-line tools
6. **EAS CLI** - Expo Application Services CLI for builds

**Apple Developer Account:**
- Free tier sufficient for development and testing
- Required for installing apps on your device
- Paid account ($99/year) only needed for App Store distribution

---

## Project Setup

### Step 1: Create Expo Project

Initialize a new Expo project with TypeScript support:
```bash
# Create project in current directory
npx create-expo-app@latest . --template expo-template-blank-typescript

# Install CLI tools globally (recommended)
npm install -g expo-cli eas-cli
```

### Step 2: Install Core Dependencies

```bash
# Core Expo libraries
npx expo install expo-sqlite expo-media-library expo-image-picker
npx expo install expo-file-system expo-permissions
npx expo install expo-device expo-application
npx expo install expo-task-manager expo-background-fetch

# External libraries
npm install @supabase/supabase-js
npm install @tanstack/react-query

# UI libraries
npm install @shopify/flash-list
npx expo install @react-navigation/native @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context
npm install nativewind tailwindcss

# Monetization (choose one)
npx expo install expo-in-app-purchases
# OR for RevenueCat
npm install react-native-purchases
```

### Step 3: Configure app.json

Create or update your `app.json` with iOS-specific configuration:

```json
{
  "expo": {
    "name": "CleanSpace",
    "slug": "cleanspace",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourcompany.cleanspace",
      "infoPlist": {
        "NSPhotoLibraryUsageDescription": "We need access to analyze your photos and find duplicates to free up storage space",
        "NSPhotoLibraryAddUsageDescription": "We may save optimized versions of your photos",
        "NSCameraUsageDescription": "Access to camera for capturing new photos"
      }
    },
    "plugins": [
      [
        "expo-media-library",
        {
          "photosPermission": "Allow CleanSpace to access your photos",
          "savePhotosPermission": "Allow CleanSpace to save photos"
        }
      ]
    ]
  }
}
```

### Step 4: Set Up NativeWind

**Create tailwind.config.js:**
```bash
npx tailwindcss init
```

**Configure babel.config.js:**
```javascript
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['nativewind/babel'],
  };
};
```

### Step 5: Create Development Build

For native features like photo library access, you need a development build:

**Option 1: EAS Build (Cloud-based, Recommended)**
```bash
# Configure EAS
eas build:configure

# Create iOS development build
eas build --profile development --platform ios

# Install on device when complete
```

**Option 2: Local Build**
```bash
# Generate native iOS project
npx expo prebuild --platform ios

# Install iOS dependencies
cd ios && pod install && cd ..

# Open in Xcode if needed
open ios/PhotoVideoCleaner.xcworkspace
```

### Step 6: Project Structure

```
src/
  database/           # SQLite database layer
    schema.ts         # Table definitions
    init.ts           # Database initialization
    migrations.ts     # Schema migrations
    queries/          # Query modules
      photos.ts
      hashes.ts
      duplicates.ts
      sync.ts
  services/           # Business logic
    PhotoScanner.ts
    HashGenerator.ts
    DuplicateDetector.ts
    SyncService.ts
  screens/            # UI screens
    Dashboard.tsx
    PhotoLibrary.tsx
    Duplicates.tsx
    LargeFiles.tsx
    Screenshots.tsx
    Settings.tsx
  components/         # Reusable UI components
    PhotoGrid.tsx
    ProgressBar.tsx
    StorageChart.tsx
    ConfirmDialog.tsx
  utils/              # Helper functions
    formatters.ts
    permissions.ts
    errors.ts
```

---

## Database Architecture

### Core Database Tables

**photos** - Master Photo Registry
- URI, filename, file size, dimensions
- Creation and modification dates
- Camera metadata (make, model)
- GPS coordinates (latitude, longitude)
- Flags: is_screenshot, is_favorite, is_deleted
- Timestamps: first_seen, last_verified

**photo_hashes** - Duplicate Detection Fingerprints
- md5_hash: Exact duplicate detection
- perceptual_hash: Visual similarity detection
- dhash: Detects rotated/flipped versions
- average_hash: Simple similarity algorithm

**duplicate_groups** - Organized Duplicate Collections
- group_hash, classification (exact, similar, burst, screenshot_set)
- confidence score (0.0 to 1.0)
- Statistics: total photos, combined size
- Recommended photo to keep (highest quality)
- Potential space savings

**photo_duplicate_mapping** - Links Photos to Groups
- Many-to-many relationship table
- is_primary flag marks recommended keeper
- Quality score for ranking within group

**videos** - Video File Metadata
- Similar to photos table
- Additional fields: duration, frame_rate, bitrate, codec

**scan_history** - Audit Trail of Scans
- Tracks every scan operation performed
- Type: full, incremental, or quick scan
- Performance: duration, completion status

**storage_analytics** - Historical Storage Metrics
- Periodic snapshots of storage state
- Enables trend analysis and predictions

**user_preferences** - App Settings
- Feature toggles, thresholds, behaviors
- Scanning and sync preferences

**sync_queue** - Cloud Sync Management
- Queues local changes for upload
- Retry logic and status tracking

**cloud_sync_state** - Sync Status Tracking
- Device identifier
- Last sync timestamps
- Pending counts

### Database Optimization Settings (PRAGMAs)

```sql
PRAGMA journal_mode = WAL;        -- Write-Ahead Logging for concurrency
PRAGMA synchronous = NORMAL;      -- Balance safety and speed
PRAGMA cache_size = 10000;        -- Increase in-memory cache
PRAGMA temp_store = MEMORY;       -- Keep temp tables in RAM
PRAGMA mmap_size = 268435456;     -- 256MB memory-mapped I/O
```

---

## Core Implementation Strategy

### 1. Photo Scanning Service

**Purpose:** Scan device photo library and store all metadata in SQLite for instant access.

**Process:**
1. Request photo library permission
2. Load photos in batches (100 at a time)
3. Extract metadata (URI, size, dimensions, dates, GPS, EXIF)
4. Generate simple MD5 hash for quick duplicate detection
5. Store in database using batch transactions
6. Mark photos no longer in library as deleted
7. Update scan_history and storage_analytics

**Optimization:**
- Process in background thread
- Use SQLite transactions for speed
- Commit after each batch (not each photo)
- Implement throttling if battery low

### 2. Hash Generation Service

**Purpose:** Generate multiple hash types for robust duplicate detection.

**Two-Phase Approach:**

**Phase 1: Simple Hash (During Scan)**
- Generate MD5 hash from metadata immediately
- Enables exact duplicate detection

**Phase 2: Advanced Hashes (Background)**
- Perceptual hash: Visual similarity
- Difference hash: Rotations/flips
- Average hash: Basic similarity

### 3. Duplicate Detection Service

**Purpose:** Analyze hashes to find and group duplicate photos.

**Detection Algorithms:**

**Exact Duplicate Detection:**
- Find photos with same MD5 hash
- Confidence score: 1.0 (100%)

**Visual Similarity Detection:**
- Compare perceptual hashes pairwise
- Calculate Hamming distance
- Distance 0-5: Very similar
- Distance 6-10: Possibly similar

**Burst Photo Detection:**
- Find photos taken within 2 seconds
- Check same location
- Confidence score: 0.95

**Screenshot Group Detection:**
- Query all is_screenshot = 1
- Group by date ranges
- Confidence score: 0.85

### 4. Cloud Sync Service

**Purpose:** Optionally sync data to Supabase for cross-device features.

**Principles:**
- SQLite is source of truth
- All changes go to SQLite first (instant)
- Changes queued for cloud sync
- Sync happens in background

**What to Sync:**
- User preferences and settings (always, if enabled)
- Duplicate review decisions
- Storage analytics summaries
- Photo hashes (not actual photos)

**What Never to Sync:**
- Actual photo files (privacy + bandwidth)
- Full URIs (device-specific paths)
- Sensitive personal data

---

## Key Features

### Intelligent Scanning
- Initial scan shows used vs free storage
- Estimated space recoverable
- Detects exact duplicates (SHA/pHash comparison)
- Detects near-duplicates (AI visual similarity)
- Identifies blurry, over/under-exposed, or low-quality images

### Smart Recommendations
- AI-based ranking for best photo in each cluster
- Suggestions for what to delete or compress
- Safety-first approach with Undo/Trash support

### Compression & Optimization
- Converts **JPEG → HEIC** and **H.264 → HEVC** for smaller, high-quality files
- Estimates savings before applying actions
- Preserves metadata (EXIF, timestamps, albums)

### Storage Visualization
- Before scan: shows current used vs free storage
- After cleanup: animated visualization of space freed
- Tracks lifetime total savings

### Privacy & Offline Mode
- All photo analysis and hashing done locally
- No photos uploaded unless user opts in
- Supabase used only for metadata, backups, and sync

---

## Key Screens

### 1. Dashboard - Storage Overview
- Total photos count and size
- Storage breakdown (photos, videos, screenshots)
- Duplicate groups found and potential savings
- Last scan information
- Quick action cards for each category

### 2. Photo Library
- Grid view with thumbnails
- Virtual scrolling for performance
- Sort options: date, size, name
- Filter panel: date range, size range, type
- Bulk selection mode

### 3. Duplicates
- Review and resolve duplicate photo groups
- Sort by potential savings
- Side-by-side photo comparison
- Batch actions for high confidence groups

### 4. Large Files
- Identify and delete largest files
- List view emphasizing size
- Color coding by file size
- Compression options

### 5. Screenshots
- Quick cleanup of screenshot clutter
- Group by date ranges
- Quick delete actions for old screenshots

### 6. Settings
- Scanning preferences
- Duplicate detection configuration
- Cloud sync toggle and options
- Storage management
- Advanced options

---

## Performance Guidelines

### SQLite Optimization
- Use indexes for filtered/sorted columns
- Batch inserts in transactions (100+ rows)
- Use prepared statements for repeated queries
- Run ANALYZE after bulk changes

### Memory Management
- Release photo objects after processing
- Clear thumbnail cache periodically
- Use virtual scrolling
- Monitor iOS memory warnings

### Battery Optimization
- Batch network requests
- Run intensive tasks when charging
- Use background task queues
- Pause when app backgrounded

### Network Optimization (for Sync)
- Batch API requests (50-100 items)
- Compress payloads with gzip
- Only sync changes (delta sync)
- Exponential backoff for retries

### Efficient Algorithms
- Avoid nested loops where possible
- Cache computed values
- Use database for heavy lifting (not JavaScript)

### UI Performance
#### Smooth Scrolling:
    
- Virtual scrolling for large lists
- Render only visible items + buffer
- Optimize image loading
- Avoid expensive operations on scroll

#### Fast Interactions:

- Respond to touches immediately
- Update UI optimistically
- Show loading states appropriately
- Use haptic feedback for actions

#### Efficient Rendering:

- Minimize re-renders
- Use React.memo for expensive components
- Avoid inline function definitions
- Optimize FlatList with proper keys

---

## Testing Strategy

### Unit Testing
- Database operations
- Hash functions
- Duplicate detection algorithms

### Integration Testing
- Complete scan workflow
- Duplicate detection workflow
- Deletion workflow
- Sync workflow (if cloud enabled)

### Performance Testing
- Test with various library sizes (0, 50, 500, 5000, 10,000+ photos)
- Measure: scan time, query response time, memory usage, battery drain

### Device Testing
- Test on multiple devices (iPhone 8, 11, 13+)
- Test different iOS versions
- Edge cases: permissions, interruptions, network issues

---

## Monetization

**Freemium Model:**
- **Free Tier**: Limited scans and duplicate cleanup
- **Pro Tier**: Full compression, AI recommendations, background tasks, cloud backup

In-app purchases managed via preferably RevenueCat (react-native-iap) or StoreKit.

### Free Tier Enforcement Strategy

**Limit Configuration:**
- 3 scans per month (resets on same day each month)
- 50 photos maximum for duplicate cleanup per period
- Compression features disabled
- AI recommendations disabled
- Background scanning disabled
- Cloud sync disabled

**Implementation Approach:**
- Add `usage_limits` table to SQLite schema to track scan and cleanup usage
- Store subscription tier (free/pro), usage counters, and period start dates locally
- Check limits before allowing scan or cleanup operations
- Show remaining usage in UI (e.g., "2 scans remaining this month")
- Display upgrade prompts when limits are reached
- Reset monthly counters automatically based on period start date
- Sync subscription status with Supabase for cross-device validation (optional)

**Key Benefits:**
- Local-first tracking for instant limit checks (no network delay)
- Graceful degradation with clear upgrade messaging
- Monthly reset mechanism for recurring usage
- Transparent usage display to encourage upgrades at right moments

---

## Deployment Checklist

### Pre-Launch
- [ ] All features implemented and tested
- [ ] Database schema finalized with version number
- [ ] Privacy policy written and hosted
- [ ] Terms of service created
- [ ] Bundle identifier and app name finalized
- [ ] App icons in all sizes
- [ ] All Info.plist permissions present

### Testing Completion
- [ ] Tested on iPhone 8 (minimum spec)
- [ ] Tested on latest iPhone
- [ ] All features work offline
- [ ] Tested with 10,000+ photos
- [ ] Memory usage acceptable
- [ ] Battery drain measured

---

## Roadmap

- [ ] Add cloud AI scoring (Supabase Edge + pgvector)
- [ ] Auto-clean rules based on thresholds
- [ ] Cross-device sync and web dashboard
- [ ] Enhanced video summarization (scene cuts)
- [ ] Localization (EN, ES, FR, JP)

---

## Development Commands

```bash
# Start Expo development server
npx expo start

# Run on iOS simulator
npx expo run:ios

# Run on specific physical device (with development build)
npx expo run:ios --device
# OR
npx expo run:ios --device "iPhone Name"

# Run with Expo Go (for basic testing without native features)
npx expo start
# Then scan QR code with Expo Go app

# Build for development (EAS)
eas build --profile development --platform ios

# Build for production (EAS)
eas build --profile production --platform ios

# Submit to App Store (EAS)
eas submit --platform ios

# Create OTA update (after initial release)
eas update --branch production

# Clean build
rm -rf node_modules ios android .expo
npm install
npx expo prebuild --clean

# Local iOS build (after expo prebuild)
cd ios && xcodebuild -workspace PhotoVideoCleaner.xcworkspace -scheme PhotoVideoCleaner -configuration Release
```

---

## License

This project is released under the MIT License.

---

> "Reclaim your storage. Keep only what matters."
