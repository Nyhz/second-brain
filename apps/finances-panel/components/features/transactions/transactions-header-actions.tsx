'use client';

import type { Account, AssetWithPosition } from '@second-brain/types';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useRefreshMutation } from '../../../lib/use-refresh-mutation';
import { Button } from '@second-brain/ui';
import { ErrorState } from '../../ui/states';
import {
  canCreateTransactionsForAccount,
  getAllowedImportSourcesForAccount,
  type ImportSource,
} from './transactions-shared';

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
  defaultAccountId,
  lockAccountId = false,
}: {
  accounts: Account[];
  assets: AssetWithPosition[];
  defaultAccountId?: string;
  lockAccountId?: boolean;
}) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const { errorMessage, run, setErrorMessage } = useRefreshMutation();
  const selectedAccount =
    accounts.find((account) => account.id === defaultAccountId) ?? null;
  const canCreate = selectedAccount
    ? canCreateTransactionsForAccount(selectedAccount)
    : true;
  const allowedImportSources: ImportSource[] = selectedAccount
    ? getAllowedImportSourcesForAccount(selectedAccount)
    : ['degiro', 'binance', 'cobas'];
  const canImport = allowedImportSources.length > 0;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canImport ? (
          <Button variant="secondary" onClick={() => setIsImportModalOpen(true)}>
            Import CSV
          </Button>
        ) : null}
        {canCreate ? (
          <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
            Create Transaction
          </Button>
        ) : null}
      </div>
      {errorMessage ? <ErrorState message={errorMessage} /> : null}
      {isCreateModalOpen ? (
        <TransactionsCreateModal
          accounts={accounts}
          assets={assets}
          {...(defaultAccountId ? { defaultAccountId } : {})}
          lockAccountId={lockAccountId}
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
          allowedSources={allowedImportSources}
          {...(defaultAccountId ? { defaultAccountId } : {})}
          lockAccountId={lockAccountId}
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
