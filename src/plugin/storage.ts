import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import lockfile from 'proper-lockfile';
import { xdgConfig } from 'xdg-basedir';
import type { AccountStorage } from './types';
import * as logger from './logger';

import { UsageStorage } from './types';

export function getStoragePath(): string {
  const configDir = xdgConfig || `${process.env.HOME}/.config`;
  return `${configDir}/opencode/kiro-accounts.json`;
}

export function getUsagePath(): string {
  const configDir = xdgConfig || `${process.env.HOME}/.config`;
  return `${configDir}/opencode/kiro-usage.json`;
}

const LOCK_OPTIONS = {
  stale: 10000,
  retries: {
    retries: 5,
    minTimeout: 100,
    maxTimeout: 1000,
    factor: 2,
  },
};

async function ensureFileExists(path: string, type: 'accounts' | 'usage'): Promise<void> {
  try {
    await fs.access(path);
  } catch {
    await fs.mkdir(dirname(path), { recursive: true });
    if (type === 'accounts') {
      const defaultStorage: AccountStorage = {
        version: 1,
        accounts: [],
        activeIndex: -1,
      };
      await fs.writeFile(path, JSON.stringify(defaultStorage, null, 2), 'utf-8');
    } else {
      const defaultUsage: UsageStorage = {
        version: 1,
        usage: {},
      };
      await fs.writeFile(path, JSON.stringify(defaultUsage, null, 2), 'utf-8');
    }
  }
}

export async function withFileLock<T>(path: string, type: 'accounts' | 'usage', fn: () => Promise<T>): Promise<T> {
  await ensureFileExists(path, type);
  let release: (() => Promise<void>) | null = null;
  try {
    release = await lockfile.lock(path, LOCK_OPTIONS);
    return await fn();
  } catch (error) {
    logger.error(`File lock operation failed for ${path}`, error);
    throw error;
  } finally {
    if (release) {
      try {
        await release();
      } catch (unlockError) {
        logger.warn(`Failed to release lock for ${path}`, unlockError);
      }
    }
  }
}

export async function loadAccounts(): Promise<AccountStorage> {
  const path = getStoragePath();
  
  try {
    await ensureFileExists(path, 'accounts');
    const content = await fs.readFile(path, 'utf-8');
    const data = JSON.parse(content) as AccountStorage;
    return data;
  } catch (error) {
    logger.error('Failed to load accounts', error);
    return { version: 1, accounts: [], activeIndex: -1 };
  }
}

export async function saveAccounts(storage: AccountStorage): Promise<void> {
  const path = getStoragePath();
  await withFileLock(path, 'accounts', async () => {
    const tempPath = `${path}.${randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(storage, null, 2), 'utf-8');
    await fs.rename(tempPath, path);
  });
}

export async function loadUsage(): Promise<UsageStorage> {
  const path = getUsagePath();
  try {
    await ensureFileExists(path, 'usage');
    const content = await fs.readFile(path, 'utf-8');
    return JSON.parse(content) as UsageStorage;
  } catch {
    return { version: 1, usage: {} };
  }
}

export async function saveUsage(storage: UsageStorage): Promise<void> {
  const path = getUsagePath();
  await withFileLock(path, 'usage', async () => {
    const tempPath = `${path}.${randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(storage, null, 2), 'utf-8');
    await fs.rename(tempPath, path);
  });
}
