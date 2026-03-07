'use client';

import type { Account, AssetWithPosition } from '@second-brain/types';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useRefreshMutation } from '../../../lib/use-refresh-mutation';
import { Button } from '../../ui/button';
import { ErrorState } from '../../ui/states';

const TransactionsCreateModal = dynamic(
  () =>
    import('./transactions-create-modal').then((module) => ({
      default: module.TransactionsCreateModal,
    })),
  { loading: () => null },
);

const TransactionsImportModal = dynamic(
  () =>
    import('./transactions-import-modal').then((module) => ({
      default: module.TransactionsImportModal,
    })),
  { loading: () => null },
);

export function TransactionsHeaderActions({
  accounts,
  assets,
}: {
  accounts: Account[];
  assets: AssetWithPosition[];
}) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const { errorMessage, run, setErrorMessage } = useRefreshMutation();

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setIsImportModalOpen(true)}>
          Import CSV
        </Button>
        <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
          Create Transaction
        </Button>
      </div>
      {errorMessage ? <ErrorState message={errorMessage} /> : null}
      {isCreateModalOpen ? (
        <TransactionsCreateModal
          accounts={accounts}
          assets={assets}
          open={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={async () => {
            await run(async () => undefined, {
              onSuccess: () => {
                setIsCreateModalOpen(false);
              },
            });
          }}
          onError={setErrorMessage}
        />
      ) : null}
      {isImportModalOpen ? (
        <TransactionsImportModal
          accounts={accounts}
          open={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onError={setErrorMessage}
          onImported={async () => {
            await run(async () => undefined, {
              onSuccess: () => {
                setIsImportModalOpen(false);
              },
            });
          }}
        />
      ) : null}
    </>
  );
}
