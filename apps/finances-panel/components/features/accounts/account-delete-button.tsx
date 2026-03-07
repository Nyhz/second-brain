'use client';

import { useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { useRefreshMutation } from '../../../lib/use-refresh-mutation';
import { Button } from '../../ui/button';
import { ConfirmModal } from '../../ui/confirm-modal';

export function AccountDeleteButton({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const { errorMessage, isRefreshing, run } = useRefreshMutation();

  return (
    <>
      <div className="space-y-2">
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={isRefreshing}
          onClick={() => setIsConfirmOpen(true)}
        >
          {isRefreshing ? 'Deleting...' : 'Delete'}
        </Button>
        {errorMessage ? (
          <p className="text-xs text-destructive">{errorMessage}</p>
        ) : null}
      </div>
      <ConfirmModal
        open={isConfirmOpen}
        title="Delete Account"
        description={`Delete account "${accountName}"? This will also delete its transactions.`}
        confirmLabel="Delete Account"
        confirmVariant="danger"
        isLoading={isRefreshing}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() =>
          void run(
            () =>
              apiRequest(`/finances/accounts/${accountId}`, {
                method: 'DELETE',
              }),
            {
              onSuccess: () => {
                setIsConfirmOpen(false);
              },
            },
          )
        }
      />
    </>
  );
}
