import { ManagedAccount, UsageMetadata } from './types';
import { calculateUsagePercentage, isQuotaExhausted, getRemainingCount } from './usage';

export type QuotaStatus = 'healthy' | 'warning' | 'exhausted';

export interface QuotaInfo {
  status: QuotaStatus;
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  recoveryTime?: number;
}

const WARNING_THRESHOLD_PERCENT = 80;

export function checkQuotaStatus(account: ManagedAccount): QuotaStatus {
  if (!account.usedCount || !account.limitCount) {
    return 'healthy';
  }

  const usage = {
    usedCount: account.usedCount,
    limitCount: account.limitCount,
  };

  if (isQuotaExhausted(usage)) {
    return 'exhausted';
  }

  const percentage = calculateUsagePercentage(usage);
  if (percentage >= WARNING_THRESHOLD_PERCENT) {
    return 'warning';
  }

  return 'healthy';
}

export function updateAccountQuota(account: ManagedAccount, usage: any, accountManager?: any): void {
  const metadata = {
    usedCount: typeof usage.usedCount === 'number' ? usage.usedCount : 0,
    limitCount: typeof usage.limitCount === 'number' ? usage.limitCount : 0,
    realEmail: usage.email
  };
  
  account.usedCount = metadata.usedCount;
  account.limitCount = metadata.limitCount;
  if (metadata.realEmail) {
    account.realEmail = metadata.realEmail;
  }

  if (accountManager) {
    accountManager.updateUsage(account.id, metadata);
  }
}

export function sortAccountsByQuota(accounts: ManagedAccount[]): ManagedAccount[] {
  return [...accounts].sort((a, b) => {
    const aRemaining = getRemainingQuota(a);
    const bRemaining = getRemainingQuota(b);
    return bRemaining - aRemaining;
  });
}

function getRemainingQuota(account: ManagedAccount): number {
  if (!account.usedCount || !account.limitCount) {
    return Infinity;
  }

  const usage = {
    usedCount: account.usedCount,
    limitCount: account.limitCount,
  };

  return getRemainingCount(usage);
}

export function filterHealthyAccounts(accounts: ManagedAccount[]): ManagedAccount[] {
  return accounts.filter(account => {
    if (!account.isHealthy) {
      return false;
    }

    const status = checkQuotaStatus(account);
    return status !== 'exhausted';
  });
}

export function getAccountWithMostQuota(accounts: ManagedAccount[]): ManagedAccount | null {
  const healthyAccounts = filterHealthyAccounts(accounts);
  if (healthyAccounts.length === 0) {
    return null;
  }

  const sorted = sortAccountsByQuota(healthyAccounts);
  return sorted[0] || null;
}
