/**
 * Web-compatible database stub
 *
 * expo-sqlite doesn't work on web, so this provides mock implementations
 * for testing the UI in the browser.
 */

console.warn('[Database] Running in web mode - using mock database');

export const initializeDatabase = async () => {
  console.log('[Database] Mock: Initializing database...');
  return {} as any;
};

export const getDatabase = () => {
  return {} as any;
};

export const executeQuery = async <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
  console.log('[Database] Mock query:', sql);
  return [] as T[];
};

export const executeQueryFirst = async <T = any>(sql: string, params: any[] = []): Promise<T | null> => {
  console.log('[Database] Mock query (first):', sql);
  return null;
};

export const executeNonQuery = async (sql: string, params: any[] = []) => {
  console.log('[Database] Mock non-query:', sql);
  return { changes: 0, lastInsertRowId: 0 };
};

export const executeTransaction = async (callback: (db: any) => Promise<void>) => {
  console.log('[Database] Mock transaction');
  await callback({});
};

export const executeExclusiveTransaction = async (callback: (txn: any) => Promise<void>) => {
  console.log('[Database] Mock exclusive transaction');
  await callback({});
};

export const executeRawSQL = async (sql: string) => {
  console.log('[Database] Mock raw SQL:', sql);
};

export const closeDatabase = async () => {
  console.log('[Database] Mock: Closing database');
};
