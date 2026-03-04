import { apiRequest } from '../api';

export type SectionMeta = {
  source: 'api';
  asOfIso: string;
};

export const nowIso = () => new Date().toISOString();

export const tryApi = async <T>(path: string): Promise<T | null> => {
  try {
    return await apiRequest<T>(path);
  } catch {
    return null;
  }
};
