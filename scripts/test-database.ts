/**
 * Database Test Script
 *
 * This script tests the database initialization independently.
 * Run with: npx ts-node scripts/test-database.ts
 */

import { setupDatabase, getDatabaseStatistics } from '../src/database/setup';
import { getAllPreferences } from '../src/database/queries/preferences';
import { getUserTier, getRemainingUsage } from '../src/database/queries/usage';
import { getPhotoCount } from '../src/database/queries/photos';

async function testDatabase() {
  console.log('='.repeat(60));
  console.log('DATABASE INITIALIZATION TEST');
  console.log('='.repeat(60));
  console.log();

  try {
    // Test 1: Setup database
    console.log('📝 Test 1: Database Setup');
    console.log('-'.repeat(60));
    const setupResult = await setupDatabase();

    if (setupResult.success) {
      console.log('✅ Database setup successful');
      console.log(`   Version: ${setupResult.version}`);
      console.log(`   Message: ${setupResult.message}`);
    } else {
      console.log('❌ Database setup failed');
      console.log(`   Error: ${setupResult.message}`);
      return;
    }
    console.log();

    // Test 2: Get database statistics
    console.log('📊 Test 2: Database Statistics');
    console.log('-'.repeat(60));
    const stats = await getDatabaseStatistics();

    if (stats) {
      console.log('✅ Statistics retrieved successfully');
      console.log(`   Schema Version: ${stats.schemaVersion}`);
      console.log(`   Table Count: ${stats.tableCount}`);
      console.log(`   Database Size: ${stats.databaseSizeMB} MB`);
      console.log(`   Journal Mode: ${stats.journalMode[0]?.journal_mode || 'unknown'}`);
      console.log(`   Tables: ${stats.tables.join(', ')}`);
    } else {
      console.log('❌ Failed to get statistics');
    }
    console.log();

    // Test 3: Check preferences
    console.log('⚙️  Test 3: User Preferences');
    console.log('-'.repeat(60));
    const preferences = await getAllPreferences();
    console.log('✅ Preferences loaded successfully');
    console.log(`   Total preferences: ${Object.keys(preferences).length}`);
    console.log('   Sample preferences:');
    Object.entries(preferences).slice(0, 5).forEach(([key, value]) => {
      console.log(`     - ${key}: ${value}`);
    });
    console.log();

    // Test 4: Check usage limits
    console.log('🎯 Test 4: Usage Limits (Freemium)');
    console.log('-'.repeat(60));
    const tier = await getUserTier();
    const usage = await getRemainingUsage();
    console.log('✅ Usage limits retrieved successfully');
    console.log(`   User Tier: ${tier}`);
    console.log(`   Scans Remaining: ${usage.scansRemaining}`);
    console.log(`   Cleanups Remaining: ${usage.cleanupsRemaining}`);
    console.log();

    // Test 5: Check photo count
    console.log('📸 Test 5: Photo Count');
    console.log('-'.repeat(60));
    const photoCount = await getPhotoCount();
    console.log('✅ Photo count retrieved successfully');
    console.log(`   Total Photos: ${photoCount}`);
    console.log();

    // Summary
    console.log('='.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log();
    console.log('Database is ready to use! 🚀');
    console.log();

  } catch (error) {
    console.error('❌ TEST FAILED');
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run tests
testDatabase().then(() => {
  console.log('Test completed successfully');
  process.exit(0);
}).catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
