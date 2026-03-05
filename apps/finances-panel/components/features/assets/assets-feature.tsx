'use client';

import type { AssetType, AssetWithPosition } from '@second-brain/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from '../../../lib/api';
import { loadAssetsData } from '../../../lib/data/assets-data';
import { getApiErrorMessage } from '../../../lib/errors';
import { formatMoney } from '../../../lib/format';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingSkeleton,
  Modal,
} from '../../ui';

const v1AssetTypeOptions: Array<{ value: AssetType; label: string }> = [
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
  { value: 'mutual_fund', label: 'Investment Fund' },
  { value: 'retirement_fund', label: 'Retirement Fund' },
  { value: 'crypto', label: 'Crypto' },
];

type CreateAssetForm = {
  name: string;
  assetType: AssetType;
  symbol: string;
  providerSymbol: string;
  isin: string;
  currency: string;
};

type PositionForm = {
  assetId: string;
  quantity: string;
  averageCost: string;
  manualPrice: string;
};

type MetadataForm = {
  assetId: string;
  name: string;
  assetType: AssetType;
  symbol: string;
  providerSymbol: string;
  isin: string;
  currency: string;
};

const initialCreateForm: CreateAssetForm = {
  name: '',
  assetType: 'stock',
  symbol: '',
  providerSymbol: '',
  isin: '',
  currency: 'EUR',
};

const initialPositionForm: PositionForm = {
  assetId: '',
  quantity: '1',
  averageCost: '',
  manualPrice: '',
};

const initialMetadataForm: MetadataForm = {
  assetId: '',
  name: '',
  assetType: 'stock',
  symbol: '',
  providerSymbol: '',
  isin: '',
  currency: 'EUR',
};

const toNullableNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const deriveTicker = (symbol: string, isin: string) => {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (normalizedSymbol) {
    return normalizedSymbol.slice(0, 32);
  }
  const normalizedIsin = isin.trim().toUpperCase();
  if (normalizedIsin) {
    return normalizedIsin.slice(-8);
  }
  return 'ASSET';
};

const typeLabel = (value: string) => {
  const option = v1AssetTypeOptions.find((item) => item.value === value);
  return option?.label ?? value;
};

const requiresIsin = (assetType: AssetType) =>
  assetType === 'stock' ||
  assetType === 'etf' ||
  assetType === 'mutual_fund' ||
  assetType === 'retirement_fund';

const requiresSymbol = (assetType: AssetType) =>
  assetType === 'stock' || assetType === 'etf' || assetType === 'crypto';

