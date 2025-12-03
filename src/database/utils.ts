/**
 * Database utilities and helpers
 *
 * Common utility functions for database operations.
 */

/**
 * Format bytes to human-readable size
 *
 * @param bytes Size in bytes
 * @param decimals Number of decimal places
 * @returns Formatted string (e.g., "1.5 MB")
 */
export const formatBytes = (bytes: number, decimals = 1): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * Format timestamp to human-readable date
 *
 * @param timestamp Unix timestamp in seconds
 * @returns Formatted date string
 */
export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
};

/**
 * Get relative time (e.g., "2 hours ago")
 *
 * @param timestamp Unix timestamp in seconds
 * @returns Relative time string
 */
export const getRelativeTime = (timestamp: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;

  return `${Math.floor(diff / 31536000)} years ago`;
};

/**
 * Chunk array into batches
 *
 * Useful for batch processing (e.g., inserting 100 items at a time).
 *
 * @param array Array to chunk
 * @param size Chunk size
 * @returns Array of chunks
 */
export const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
};

/**
 * Calculate Hamming distance between two binary strings
 *
 * Used for comparing perceptual hashes.
 * Lower distance = more similar images.
 *
 * @param hash1 First hash (binary string)
 * @param hash2 Second hash (binary string)
 * @returns Hamming distance (number of differing bits)
 */
export const hammingDistance = (hash1: string, hash2: string): number => {
  if (hash1.length !== hash2.length) {
    throw new Error('Hashes must be the same length');
  }

  let distance = 0;

  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++;
    }
  }

  return distance;
};

/**
 * Check if two hashes are similar based on threshold
 *
 * @param hash1 First hash
 * @param hash2 Second hash
 * @param threshold Maximum Hamming distance to consider similar (default 5)
 * @returns True if similar
 */
export const areSimilarHashes = (
  hash1: string,
  hash2: string,
  threshold = 5
): boolean => {
  return hammingDistance(hash1, hash2) <= threshold;
};

/**
 * Generate a unique ID
 *
 * Creates a unique ID for database entities.
 *
 * @returns Unique ID string
 */
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Sanitize filename for database storage
 *
 * @param filename Original filename
 * @returns Sanitized filename
 */
export const sanitizeFilename = (filename: string): string => {
  // Remove any characters that might cause issues
  return filename.replace(/[^\w\s.-]/gi, '').trim();
};

/**
 * Parse JSON safely
 *
 * @param jsonString JSON string
 * @param defaultValue Default value if parsing fails
 * @returns Parsed object or default value
 */
export const safeJsonParse = <T>(jsonString: string, defaultValue: T): T => {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return defaultValue;
  }
};

/**
 * Calculate percentage
 *
 * @param part Part value
 * @param total Total value
 * @param decimals Number of decimal places
 * @returns Percentage (0-100)
 */
export const calculatePercentage = (
  part: number,
  total: number,
  decimals = 1
): number => {
  if (total === 0) return 0;

  const percentage = (part / total) * 100;
  return parseFloat(percentage.toFixed(decimals));
};

/**
 * Debounce function
 *
 * Useful for debouncing database queries on user input.
 *
 * @param func Function to debounce
 * @param wait Wait time in milliseconds
 * @returns Debounced function
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
};

/**
 * Validate email format
 *
 * @param email Email address
 * @returns True if valid email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Get file extension from filename
 *
 * @param filename Filename
 * @returns File extension (without dot) or empty string
 */
export const getFileExtension = (filename: string): string => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
};

/**
 * Check if file is a screenshot based on filename
 *
 * Common screenshot patterns:
 * - IMG_XXXX.PNG (iOS)
 * - Screenshot_YYYYMMDD_HHMMSS.png (Android)
 * - Screen Shot YYYY-MM-DD at HH.MM.SS.png (macOS)
 *
 * @param filename Filename to check
 * @returns True if likely a screenshot
 */
export const isLikelyScreenshot = (filename: string): boolean => {
  const lowerFilename = filename.toLowerCase();

  // Check for common screenshot patterns
  const patterns = [
    /^screenshot/i,
    /^screen\s*shot/i,
    /^img_\d{4}\.png$/i, // iOS screenshots often follow this pattern
    /screenshot_\d+/i,
  ];

  return patterns.some((pattern) => pattern.test(lowerFilename));
};

/**
 * Sleep function for async/await
 *
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 *
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelay Base delay in milliseconds
 * @returns Promise with function result
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> => {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        console.log(`[Utils] Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
};

/**
 * Group array by key
 *
 * @param array Array to group
 * @param keyFn Function to extract key from item
 * @returns Map of groups
 */
export const groupBy = <T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Map<K, T[]> => {
  const groups = new Map<K, T[]>();

  for (const item of array) {
    const key = keyFn(item);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key)!.push(item);
  }

  return groups;
};
