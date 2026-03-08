import type { FinanceAuditEventsResponse } from '@second-brain/types';
import { apiRequest } from '../api';

type LoadAuditDataOptions = {
  entityType?: string;
  entityId?: string;
  limit?: number;
};

export const loadAuditData = async (options?: LoadAuditDataOptions) => {
  const params = new URLSearchParams();
  if (options?.entityType) {
    params.set('entityType', options.entityType);
  }
  if (options?.entityId) {
    params.set('entityId', options.entityId);
  }
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }

  const path =
    params.size === 0
      ? '/finances/audit-events'
      : `/finances/audit-events?${params.toString()}`;
  return apiRequest<FinanceAuditEventsResponse>(path);
};
