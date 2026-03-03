import { apiRequest } from '../api';

export type DataSource = 'api' | 'mock';

export type SectionMeta = {
  source: DataSource;
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
