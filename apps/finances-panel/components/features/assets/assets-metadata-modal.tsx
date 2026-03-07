'use client';

import type { AssetWithPosition } from '@second-brain/types';
import { useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';
import { Button } from '../../ui/button';
import { Modal } from '../../ui/modal';
import {
  deriveTicker,
  initialMetadataForm,
  requiresIsin,
  requiresSymbol,
  type MetadataForm,
  v1AssetTypeOptions,
} from './assets-shared';

export function AssetsMetadataModal({
  asset,
  onClose,
  onError,
  onUpdated,
  open,
}: {
  asset: AssetWithPosition | null;
  onClose: () => void;
  onError: (message: string | null) => void;
  onUpdated: () => Promise<void>;
  open: boolean;
}) {
  const [isUpdatingMetadata, setIsUpdatingMetadata] = useState(false);
  const [metadataForm, setMetadataForm] =
    useState<MetadataForm>(initialMetadataForm);

  useEffect(() => {
    if (!asset) {
      setMetadataForm(initialMetadataForm);
      return;
    }
    setMetadataForm({
      assetId: asset.id,
      name: asset.name,
      assetType: asset.assetType,
      symbol: asset.symbol ?? '',
      providerSymbol: asset.providerSymbol ?? '',
      isin: asset.isin ?? '',
      currency: asset.currency,
    });
  }, [asset]);

  const updateMetadata = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = metadataForm.name.trim();
    const normalizedCurrency = metadataForm.currency.trim().toUpperCase();
    const normalizedSymbol = metadataForm.symbol.trim().toUpperCase();
    const normalizedProviderSymbol = metadataForm.providerSymbol
      .trim()
      .toUpperCase();
    const normalizedIsin = metadataForm.isin.trim().toUpperCase();

    if (!normalizedName) {
      onError('Asset name is required.');
      return;
    }

    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      onError('Currency must be a 3-letter code.');
      return;
    }

    if (requiresIsin(metadataForm.assetType) && !normalizedIsin) {
      onError('ISIN is required for this asset type.');
      return;
    }

    if (requiresSymbol(metadataForm.assetType) && !normalizedSymbol) {
      onError('Symbol is required for this asset type.');
      return;
    }

    setIsUpdatingMetadata(true);
    try {
      await apiRequest(`/finances/assets/${metadataForm.assetId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: normalizedName,
          assetType: metadataForm.assetType,
          symbol: normalizedSymbol || null,
          providerSymbol: normalizedProviderSymbol || null,
          ticker: deriveTicker(normalizedSymbol, normalizedIsin),
          isin: requiresIsin(metadataForm.assetType)
            ? normalizedIsin || null
            : undefined,
          currency: normalizedCurrency,
        }),
      });
      onError(null);
      await onUpdated();
      onClose();
    } catch (error) {
      onError(getApiErrorMessage(error));
    } finally {
      setIsUpdatingMetadata(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Edit Asset Metadata"
      onClose={() => {
        if (!isUpdatingMetadata) {
          onClose();
        }
      }}
    >
      <form className="grid gap-4" onSubmit={updateMetadata}>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="metadata-asset-name">
            Name
          </label>
          <input
            id="metadata-asset-name"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={metadataForm.name}
            onChange={(event) =>
              setMetadataForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            required
          />
        </div>

        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="metadata-asset-type">
            Type
          </label>
          <select
            id="metadata-asset-type"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={metadataForm.assetType}
            onChange={(event) =>
              setMetadataForm((current) => ({
                ...current,
                assetType: event.target.value as MetadataForm['assetType'],
              }))
            }
          >
            {v1AssetTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="metadata-asset-symbol">
              Symbol
            </label>
            <input
              id="metadata-asset-symbol"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={metadataForm.symbol}
              onChange={(event) =>
                setMetadataForm((current) => ({
                  ...current,
                  symbol: event.target.value.toUpperCase(),
                }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <label
              className="text-sm font-medium"
              htmlFor="metadata-asset-provider-symbol"
            >
              Provider Symbol
            </label>
            <input
              id="metadata-asset-provider-symbol"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={metadataForm.providerSymbol}
              onChange={(event) =>
                setMetadataForm((current) => ({
                  ...current,
                  providerSymbol: event.target.value.toUpperCase(),
                }))
              }
            />
          </div>
        </div>

        <div
          className={`grid gap-1.5 ${
            metadataForm.assetType === 'crypto' ? '' : 'sm:grid-cols-2 sm:gap-4'
          }`}
        >
          {metadataForm.assetType === 'crypto' ? null : (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="metadata-asset-isin">
                ISIN
              </label>
              <input
                id="metadata-asset-isin"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={metadataForm.isin}
                onChange={(event) =>
                  setMetadataForm((current) => ({
                    ...current,
                    isin: event.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <label
              className="text-sm font-medium"
              htmlFor="metadata-asset-currency"
            >
              Currency
            </label>
            <input
              id="metadata-asset-currency"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={metadataForm.currency}
              maxLength={3}
              onChange={(event) =>
                setMetadataForm((current) => ({
                  ...current,
                  currency: event.target.value.toUpperCase(),
                }))
              }
              required
            />
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={isUpdatingMetadata}
          fullWidth
        >
          {isUpdatingMetadata ? 'Saving...' : 'Save Metadata'}
        </Button>
      </form>
    </Modal>
  );
}
