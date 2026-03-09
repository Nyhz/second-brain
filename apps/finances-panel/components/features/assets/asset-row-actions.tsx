'use client';

import type { AssetWithPosition } from '@second-brain/types';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { useRefreshMutation } from '../../../lib/use-refresh-mutation';
import { Button } from '@second-brain/ui';
import { ConfirmModal } from '../../ui/confirm-modal';

const AssetsMetadataModal = dynamic(
  () =>
    import('./assets-metadata-modal').then((module) => ({
      default: module.AssetsMetadataModal,
    })),
  { loading: () => null },
);

export function AssetRowActions({ asset }: { asset: AssetWithPosition }) {
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const { errorMessage, isRefreshing, run, setErrorMessage } =
    useRefreshMutation();

  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setIsMetadataModalOpen(true)}
          >
            Metadata
          </Button>
          <Button
            type="button"
            size="sm"
            variant={asset.isActive ? 'danger' : 'secondary'}
            disabled={isRefreshing}
            onClick={() =>
              asset.isActive
                ? setIsConfirmOpen(true)
                : void run(() =>
                    apiRequest(`/finances/assets/${asset.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ isActive: true }),
                    }),
                  )
            }
          >
            {isRefreshing
              ? asset.isActive
                ? 'Deactivating...'
                : 'Reactivating...'
              : asset.isActive
                ? 'Deactivate'
                : 'Reactivate'}
          </Button>
        </div>
        {errorMessage ? (
          <p className="text-xs text-destructive">{errorMessage}</p>
        ) : null}
      </div>

      {isMetadataModalOpen ? (
        <AssetsMetadataModal
          asset={asset}
          open={isMetadataModalOpen}
          onClose={() => setIsMetadataModalOpen(false)}
          onError={setErrorMessage}
          onUpdated={async () => {
            await run(async () => undefined, {
              onSuccess: () => {
                setIsMetadataModalOpen(false);
              },
            });
          }}
        />
      ) : null}

      <ConfirmModal
        open={isConfirmOpen}
        title="Deactivate Asset"
        description={`Deactivate asset "${asset.name}"?`}
        confirmLabel="Deactivate"
        confirmVariant="danger"
        isLoading={isRefreshing}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() =>
          void run(
            () =>
              apiRequest(`/finances/assets/${asset.id}`, {
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
