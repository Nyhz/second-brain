import { dbQueryDurationSeconds, dbQueryErrorsTotal } from '../metrics';

export const withTimedDb = async <T>(
  queryName: string,
  op: () => Promise<T>,
): Promise<T> => {
  const end = dbQueryDurationSeconds.startTimer({ query_name: queryName });
  try {
    const result = await op();
    end();
    return result;
  } catch (error) {
    end();
    dbQueryErrorsTotal.inc({ query_name: queryName });
    throw error;
  }
};
