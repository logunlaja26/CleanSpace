/**
 * Diagnostic utilities for debugging CleanSpace
 *
 * These functions help identify issues with the database and scanning.
 */

import { executeQuery, executeQueryFirst } from '../database/init';
import * as MediaLibrary from 'expo-media-library';

/**
 * Check database tables and video data
 *
 * @returns Diagnostic information about the database
 */
export const checkVideoSupport = async () => {
  try {
    console.log('\n========== VIDEO SUPPORT DIAGNOSTICS ==========\n');

    // 1. Check if videos table exists
    const tableCheck = await executeQueryFirst<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='videos';",
      []
    );

    const tableExists = !!tableCheck;
    console.log(`✓ Videos table exists: ${tableExists ? 'YES' : 'NO'}`);

    if (!tableExists) {
      console.log('❌ Videos table is missing! Run database migration.');
      return {
        tableExists: false,
        videoCount: 0,
        photoCount: 0,
        deviceVideoCount: 0,
        recommendations: [
          'Videos table is missing',
          'Try resetting the database in Settings',
          'Or reinstall the app'
        ]
      };
    }

    // 2. Check video count in database
    const videoCountResult = await executeQueryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM videos WHERE is_deleted = 0;',
      []
    );
    const dbVideoCount = videoCountResult?.count || 0;
    console.log(`✓ Videos in database: ${dbVideoCount}`);

    // 3. Check photo count for comparison
    const photoCountResult = await executeQueryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM photos WHERE is_deleted = 0;',
      []
    );
    const dbPhotoCount = photoCountResult?.count || 0;
    console.log(`✓ Photos in database: ${dbPhotoCount}`);

    // 4. Check device for videos (requires permission)
    let deviceVideoCount = 0;
    try {
      const { status } = await MediaLibrary.getPermissionsAsync();

      if (status === 'granted') {
        const videoAssets = await MediaLibrary.getAssetsAsync({
          first: 1,
          mediaType: MediaLibrary.MediaType.video,
        });
        deviceVideoCount = videoAssets.totalCount;
        console.log(`✓ Videos on device: ${deviceVideoCount}`);
      } else {
        console.log('⚠️  Media library permission not granted - cannot check device videos');
      }
    } catch (error) {
      console.log('⚠️  Could not check device videos:', error);
    }

    // 5. Provide recommendations
    const recommendations: string[] = [];

    if (dbVideoCount === 0 && deviceVideoCount > 0) {
      recommendations.push('Videos exist on device but not in database');
      recommendations.push('Run a new scan to populate video data');
      recommendations.push('Make sure you tap "Start New Scan" on the Dashboard');
    } else if (dbVideoCount === 0 && deviceVideoCount === 0) {
      recommendations.push('No videos found on device');
      recommendations.push('Add some videos to your photo library and scan again');
    } else if (dbVideoCount > 0) {
      recommendations.push('Video support is working correctly!');
      recommendations.push(`Found ${dbVideoCount} videos in database`);
    }

    console.log('\n========== RECOMMENDATIONS ==========');
    recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`);
    });
    console.log('\n=====================================\n');

    return {
      tableExists,
      videoCount: dbVideoCount,
      photoCount: dbPhotoCount,
      deviceVideoCount,
      recommendations
    };

  } catch (error) {
    console.error('Diagnostics failed:', error);
    return {
      tableExists: false,
      videoCount: 0,
      photoCount: 0,
      deviceVideoCount: 0,
      recommendations: ['Diagnostic check failed', `Error: ${error}`],
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Get detailed scan statistics
 */
export const getScanStatistics = async () => {
  try {
    console.log('\n========== SCAN STATISTICS ==========\n');

    // Get last scan
    const lastScan = await executeQueryFirst<{
      id: number;
      scan_type: string;
      photos_scanned: number;
      created_at: number;
      status: string;
    }>(
      'SELECT * FROM scan_history ORDER BY created_at DESC LIMIT 1;',
      []
    );

    if (!lastScan) {
      console.log('❌ No scans found in history');
      console.log('\nRECOMMENDATION: Run your first scan from the Dashboard\n');
      return null;
    }

    console.log(`Last scan type: ${lastScan.scan_type}`);
    console.log(`Photos scanned: ${lastScan.photos_scanned}`);
    console.log(`Status: ${lastScan.status}`);
    console.log(`Date: ${new Date(lastScan.created_at * 1000).toLocaleString()}`);

    // Check if scan_history has videos_scanned column (should be added)
    const tableInfo = await executeQuery<{ name: string }>(
      "PRAGMA table_info(scan_history);",
      []
    );

    const hasVideosColumn = tableInfo.some((col: any) => col.name === 'videos_scanned');

    if (!hasVideosColumn) {
      console.log('\n⚠️  scan_history table missing videos_scanned column');
      console.log('This indicates database needs migration for video support\n');
    }

    console.log('\n=====================================\n');

    return lastScan;
  } catch (error) {
    console.error('Failed to get scan statistics:', error);
    return null;
  }
};

/**
 * Run all diagnostics
 */
export const runFullDiagnostics = async () => {
  console.log('\n🔍 Running full diagnostics...\n');

  const videoCheck = await checkVideoSupport();
  const scanStats = await getScanStatistics();

  return {
    video: videoCheck,
    scan: scanStats,
  };
};
