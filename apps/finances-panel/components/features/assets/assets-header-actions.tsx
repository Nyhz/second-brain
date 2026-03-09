'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useRefreshMutation } from '../../../lib/use-refresh-mutation';
import { Button } from '@second-brain/ui';
import { ErrorState } from '../../ui/states';

const AssetsCreateModal = dynamic(
  () =>
    import('./assets-create-modal').then((module) => ({
      default: module.AssetsCreateModal,
    })),
  { loading: () => null },
);

export function AssetsHeaderActions() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { errorMessage, run, setErrorMessage } = useRefreshMutation();

  return (
    <>
      <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
        Create Asset
      </Button>
      {errorMessage ? <ErrorState message={errorMessage} /> : null}
      {isCreateModalOpen ? (
        <AssetsCreateModal
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
    </>
  );
}
