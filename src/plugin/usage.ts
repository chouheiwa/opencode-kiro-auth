import { KiroAuthDetails, UsageMetadata, ParsedResponse } from './types';

const USAGE_LIMITS_ENDPOINT = 'https://q.{{region}}.amazonaws.com/getUsageLimits';
const RESOURCE_TYPE = 'AGENTIC_REQUEST';
const ORIGIN = 'AI_EDITOR';

interface UsageLimitsResponse {
  usedCount?: number;
  limitCount?: number;
  contextUsagePercentage?: number;
  email?: string;
}

export async function fetchUsageLimits(auth: KiroAuthDetails): Promise<any> {
  const url = buildUsageLimitsUrl(auth);
  const headers = buildRequestHeaders(auth);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Usage limits request failed: ${response.status} ${response.statusText}`);
    }

    const data: any = await response.json();
    
    // Parse complex AWS response
    let usedCount = 0;
    let limitCount = 0;
    let email = data.userInfo?.email;

    if (Array.isArray(data.usageBreakdownList)) {
      for (const usageSource of data.usageBreakdownList) {
        if (usageSource.freeTrialInfo) {
          usedCount += usageSource.freeTrialInfo.currentUsage || 0;
          limitCount += usageSource.freeTrialInfo.usageLimit || 0;
        }
        usedCount += usageSource.currentUsage || 0;
        limitCount += usageSource.usageLimit || 0;
      }
    }

    return {
      usedCount,
      limitCount,
      email,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch usage limits: ${error.message}`);
    }
    throw new Error('Failed to fetch usage limits: Unknown error');
  }
}

function buildUsageLimitsUrl(auth: KiroAuthDetails): string {
  const baseUrl = USAGE_LIMITS_ENDPOINT.replace('{{region}}', auth.region);
  const params = new URLSearchParams({
    isEmailRequired: 'true',
    origin: ORIGIN,
    resourceType: RESOURCE_TYPE,
  });

  if (auth.authMethod === 'social' && auth.profileArn) {
    params.append('profileArn', auth.profileArn);
  }

  return `${baseUrl}?${params.toString()}`;
}

function buildRequestHeaders(auth: KiroAuthDetails): Record<string, string> {
  return {
    'Authorization': `Bearer ${auth.access}`,
    'Content-Type': 'application/json',
    'x-amzn-kiro-agent-mode': 'vibe',
    'amz-sdk-request': 'attempt=1; max=1',
  };
}

export function calculateRecoveryTime(): number {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    1,
    0,
    0,
    0,
    0
  ));
  return nextMonth.getTime();
}

export function isQuotaExhausted(usage: any): boolean {
  return usage.usedCount >= usage.limitCount;
}

export function calculateUsagePercentage(usage: any): number {
  if (!usage.limitCount || usage.limitCount <= 0) {
    return 0;
  }
  return Math.round((usage.usedCount / usage.limitCount) * 100);
}

export function getRemainingCount(usage: any): number {
  const remaining = usage.limitCount - usage.usedCount;
  return Math.max(0, remaining);
}
