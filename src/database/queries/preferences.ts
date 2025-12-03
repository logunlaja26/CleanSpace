/**
 * User Preferences query module
 *
 * This module manages app settings and user preferences.
 * Preferences are stored as key-value pairs for flexibility.
 *
 * Based on CLAUDE.md:
 * - Default preferences are set during schema creation
 * - All preferences synced to cloud (if enabled)
 * - Preferences control app behavior (scan frequency, similarity threshold, etc.)
 */

import { executeQuery, executeQueryFirst, executeNonQuery } from '../init';

/**
 * Preference type definition
 */
export interface Preference {
  key: string;
  value: string;
  value_type: 'string' | 'number' | 'boolean';
  updated_at?: number;
}

/**
 * Typed preference values
 */
export type PreferenceValue = string | number | boolean;

/**
 * Known preference keys (for type safety)
 */
export const PreferenceKeys = {
  AUTO_SCAN_ENABLED: 'auto_scan_enabled',
  SCAN_FREQUENCY: 'scan_frequency',
  SCAN_ONLY_CHARGING: 'scan_only_charging',
  SIMILARITY_THRESHOLD: 'similarity_threshold',
  INCLUDE_SCREENSHOTS: 'include_screenshots',
  INCLUDE_BURST_PHOTOS: 'include_burst_photos',
  CLOUD_SYNC_ENABLED: 'cloud_sync_enabled',
  THEME: 'theme',
} as const;

/**
 * Parse preference value based on type
 *
 * @param value String value from database
 * @param valueType Type of the value
 * @returns Parsed value
 */
const parsePreferenceValue = (value: string, valueType: string): PreferenceValue => {
  switch (valueType) {
    case 'number':
      return parseFloat(value);
    case 'boolean':
      return value === 'true';
    case 'string':
    default:
      return value;
  }
};

/**
 * Convert value to string for storage
 *
 * @param value Value to convert
 * @returns String representation
 */
const stringifyPreferenceValue = (value: PreferenceValue): string => {
  return String(value);
};

/**
 * Determine value type
 *
 * @param value Value to check
 * @returns Value type
 */
const getValueType = (value: PreferenceValue): 'string' | 'number' | 'boolean' => {
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  return 'string';
};

/**
 * Get a single preference by key
 *
 * @param key Preference key
 * @returns Promise<PreferenceValue | null>
 */
export const getPreference = async (key: string): Promise<PreferenceValue | null> => {
  const preference = await executeQueryFirst<Preference>(
    'SELECT * FROM user_preferences WHERE key = ?;',
    [key]
  );

  if (!preference) {
    return null;
  }

  return parsePreferenceValue(preference.value, preference.value_type);
};

/**
 * Get all preferences as a key-value object
 *
 * @returns Promise<Record<string, PreferenceValue>>
 */
export const getAllPreferences = async (): Promise<Record<string, PreferenceValue>> => {
  const preferences = await executeQuery<Preference>(
    'SELECT * FROM user_preferences;',
    []
  );

  const result: Record<string, PreferenceValue> = {};

  preferences.forEach((pref) => {
    result[pref.key] = parsePreferenceValue(pref.value, pref.value_type);
  });

  return result;
};

/**
 * Set a preference value
 *
 * @param key Preference key
 * @param value Preference value
 * @returns Promise<void>
 */
export const setPreference = async (key: string, value: PreferenceValue): Promise<void> => {
  const valueType = getValueType(value);
  const valueString = stringifyPreferenceValue(value);

  await executeNonQuery(
    `INSERT OR REPLACE INTO user_preferences (key, value, value_type, updated_at)
     VALUES (?, ?, ?, strftime('%s', 'now'));`,
    [key, valueString, valueType]
  );

  console.log(`[Preferences] Set ${key} = ${value} (${valueType})`);
};

/**
 * Set multiple preferences at once
 *
 * @param preferences Object with preference key-value pairs
 * @returns Promise<void>
 */
