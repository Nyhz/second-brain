'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { getApiErrorMessage } from './errors';

type MutationOptions = {
  onSuccess?: () => void | Promise<void>;
};

export function useRefreshMutation() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, startTransition] = useTransition();

  const run = async (
    mutation: () => Promise<void>,
    options?: MutationOptions,
  ) => {
    try {
      await mutation();
      setErrorMessage(null);
      await options?.onSuccess?.();
      startTransition(() => {
        router.refresh();
      });
      return true;
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
      return false;
    }
  };

  return {
    clearError: () => setErrorMessage(null),
    errorMessage,
    isRefreshing,
    run,
    setErrorMessage,
  };
}