export function AssetsFeature() {
  const [rows, setRows] = useState<AssetWithPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdatingPosition, setIsUpdatingPosition] = useState(false);
  const [isUpdatingMetadata, setIsUpdatingMetadata] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const [createForm, setCreateForm] =
    useState<CreateAssetForm>(initialCreateForm);
  const [positionForm, setPositionForm] =
    useState<PositionForm>(initialPositionForm);
  const [metadataForm, setMetadataForm] =
    useState<MetadataForm>(initialMetadataForm);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadAssetsData();
      setRows(data.rows);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(
    () => rows.filter((row) => row.isActive).length,
    [rows],
  );
  const pricedCount = useMemo(
    () => rows.filter((row) => row.resolvedUnitPrice !== null).length,
    [rows],
  );
  const totalValue = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.currentValue ?? 0), 0),
    [rows],
  );

  const createAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createForm.name.trim()) {
      setErrorMessage('Asset name is required.');
      return;
    }

    const normalizedCurrency = createForm.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      setErrorMessage('Currency must be a 3-letter code.');
      return;
    }

    if (requiresIsin(createForm.assetType) && !createForm.isin.trim()) {
      setErrorMessage('ISIN is required for this asset type.');
      return;
    }

    if (requiresSymbol(createForm.assetType) && !createForm.symbol.trim()) {
      setErrorMessage('Symbol is required for this asset type.');
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
          isin: normalizedIsin || undefined,
          currency: normalizedCurrency,
          quantity: 1,
        }),
      });
      setCreateForm(initialCreateForm);
      setIsCreateModalOpen(false);
      await load();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  };

  const openPositionModal = (asset: AssetWithPosition) => {
    setPositionForm({
      assetId: asset.id,
      quantity: String(asset.position?.quantity ?? 1),
      averageCost:
        asset.position?.averageCost === null ||
        asset.position?.averageCost === undefined
          ? ''
          : String(asset.position.averageCost),
      manualPrice:
        asset.position?.manualPrice === null ||
        asset.position?.manualPrice === undefined
          ? ''
          : String(asset.position.manualPrice),
    });
    setIsPositionModalOpen(true);
  };

  const updatePosition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const quantity = Number(positionForm.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setErrorMessage('Position quantity must be greater than 0.');
      return;
    }

    setIsUpdatingPosition(true);
    try {
      await apiRequest(`/finances/assets/${positionForm.assetId}/position`, {
        method: 'PUT',
        body: JSON.stringify({
          quantity,
          averageCost: toNullableNumber(positionForm.averageCost) ?? null,
          manualPrice: toNullableNumber(positionForm.manualPrice) ?? null,
          manualPriceAsOf: positionForm.manualPrice.trim()
            ? new Date().toISOString()
            : null,
        }),
      });
      setIsPositionModalOpen(false);
      await load();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsUpdatingPosition(false);
    }
  };

  const openMetadataModal = (asset: AssetWithPosition) => {
    setMetadataForm({
      assetId: asset.id,
      name: asset.name,
      assetType: asset.assetType,
      symbol: asset.symbol ?? '',
      providerSymbol: asset.providerSymbol ?? '',
      isin: asset.isin ?? '',
      currency: asset.currency,
    });
    setIsMetadataModalOpen(true);
  };

  const updateMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = metadataForm.name.trim();
    const normalizedCurrency = metadataForm.currency.trim().toUpperCase();
    const normalizedSymbol = metadataForm.symbol.trim().toUpperCase();
    const normalizedProviderSymbol = metadataForm.providerSymbol
      .trim()
      .toUpperCase();
    const normalizedIsin = metadataForm.isin.trim().toUpperCase();

    if (!normalizedName) {
      setErrorMessage('Asset name is required.');
      return;
    }

    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      setErrorMessage('Currency must be a 3-letter code.');
      return;
    }

    if (requiresIsin(metadataForm.assetType) && !normalizedIsin) {
      setErrorMessage('ISIN is required for this asset type.');
      return;
    }

    if (requiresSymbol(metadataForm.assetType) && !normalizedSymbol) {
      setErrorMessage('Symbol is required for this asset type.');
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
          isin: normalizedIsin || null,
          currency: normalizedCurrency,
        }),
      });
      setIsMetadataModalOpen(false);
      await load();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsUpdatingMetadata(false);
    }
  };

  const deactivateAsset = async (asset: AssetWithPosition) => {
    if (!window.confirm(`Deactivate asset "${asset.name}"?`)) {
      return;
    }

    setDeactivatingId(asset.id);
    try {
      await apiRequest(`/finances/assets/${asset.id}`, { method: 'DELETE' });
      await load();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setDeactivatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
          <p className="text-sm text-muted-foreground">
            Manage tracked instruments and position metadata.
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
          Create Asset
        </Button>
      </div>

      {errorMessage ? <ErrorState message={errorMessage} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active Assets" value={String(activeCount)} />
        <KpiCard label="Priced Assets" value={String(pricedCount)} />
        <KpiCard label="Tracked Assets" value={String(rows.length)} />
        <KpiCard label="Current Value (EUR)" value={formatMoney(totalValue)} />
      </section>

      <Card title="Asset Registry">
        {isLoading ? (
          <LoadingSkeleton lines={8} />
        ) : rows.length === 0 ? (
          <EmptyState message="No assets created yet." />
        ) : (
          <DataTable
            columns={[
              {
                key: 'asset',
                header: 'Asset',
                render: (row: AssetWithPosition) => (
                  <div>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.id}
                    </div>
                  </div>
                ),
              },
              {
                key: 'type',
                header: 'Type',
                render: (row: AssetWithPosition) => typeLabel(row.assetType),
              },
              {
                key: 'symbol',
                header: 'Symbol',
                render: (row: AssetWithPosition) =>
                  row.symbol ?? row.ticker ?? '-',
              },
              {
                key: 'providerSymbol',
                header: 'Provider Symbol',
                render: (row: AssetWithPosition) => row.providerSymbol ?? '-',
              },
              {
                key: 'isin',
                header: 'ISIN',
                render: (row: AssetWithPosition) => row.isin ?? '-',
              },
              {
                key: 'quantity',
                header: 'Quantity',
                render: (row: AssetWithPosition) =>
                  row.position ? row.position.quantity.toString() : '-',
              },
              {
                key: 'price',
                header: 'Unit Price',
                render: (row: AssetWithPosition) =>
                  row.resolvedUnitPrice === null
                    ? '-'
                    : `${row.resolvedUnitPrice.toFixed(4)} ${row.currency}`,
              },
              {
                key: 'value',
                header: 'Current Value (EUR)',
                render: (row: AssetWithPosition) =>
                  row.currentValue === null
                    ? '-'
                    : formatMoney(row.currentValue),
              },
              {
                key: 'status',
                header: 'Status',
                render: (row: AssetWithPosition) =>
                  row.isActive ? 'Active' : 'Inactive',
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (row: AssetWithPosition) => (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => openPositionModal(row)}
                    >
                      Position
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => openMetadataModal(row)}
                    >
                      Metadata
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => void deactivateAsset(row)}
                      disabled={deactivatingId === row.id || !row.isActive}
                    >
                      {deactivatingId === row.id
                        ? 'Deactivating...'
                        : 'Deactivate'}
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={rows}
            rowKey={(row) => row.id}
          />
        )}
      </Card>

      <Modal
        open={isCreateModalOpen}
        title="Create Asset"
        onClose={() => {
          if (!isCreating) {
            setIsCreateModalOpen(false);
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
                  assetType: event.target.value as AssetType,
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
              <label
                className="text-sm font-medium"
                htmlFor="create-asset-symbol"
              >
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

          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
            <div className="grid gap-1.5">
              <label
                className="text-sm font-medium"
                htmlFor="create-asset-isin"
              >
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

          <Button
            type="submit"
            variant="primary"
            disabled={isCreating}
            fullWidth
          >
            {isCreating ? 'Creating...' : 'Create Asset'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={isPositionModalOpen}
        title="Update Position"
        onClose={() => {
          if (!isUpdatingPosition) {
            setIsPositionModalOpen(false);
          }
        }}
      >
        <form className="grid gap-4" onSubmit={updatePosition}>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="position-quantity">
              Quantity
            </label>
            <input
              id="position-quantity"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              type="number"
              step="0.000001"
              min="0"
              value={positionForm.quantity}
              onChange={(event) =>
                setPositionForm((current) => ({
                  ...current,
                  quantity: event.target.value,
                }))
              }
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label
              className="text-sm font-medium"
              htmlFor="position-average-cost"
            >
              Average Cost (Optional)
            </label>
            <input
              id="position-average-cost"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              type="number"
              step="0.000001"
              min="0"
              value={positionForm.averageCost}
              onChange={(event) =>
                setPositionForm((current) => ({
                  ...current,
                  averageCost: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <label
              className="text-sm font-medium"
              htmlFor="position-manual-price"
            >
              Manual Price (Optional)
            </label>
            <input
              id="position-manual-price"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              type="number"
              step="0.000001"
              min="0"
              value={positionForm.manualPrice}
              onChange={(event) =>
                setPositionForm((current) => ({
                  ...current,
                  manualPrice: event.target.value,
                }))
              }
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={isUpdatingPosition}
            fullWidth
          >
            {isUpdatingPosition ? 'Updating...' : 'Update Position'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={isMetadataModalOpen}
        title="Edit Asset Metadata"
        onClose={() => {
          if (!isUpdatingMetadata) {
            setIsMetadataModalOpen(false);
          }
        }}
      >
        <form className="grid gap-4" onSubmit={updateMetadata}>
          <div className="grid gap-1.5">
            <label
              className="text-sm font-medium"
              htmlFor="metadata-asset-name"
            >
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
            <label
              className="text-sm font-medium"
              htmlFor="metadata-asset-type"
            >
              Type
            </label>
            <select
              id="metadata-asset-type"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={metadataForm.assetType}
              onChange={(event) =>
                setMetadataForm((current) => ({
                  ...current,
                  assetType: event.target.value as AssetType,
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
              <label
                className="text-sm font-medium"
                htmlFor="metadata-asset-symbol"
              >
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

          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
            <div className="grid gap-1.5">
              <label
                className="text-sm font-medium"
                htmlFor="metadata-asset-isin"
              >
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
    </div>
  );
}
