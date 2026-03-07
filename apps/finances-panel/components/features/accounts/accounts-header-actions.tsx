'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useRefreshMutation } from '../../../lib/use-refresh-mutation';
import { Button } from '../../ui/button';

const AccountsCreateModal = dynamic(
  () =>
    import('./accounts-create-modal').then((module) => ({
      default: module.AccountsCreateModal,
    })),
  { loading: () => null },
);

export function AccountsHeaderActions() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const { errorMessage, run, setErrorMessage } = useRefreshMutation();

  return (
    <>
      <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
        Create Account
      </Button>
      {errorMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
      {infoMessage ? (
        <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {infoMessage}
        </p>
      ) : null}
      {isCreateModalOpen ? (
        <AccountsCreateModal
          open={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={async (createdName) => {
            await run(async () => undefined, {
              onSuccess: () => {
                setInfoMessage(`Account "${createdName}" created successfully.`);
                setIsCreateModalOpen(false);
              },
            });
          }}
          onError={setErrorMessage}
        />
      ) : null}
    </>
  );
}
