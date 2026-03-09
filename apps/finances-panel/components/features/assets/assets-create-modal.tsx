'use client';

import { useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';
import { Button } from '@second-brain/ui';
import { Modal } from '../../ui/modal';
import {
  deriveTicker,
  initialCreateForm,
  requiresIsin,
  requiresSymbol,
  type CreateAssetForm,
  v1AssetTypeOptions,
} from './assets-shared';

export function AssetsCreateModal({
  onClose,
  onCreated,
  onError,
  open,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (message: string | null) => void;
  open: boolean;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreateAssetForm>(initialCreateForm);

  const createAsset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createForm.name.trim()) {
      onError('Asset name is required.');
      return;
    }

    const normalizedCurrency = createForm.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      onError('Currency must be a 3-letter code.');
      return;
    }

    if (requiresIsin(createForm.assetType) && !createForm.isin.trim()) {
      onError('ISIN is required for this asset type.');
      return;
    }

    if (requiresSymbol(createForm.assetType) && !createForm.symbol.trim()) {
      onError('Symbol is required for this asset type.');
      return;
    }

    const normalizedSymbol = createForm.symbol.trim().toUpperCase();
    const normalizedProviderSymbol = createForm.providerSymbol
      .trim()
      .toUpperCase();
    const normalizedIsin = createForm.isin.trim().toUpperCase();

    setIsCreating(true);
    try {
      await apiRequest('/finances/assets', {
        method: 'POST',
        body: JSON.stringify({
          name: createForm.name.trim(),
          assetType: createForm.assetType,
          symbol: normalizedSymbol || undefined,
          providerSymbol: normalizedProviderSymbol || undefined,
          ticker: deriveTicker(normalizedSymbol, normalizedIsin),
          isin: requiresIsin(createForm.assetType)
            ? normalizedIsin || undefined
            : undefined,
          currency: normalizedCurrency,
          quantity: 1,
        }),
      });
      setCreateForm(initialCreateForm);
      onError(null);
      await onCreated();
      onClose();
    } catch (error) {
      onError(getApiErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Create Asset"
      onClose={() => {
        if (!isCreating) {
          onClose();
        }
      }}
    >
      <form className="grid gap-4" onSubmit={createAsset}>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="create-asset-name">
            Name
          </label>
          <input
            id="create-asset-name"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={createForm.name}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            required
          />
        </div>

        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="create-asset-type">
            Type
          </label>
          <select
            id="create-asset-type"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={createForm.assetType}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                assetType: event.target.value as CreateAssetForm['assetType'],
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
            <label className="text-sm font-medium" htmlFor="create-asset-symbol">
              Symbol
            </label>
            <input
              id="create-asset-symbol"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={createForm.symbol}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  symbol: event.target.value.toUpperCase(),
                }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <label
              className="text-sm font-medium"
              htmlFor="create-asset-provider-symbol"
            >
              Provider Symbol
            </label>
            <input
              id="create-asset-provider-symbol"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={createForm.providerSymbol}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  providerSymbol: event.target.value.toUpperCase(),
                }))
              }
            />
          </div>
        </div>

        <div
          className={`grid gap-1.5 ${
            createForm.assetType === 'crypto' ? '' : 'sm:grid-cols-2 sm:gap-4'
          }`}
        >
          {createForm.assetType === 'crypto' ? null : (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="create-asset-isin">
                ISIN
              </label>
              <input
                id="create-asset-isin"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={createForm.isin}
                onChange={(event) =>
                  setCreateForm((current) => ({
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
              htmlFor="create-asset-currency"
            >
              Currency
            </label>
            <input
              id="create-asset-currency"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={createForm.currency}
              maxLength={3}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  currency: event.target.value.toUpperCase(),
                }))
              }
              required
            />
          </div>
        </div>

        <Button type="submit" variant="primary" disabled={isCreating} fullWidth>
          {isCreating ? 'Creating...' : 'Create Asset'}
        </Button>
      </form>
    </Modal>
  );
}
