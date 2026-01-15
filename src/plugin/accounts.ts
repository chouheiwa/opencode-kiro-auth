import { randomBytes } from 'node:crypto';
import { loadAccounts, saveAccounts, loadUsage, saveUsage } from './storage';
import type { 
  ManagedAccount, 
  AccountMetadata, 
  AccountSelectionStrategy,
  KiroAuthDetails,
  RefreshParts,
  UsageMetadata,
  AccountStorage,
} from './types';
import * as logger from './logger';
import { KIRO_CONSTANTS } from '../constants';
import { encodeRefreshToken, decodeRefreshToken, accessTokenExpired } from '../kiro/auth';

export function generateAccountId(): string {
  return randomBytes(16).toString('hex');
}

export function isAccountAvailable(account: ManagedAccount): boolean {
  const now = Date.now();
  
  if (!account.isHealthy) {
    if (account.recoveryTime && now >= account.recoveryTime) {
      return true;
    }
    return false;
  }
  
  if (account.rateLimitResetTime && now < account.rateLimitResetTime) {
    return false;
  }
  
  return true;
}

export class AccountManager {
  private accounts: ManagedAccount[];
  private usage: Record<string, UsageMetadata>;
  private cursor: number;
  private strategy: AccountSelectionStrategy;
  private lastToastAccountIndex = -1;
  private lastToastTime = 0;

  constructor(accounts: ManagedAccount[], usage: Record<string, UsageMetadata>, strategy: AccountSelectionStrategy = 'sticky') {
    this.accounts = accounts;
    this.usage = usage;
    this.cursor = 0;
    this.strategy = strategy;
    
    // Sync usage into accounts
    for (const account of this.accounts) {
      const meta = this.usage[account.id];
      if (meta) {
        account.usedCount = meta.usedCount;
        account.limitCount = meta.limitCount;
        account.realEmail = meta.realEmail;
      }
    }
  }

  static async loadFromDisk(strategy?: AccountSelectionStrategy): Promise<AccountManager> {
    const storage = await loadAccounts();
    const usageStorage = await loadUsage();
    
    const accounts: ManagedAccount[] = storage.accounts.map((meta) => ({
      id: meta.id,
      email: meta.email,
      authMethod: meta.authMethod,
      region: meta.region || KIRO_CONSTANTS.DEFAULT_REGION,
      profileArn: meta.profileArn,
      clientId: meta.clientId,
      clientSecret: meta.clientSecret,
      refreshToken: meta.refreshToken,
      accessToken: meta.accessToken,
      expiresAt: meta.expiresAt,
      rateLimitResetTime: meta.rateLimitResetTime,
      isHealthy: meta.isHealthy,
      unhealthyReason: meta.unhealthyReason,
      recoveryTime: meta.recoveryTime,
    }));
    
    return new AccountManager(accounts, usageStorage.usage, strategy || 'sticky');
  }

  getAccountCount(): number {
    return this.accounts.length;
  }

  getAccounts(): ManagedAccount[] {
    return [...this.accounts];
  }

  shouldShowAccountToast(accountIndex: number, debounceMs = 30000): boolean {
    const now = Date.now();
    if (accountIndex === this.lastToastAccountIndex && now - this.lastToastTime < debounceMs) {
      return false;
    }
    return true;
  }

  markToastShown(accountIndex: number): void {
    this.lastToastAccountIndex = accountIndex;
    this.lastToastTime = Date.now();
  }

  getMinWaitTime(): number {
    const now = Date.now();
    const waitTimes = this.accounts
      .map(a => (a.rateLimitResetTime || 0) - now)
      .filter(t => t > 0);
    
    return waitTimes.length > 0 ? Math.min(...waitTimes) : 0;
  }

  getCurrentOrNext(): ManagedAccount | null {
    const now = Date.now();
    
    const availableAccounts = this.accounts.filter((account) => {
      if (!account.isHealthy) {
        if (account.recoveryTime && now >= account.recoveryTime) {
          account.isHealthy = true;
          delete account.unhealthyReason;
          delete account.recoveryTime;
          return true;
        }
        return false;
      }
      
      if (account.rateLimitResetTime && now < account.rateLimitResetTime) {
        return false;
      }
      
      return true;
    });
    
    if (availableAccounts.length === 0) {
      return null;
    }
    
    if (this.strategy === 'sticky') {
      const currentAccount = this.accounts[this.cursor];
      if (currentAccount && isAccountAvailable(currentAccount)) {
        currentAccount.lastUsed = now;
        currentAccount.usedCount = (currentAccount.usedCount || 0) + 1;
        return currentAccount;
      }
      
      const nextAvailable = availableAccounts[0];
      if (nextAvailable) {
        this.cursor = this.accounts.indexOf(nextAvailable);
        nextAvailable.lastUsed = now;
        nextAvailable.usedCount = (nextAvailable.usedCount || 0) + 1;
        return nextAvailable;
      }
      
      return null;
    }
    
    if (this.strategy === 'round-robin') {
      const account = availableAccounts[this.cursor % availableAccounts.length];
      if (account) {
        this.cursor = (this.cursor + 1) % availableAccounts.length;
        account.lastUsed = now;
        account.usedCount = (account.usedCount || 0) + 1;
        return account;
      }
      return null;
    }

    if (this.strategy === 'lowest-usage') {
      const sorted = [...availableAccounts].sort((a, b) => {
        const usageA = a.usedCount || 0;
        const usageB = b.usedCount || 0;
        if (usageA !== usageB) return usageA - usageB;
        
        const lastA = a.lastUsed || 0;
        const lastB = b.lastUsed || 0;
        return lastA - lastB;
      });
      
      const selected = sorted[0];
      if (selected) {
        selected.lastUsed = now;
        selected.usedCount = (selected.usedCount || 0) + 1;
        this.cursor = this.accounts.indexOf(selected);
        return selected;
      }
      return null;
    }
    
    return null;
  }