export const setPreferences = async (preferences: Record<string, PreferenceValue>): Promise<void> => {
  const entries = Object.entries(preferences);

  if (entries.length === 0) {
    return;
  }

  for (const [key, value] of entries) {
    await setPreference(key, value);
  }

  console.log(`[Preferences] Set ${entries.length} preferences`);
};

/**
 * Delete a preference
 *
 * @param key Preference key
 * @returns Promise<void>
 */
export const deletePreference = async (key: string): Promise<void> => {
  await executeNonQuery(
    'DELETE FROM user_preferences WHERE key = ?;',
    [key]
  );
};

/**
 * Reset all preferences to defaults
 *
 * This will delete all preferences and let the schema defaults take over.
 *
 * @returns Promise<void>
 */
export const resetPreferences = async (): Promise<void> => {
  // Delete all preferences
  await executeNonQuery('DELETE FROM user_preferences;', []);

  // Re-insert defaults
  const defaults = [
    "INSERT INTO user_preferences (key, value, value_type) VALUES ('auto_scan_enabled', 'false', 'boolean');",
    "INSERT INTO user_preferences (key, value, value_type) VALUES ('scan_frequency', 'weekly', 'string');",
    "INSERT INTO user_preferences (key, value, value_type) VALUES ('scan_only_charging', 'true', 'boolean');",
    "INSERT INTO user_preferences (key, value, value_type) VALUES ('similarity_threshold', '0.85', 'number');",
    "INSERT INTO user_preferences (key, value, value_type) VALUES ('include_screenshots', 'true', 'boolean');",
    "INSERT INTO user_preferences (key, value, value_type) VALUES ('include_burst_photos', 'true', 'boolean');",
    "INSERT INTO user_preferences (key, value, value_type) VALUES ('cloud_sync_enabled', 'false', 'boolean');",
    "INSERT INTO user_preferences (key, value, value_type) VALUES ('theme', 'light', 'string');",
  ];

  for (const sql of defaults) {
    await executeNonQuery(sql, []);
  }

  console.log('[Preferences] Reset to defaults');
};

/**
 * Check if a preference exists
 *
 * @param key Preference key
 * @returns Promise<boolean>
 */
export const hasPreference = async (key: string): Promise<boolean> => {
  const result = await executeQueryFirst<{ count: number }>(
    'SELECT COUNT(*) as count FROM user_preferences WHERE key = ?;',
    [key]
  );

  return result ? result.count > 0 : false;
};

/**
 * Get preferences matching a pattern
 *
 * Useful for getting all preferences in a category (e.g., all scan_* preferences).
 *
 * @param pattern SQL LIKE pattern
 * @returns Promise<Record<string, PreferenceValue>>
 */
export const getPreferencesByPattern = async (pattern: string): Promise<Record<string, PreferenceValue>> => {
  const preferences = await executeQuery<Preference>(
    'SELECT * FROM user_preferences WHERE key LIKE ?;',
    [pattern]
  );

  const result: Record<string, PreferenceValue> = {};

  preferences.forEach((pref) => {
    result[pref.key] = parsePreferenceValue(pref.value, pref.value_type);
  });

  return result;
};

// Convenience functions for specific preferences

/**
 * Check if auto-scan is enabled
 */
export const isAutoScanEnabled = async (): Promise<boolean> => {
  const value = await getPreference(PreferenceKeys.AUTO_SCAN_ENABLED);
  return value === true;
};

/**
 * Check if cloud sync is enabled
 */
export const isCloudSyncEnabled = async (): Promise<boolean> => {
  const value = await getPreference(PreferenceKeys.CLOUD_SYNC_ENABLED);
  return value === true;
};

/**
 * Get similarity threshold for duplicate detection
 */
export const getSimilarityThreshold = async (): Promise<number> => {
  const value = await getPreference(PreferenceKeys.SIMILARITY_THRESHOLD);
  return typeof value === 'number' ? value : 0.85;
};

/**
 * Get current theme
 */
export const getTheme = async (): Promise<string> => {
  const value = await getPreference(PreferenceKeys.THEME);
  return typeof value === 'string' ? value : 'light';
};
