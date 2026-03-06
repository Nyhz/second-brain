'use client';

import type { AssetType, AssetWithPosition } from '@second-brain/types';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from '../../../lib/api';
import { loadAssetsData } from '../../../lib/data/assets-data';
import { getApiErrorMessage } from '../../../lib/errors';
import { formatMoney } from '../../../lib/format';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { ConfirmModal } from '../../ui/confirm-modal';
import { DataTable } from '../../ui/data-table';
import { Modal } from '../../ui/modal';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../ui/states';

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

const formatQuantity = (value: number) => {
  if (!Number.isFinite(value)) {
    return '-';
  }
  const rounded = Number(value.toFixed(8));
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return rounded.toString();
};

const requiresIsin = (assetType: AssetType) =>
  assetType === 'stock' ||
  assetType === 'etf' ||
  assetType === 'mutual_fund' ||
  assetType === 'retirement_fund';

const requiresSymbol = (assetType: AssetType) =>
  assetType === 'stock' || assetType === 'etf' || assetType === 'crypto';

type AssetsFeatureProps = {
  initialRows?: AssetWithPosition[];
  initialHoldingsByAssetId?: Record<string, number>;
};

export function AssetsFeature({
  initialRows,
  initialHoldingsByAssetId,
}: AssetsFeatureProps) {
  const router = useRouter();
  const [rows, setRows] = useState<AssetWithPosition[]>(initialRows ?? []);
  const [holdingsByAssetId, setHoldingsByAssetId] = useState<
    Record<string, number>
  >(initialHoldingsByAssetId ?? {});
  const [isLoading, setIsLoading] = useState(initialRows === undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdatingMetadata, setIsUpdatingMetadata] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [confirmDeactivateAsset, setConfirmDeactivateAsset] =
    useState<AssetWithPosition | null>(null);

  const [createForm, setCreateForm] =
    useState<CreateAssetForm>(initialCreateForm);
  const [metadataForm, setMetadataForm] =
    useState<MetadataForm>(initialMetadataForm);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const assetsData = await loadAssetsData({ withHoldings: true });
      setRows(assetsData.rows);
      setHoldingsByAssetId(assetsData.holdingsByAssetId);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialRows !== undefined) {
      return;
    }
    void load();
  }, [initialRows, load]);

  const activeCount = useMemo(
    () => rows.filter((row) => row.isActive).length,
    [rows],
  );
  const trackedCount = useMemo(
    () =>
      rows.filter((row) =>
        Boolean(row.providerSymbol ?? row.symbol ?? row.ticker),
      ).length,
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
          isin: requiresIsin(createForm.assetType)
            ? normalizedIsin || undefined
            : undefined,
          currency: normalizedCurrency,
          quantity: 1,
        }),
      });
      setCreateForm(initialCreateForm);
      setIsCreateModalOpen(false);
      await load();
      router.refresh();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsCreating(false);
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
          isin: requiresIsin(metadataForm.assetType)
            ? normalizedIsin || null
            : undefined,
          currency: normalizedCurrency,
        }),
      });
      setIsMetadataModalOpen(false);
      await load();
      router.refresh();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsUpdatingMetadata(false);
    }
  };

  const deactivateAsset = (asset: AssetWithPosition) => {
    setConfirmDeactivateAsset(asset);
  };

  const confirmDeactivate = async () => {
    if (!confirmDeactivateAsset) {
      return;
    }

    setDeactivatingId(confirmDeactivateAsset.id);
    try {
      await apiRequest(`/finances/assets/${confirmDeactivateAsset.id}`, {
        method: 'DELETE',
      });
      await load();
      router.refresh();
      setConfirmDeactivateAsset(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setDeactivatingId(null);
    }
  };

  const reactivateAsset = async (asset: AssetWithPosition) => {
    setReactivatingId(asset.id);
    try {
      await apiRequest(`/finances/assets/${asset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: true }),
      });
      await load();
      router.refresh();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setReactivatingId(null);
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Total Assets
          </p>
          <p className="text-xl font-semibold">{rows.length}</p>
        </div>
        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Active
          </p>
          <p className="text-xl font-semibold">{activeCount}</p>
        </div>
        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Tracked
          </p>
          <p className="text-xl font-semibold">{trackedCount}</p>
        </div>
      </div>

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
                sortValue: (row: AssetWithPosition) => row.name,
                render: (row: AssetWithPosition) => (
                  <div>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.symbol ??
                        (row.assetType === 'crypto' ? '-' : (row.isin ?? '-'))}
                    </div>
                  </div>
                ),
              },
              {
                key: 'type',
                header: 'Type',
                sortValue: (row: AssetWithPosition) => typeLabel(row.assetType),
                render: (row: AssetWithPosition) => typeLabel(row.assetType),
              },
              {
                key: 'symbol',
                header: 'Symbol',
                sortValue: (row: AssetWithPosition) => row.symbol,
                render: (row: AssetWithPosition) => row.symbol ?? '-',
              },
              {
                key: 'isin',
                header: 'ISIN',
                sortValue: (row: AssetWithPosition) =>
                  row.assetType === 'crypto' ? null : row.isin,
                render: (row: AssetWithPosition) =>
                  row.assetType === 'crypto' ? '' : (row.isin ?? '-'),
              },
              {
                key: 'quantity',
                header: 'Quantity',
                sortValue: (row: AssetWithPosition) =>
                  holdingsByAssetId[row.id] ?? 0,
                render: (row: AssetWithPosition) =>
                  formatQuantity(holdingsByAssetId[row.id] ?? 0),
              },
              {
                key: 'price',
                header: 'Unit Price',
                sortValue: (row: AssetWithPosition) => row.resolvedUnitPrice,
                render: (row: AssetWithPosition) =>
                  row.resolvedUnitPrice === null ? (
                    '-'
                  ) : (
                    <span className="sb-sensitive-value">
                      {`${row.resolvedUnitPrice.toFixed(2)} ${row.currency}`}
                    </span>
                  ),
              },
              {
                key: 'value',
                header: 'Current Value (EUR)',
                sortValue: (row: AssetWithPosition) => row.currentValue,
                render: (row: AssetWithPosition) =>
                  row.currentValue === null ? (
                    '-'
                  ) : (
                    <span className="sb-sensitive-value">
                      {formatMoney(row.currentValue)}
                    </span>
                  ),
              },
              {
                key: 'status',
                header: 'Status',
                sortValue: (row: AssetWithPosition) => row.isActive,
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
                      onClick={() => openMetadataModal(row)}
                    >
                      Metadata
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={row.isActive ? 'danger' : 'secondary'}
                      onClick={() =>
                        row.isActive
                          ? void deactivateAsset(row)
                          : void reactivateAsset(row)
                      }
                      disabled={
                        deactivatingId === row.id || reactivatingId === row.id
                      }
                    >
                      {deactivatingId === row.id
                        ? 'Deactivating...'
                        : reactivatingId === row.id
                          ? 'Reactivating...'
                          : row.isActive
                            ? 'Deactivate'
                            : 'Reactivate'}
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

          <div
            className={`grid gap-1.5 ${
              createForm.assetType === 'crypto' ? '' : 'sm:grid-cols-2 sm:gap-4'
            }`}
          >
            {createForm.assetType === 'crypto' ? null : (
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

          <div
            className={`grid gap-1.5 ${
              metadataForm.assetType === 'crypto'
                ? ''
                : 'sm:grid-cols-2 sm:gap-4'
            }`}
          >
            {metadataForm.assetType === 'crypto' ? null : (
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

      <ConfirmModal
        open={Boolean(confirmDeactivateAsset)}
        title="Deactivate Asset"
        description={
          confirmDeactivateAsset
            ? `Deactivate asset "${confirmDeactivateAsset.name}"?`
            : ''
        }
        confirmLabel="Deactivate"
        confirmVariant="danger"
        isLoading={Boolean(deactivatingId)}
        onCancel={() => setConfirmDeactivateAsset(null)}
        onConfirm={() => void confirmDeactivate()}
      />
    </div>
  );
}