  updateUsage(accountId: string, metadata: { usedCount: number; limitCount: number; realEmail?: string }): void {
    const account = this.accounts.find(a => a.id === accountId);
    if (account) {
      account.usedCount = metadata.usedCount;
      account.limitCount = metadata.limitCount;
      if (metadata.realEmail) account.realEmail = metadata.realEmail;
    }
    
    this.usage[accountId] = {
      ...metadata,
      lastSync: Date.now()
    };
  }

  addAccount(account: ManagedAccount): void {
    const index = this.accounts.findIndex((a) => a.id === account.id);
    if (index === -1) {
      this.accounts.push(account);
    } else {
      this.accounts[index] = account;
    }
  }

  removeAccount(account: ManagedAccount): void {
    this.accounts = this.accounts.filter((a) => a.id !== account.id);
    delete this.usage[account.id];
    if (this.cursor >= this.accounts.length && this.accounts.length > 0) {
      this.cursor = this.accounts.length - 1;
    } else if (this.accounts.length === 0) {
      this.cursor = 0;
    }
  }

  updateFromAuth(account: ManagedAccount, auth: KiroAuthDetails): void {
    const accountIndex = this.accounts.findIndex((a) => a.id === account.id);
    if (accountIndex !== -1) {
      const acc = this.accounts[accountIndex];
      if (acc) {
        acc.accessToken = auth.access;
        acc.expiresAt = auth.expires;
        acc.lastUsed = Date.now();
        if (auth.email && auth.email !== 'builder-id@aws.amazon.com') {
          acc.realEmail = auth.email;
        }
        
        const parts = decodeRefreshToken(auth.refresh);
        acc.refreshToken = parts.refreshToken;
        if (parts.profileArn) acc.profileArn = parts.profileArn;
        if (parts.clientId) acc.clientId = parts.clientId;
      }
    }
  }

  markRateLimited(account: ManagedAccount, retryAfterMs: number): void {
    const accountIndex = this.accounts.findIndex((a) => a.id === account.id);
    if (accountIndex !== -1) {
      const acc = this.accounts[accountIndex];
      if (acc) {
        acc.rateLimitResetTime = Date.now() + retryAfterMs;
      }
    }
  }

  markUnhealthy(account: ManagedAccount, reason: string, recoveryTime?: number): void {
    const accountIndex = this.accounts.findIndex((a) => a.id === account.id);
    if (accountIndex !== -1) {
      const acc = this.accounts[accountIndex];
      if (acc) {
        acc.isHealthy = false;
        acc.unhealthyReason = reason;
        acc.recoveryTime = recoveryTime;
      }
    }
  }

  async saveToDisk(): Promise<void> {
    const metadata: AccountMetadata[] = this.accounts.map((account) => ({
      id: account.id,
      email: account.email,
      authMethod: account.authMethod,
      region: account.region,
      profileArn: account.profileArn,
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      refreshToken: account.refreshToken,
      accessToken: account.accessToken,
      expiresAt: account.expiresAt,
      rateLimitResetTime: account.rateLimitResetTime,
      isHealthy: account.isHealthy,
      unhealthyReason: account.unhealthyReason,
      recoveryTime: account.recoveryTime,
    }));
    
    await saveAccounts({
      version: 1,
      accounts: metadata,
      activeIndex: this.cursor,
    });
    
    await saveUsage({
      version: 1,
      usage: this.usage
    });
  }

  toAuthDetails(account: ManagedAccount): KiroAuthDetails {
    const parts: RefreshParts = {
      refreshToken: account.refreshToken,
      profileArn: account.profileArn,
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      authMethod: account.authMethod,
    };
    
    return {
      refresh: encodeRefreshToken(parts),
      access: account.accessToken,
      expires: account.expiresAt,
      authMethod: account.authMethod,
      region: account.region || KIRO_CONSTANTS.DEFAULT_REGION,
      profileArn: account.profileArn,
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      email: account.email,
    };
  }
}
