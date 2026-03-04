'use client';

import type { AssetType, AssetWithPosition } from '@second-brain/types';
import {
  AllocationDonutChart,
  Button,
  Card,
  DataTable,
  EmptyState,
  Modal,
  PageTabs,
  PriceLineChart,
} from '../../components/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiRequest } from '../../lib/api';
import { loadAssetsData } from '../../lib/data/assets-data';
import type { HoldingRow, TimePoint } from '../../lib/dashboard-types';
import { getApiErrorMessage } from '../../lib/errors';
import { formatMoney } from '../../lib/format';

const assetTypes: AssetType[] = [
  'stock',
  'etf',
  'mutual_fund',
  'retirement_fund',
  'real_estate',
  'bond',
  'crypto',
  'cash_equivalent',
  'other',
];

type CreateAssetForm = {
  name: string;
  assetType: AssetType;
  symbol: string;
  ticker: string;
  isin: string;
  exchange: string;
  providerSymbol: string;
  currency: string;
  quantity: string;
  averageCost: string;
  manualPrice: string;
  notes: string;
};

type PositionForm = {
  assetId: string;
  quantity: string;
  averageCost: string;
  manualPrice: string;
};

type MetadataForm = {
  name: string;
  assetType: AssetType;
  symbol: string;
  ticker: string;
  isin: string;
  exchange: string;
  providerSymbol: string;
  currency: string;
  notes: string;
  isActive: boolean;
};

const initialCreateForm: CreateAssetForm = {
  name: '',
  assetType: 'stock',
  symbol: '',
  ticker: '',
  isin: '',
  exchange: '',
  providerSymbol: '',
  currency: 'USD',
  quantity: '1',
  averageCost: '',
  manualPrice: '',
  notes: '',
};

const initialPositionForm: PositionForm = {
  assetId: '',
  quantity: '1',
  averageCost: '',
  manualPrice: '',
};

const initialMetadataForm: MetadataForm = {
  name: '',
  assetType: 'stock',
  symbol: '',
  ticker: '',
  isin: '',
  exchange: '',
  providerSymbol: '',
  currency: 'USD',
  notes: '',
  isActive: true,
};

const toNullableNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export default function AssetsPage() {
  const tabs = useMemo(
    () => [
      { id: 'graph', label: 'Graph Section' },
      { id: 'table', label: 'Composition Table' },
      { id: 'prices', label: 'Daily Prices' },
    ],
    [],
  );
  const [activeTab, setActiveTab] = useState('graph');

  const [rows, setRows] = useState<AssetWithPosition[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [allocation, setAllocation] = useState<
    { label: string; value: number; percent: number; color: string }[]
  >([]);
  const [series, setSeries] = useState<TimePoint[]>([]);
  const [markets, setMarkets] = useState<
    {
      symbol: string;
      name: string;
      category: string;
      price: number;
      dayChangePct: number;
    }[]
  >([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpdatingPosition, setIsUpdatingPosition] = useState(false);
  const [isUpdatingMetadata, setIsUpdatingMetadata] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [createForm, setCreateForm] =
    useState<CreateAssetForm>(initialCreateForm);
  const [positionForm, setPositionForm] =
    useState<PositionForm>(initialPositionForm);
  const [editingMetadataId, setEditingMetadataId] = useState<string | null>(
    null,
  );
  const [metadataForm, setMetadataForm] =
    useState<MetadataForm>(initialMetadataForm);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadAssetsData();
      setRows(data.rows);
      setHoldings(data.holdings);
      setAllocation(data.allocation);
      setSeries(data.series);
      setMarkets(data.markets);

      const firstAssetId = data.rows[0]?.id ?? '';
      setPositionForm((current) => ({
        ...current,
        assetId: current.assetId || firstAssetId,
        quantity:
          current.quantity ||
          (data.rows[0]?.position?.quantity
            ? String(data.rows[0].position?.quantity)
            : '1'),
      }));

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

  const createAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!createForm.name.trim()) {
      setErrorMessage('Asset name is required.');
      return;
    }
    if (!/^[A-Z]{3}$/.test(createForm.currency.trim().toUpperCase())) {
      setErrorMessage('Currency must be a 3-letter code (for example, USD).');
      return;
    }
    if (!createForm.ticker.trim()) {
      setErrorMessage('Ticker is required.');
      return;
    }
    if (
      ['stock', 'etf', 'mutual_fund', 'retirement_fund'].includes(
        createForm.assetType,
      ) &&
      !createForm.isin.trim()
    ) {
      setErrorMessage('ISIN is required for this asset type.');
      return;
    }

    const quantity = Number(createForm.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setErrorMessage('Quantity must be a positive number.');
      return;
    }

    const payload = {
      name: createForm.name.trim(),
      assetType: createForm.assetType,
      symbol: createForm.symbol.trim() || undefined,
      ticker: createForm.ticker.trim().toUpperCase(),
      isin: createForm.isin.trim().toUpperCase() || undefined,
      exchange: createForm.exchange.trim() || undefined,
      providerSymbol: createForm.providerSymbol.trim() || undefined,
      currency: createForm.currency.trim().toUpperCase(),
      quantity,
      averageCost: toNullableNumber(createForm.averageCost),
      manualPrice: toNullableNumber(createForm.manualPrice),
      notes: createForm.notes.trim() || undefined,
    };

    setIsCreating(true);
    try {
      await apiRequest('/finances/assets', {
        method: 'POST',
        body: JSON.stringify(payload),
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

  const selectAssetForPosition = (assetId: string) => {
    const selected = rows.find((row) => row.id === assetId);
    setPositionForm({
      assetId,
      quantity: String(selected?.position?.quantity ?? 1),
      averageCost:
        selected?.position?.averageCost === null ||
        selected?.position?.averageCost === undefined
          ? ''
          : String(selected.position.averageCost),
      manualPrice:
        selected?.position?.manualPrice === null ||
        selected?.position?.manualPrice === undefined
          ? ''
          : String(selected.position.manualPrice),
    });
  };

  const updatePosition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!positionForm.assetId) {
      setErrorMessage('Select an asset before updating position.');
      return;
    }

    const quantity = Number(positionForm.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setErrorMessage('Position quantity must be a positive number.');
      return;
    }

    const payload = {
      quantity,
      averageCost: toNullableNumber(positionForm.averageCost) ?? null,
      manualPrice: toNullableNumber(positionForm.manualPrice) ?? null,
      manualPriceAsOf: positionForm.manualPrice.trim()
        ? new Date().toISOString()
        : null,
    };

    setIsUpdatingPosition(true);
    try {
      await apiRequest(`/finances/assets/${positionForm.assetId}/position`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await load();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsUpdatingPosition(false);
    }
  };

  const startEditingMetadata = (asset: AssetWithPosition) => {
    setEditingMetadataId(asset.id);
    setMetadataForm({
      name: asset.name,
      assetType: asset.assetType,
      symbol: asset.symbol ?? '',
      ticker: asset.ticker ?? '',
      isin: asset.isin ?? '',
      exchange: asset.exchange ?? '',
      providerSymbol: asset.providerSymbol ?? '',
      currency: asset.currency,
      notes: asset.notes ?? '',
      isActive: asset.isActive,
    });
    setErrorMessage(null);
  };

  const updateMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingMetadataId) {
      return;
    }

    const normalizedName = metadataForm.name.trim();
    const normalizedCurrency = metadataForm.currency.trim().toUpperCase();
    const normalizedSymbol = metadataForm.symbol.trim().toUpperCase();
    const normalizedTicker = metadataForm.ticker.trim().toUpperCase();
    const normalizedIsin = metadataForm.isin.trim().toUpperCase();
    const normalizedExchange = metadataForm.exchange.trim().toUpperCase();
    const normalizedProviderSymbol = metadataForm.providerSymbol
      .trim()
      .toUpperCase();
    const normalizedNotes = metadataForm.notes.trim();

    if (!normalizedName) {
      setErrorMessage('Asset name is required.');
      return;
    }
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      setErrorMessage('Currency must be a 3-letter code (for example, USD).');
      return;
    }
    if (!normalizedTicker) {
      setErrorMessage('Ticker is required.');
      return;
    }

    setIsUpdatingMetadata(true);
    try {
      await apiRequest(`/finances/assets/${editingMetadataId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: normalizedName,
          assetType: metadataForm.assetType,
          symbol: normalizedSymbol ? normalizedSymbol : null,
          ticker: normalizedTicker,
          isin: normalizedIsin ? normalizedIsin : null,
          exchange: normalizedExchange ? normalizedExchange : null,
          providerSymbol: normalizedProviderSymbol
            ? normalizedProviderSymbol
            : null,
          currency: normalizedCurrency,
          notes: normalizedNotes ? normalizedNotes : null,
          isActive: metadataForm.isActive,
        }),
      });
      setEditingMetadataId(null);
      setMetadataForm(initialMetadataForm);
      await load();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsUpdatingMetadata(false);
    }
  };

  const deactivateAsset = async (assetId: string) => {
    setDeactivatingId(assetId);
    try {
      await apiRequest(`/finances/assets/${assetId}`, { method: 'DELETE' });
      await load();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setDeactivatingId(null);
    }
  };

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Assets Universe</h1>
          <p className="small">
            Stocks, ETFs, funds, retirement holdings, real-estate proxies, and
            crypto.
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
          Create Asset
        </Button>
      </header>

      {errorMessage ? (
        <p className="small" style={{ color: '#f87171' }}>
          {errorMessage}
        </p>
      ) : null}

      <PageTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'graph' ? (
        <div className="grid two-col" style={{ gap: '1rem' }}>
          <Card title="Portfolio Graph">
            {series.length === 0 ? (
              <EmptyState message="No portfolio history available yet." />
            ) : (
              <PriceLineChart data={series} />
            )}
          </Card>
          <Card title="Asset Type Composition">
            {allocation.length === 0 ? (
              <EmptyState message="No allocation yet." />
            ) : (
              <AllocationDonutChart data={allocation} />
            )}
          </Card>
        </div>
      ) : null}

      {activeTab === 'table' ? (
        <div className="grid" style={{ gap: '1rem' }}>
          <div className="grid two-col" style={{ gap: '1rem' }}>
            <Card title="Update Position">
              <form className="form-grid" onSubmit={updatePosition}>
                <select
                  value={positionForm.assetId}
                  onChange={(event) =>
                    selectAssetForPosition(event.target.value)
                  }
                  required
                >
                  <option value="">Select asset</option>
                  {rows.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
                <input
                  value={positionForm.quantity}
                  onChange={(event) =>
                    setPositionForm((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                  placeholder="Quantity"
                  required
                />
                <input
                  value={positionForm.averageCost}
                  onChange={(event) =>
                    setPositionForm((current) => ({
                      ...current,
                      averageCost: event.target.value,
                    }))
                  }
                  placeholder="Average cost (optional)"
                />
                <input
                  value={positionForm.manualPrice}
                  onChange={(event) =>
                    setPositionForm((current) => ({
                      ...current,
                      manualPrice: event.target.value,
                    }))
                  }
                  placeholder="Manual price (optional)"
                />
                <button
                  type="submit"
                  disabled={isUpdatingPosition || rows.length === 0}
                >
                  {isUpdatingPosition ? 'Updating...' : 'Update Position'}
                </button>
              </form>
            </Card>
          </div>

          {editingMetadataId ? (
            <Card title="Edit Asset Metadata">
              <form className="form-grid" onSubmit={updateMetadata}>
                <input
                  value={metadataForm.name}
                  onChange={(event) =>
                    setMetadataForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Asset name"
                  required
                />
                <select
                  value={metadataForm.assetType}
                  onChange={(event) =>
                    setMetadataForm((current) => ({
                      ...current,
                      assetType: event.target.value as AssetType,
                    }))
                  }
                >
                  {assetTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <input
                  value={metadataForm.symbol}
                  onChange={(event) =>
                    setMetadataForm((current) => ({
                      ...current,
                      symbol: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Symbol (optional)"
                />
                <input
                  value={metadataForm.ticker}
                  onChange={(event) =>
                    setMetadataForm((current) => ({
                      ...current,
                      ticker: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Ticker"
                  required
                />
                <input
                  value={metadataForm.isin}
                  onChange={(event) =>
                    setMetadataForm((current) => ({
                      ...current,
                      isin: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="ISIN"
                />
                <input
                  value={metadataForm.exchange}
                  onChange={(event) =>
                    setMetadataForm((current) => ({
                      ...current,
                      exchange: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Exchange (optional)"
                />
                <input
                  value={metadataForm.providerSymbol}
                  onChange={(event) =>
                    setMetadataForm((current) => ({
                      ...current,
                      providerSymbol: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Provider symbol (optional)"
                />
                <input
                  value={metadataForm.currency}
                  maxLength={3}
                  onChange={(event) =>
                    setMetadataForm((current) => ({
                      ...current,
                      currency: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Currency"
                  required
                />
                <input
                  value={metadataForm.notes}
                  onChange={(event) =>
                    setMetadataForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Notes (optional)"
                />
                <label className="small">
                  <input
                    type="checkbox"
                    checked={metadataForm.isActive}
                    onChange={(event) =>
                      setMetadataForm((current) => ({
                        ...current,
                        isActive: event.target.checked,
                      }))
                    }
                  />{' '}
                  Active asset
                </label>
                <div className="top-nav-actions">
                  <button type="submit" disabled={isUpdatingMetadata}>
                    {isUpdatingMetadata ? 'Saving...' : 'Save Metadata'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingMetadataId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </Card>
          ) : null}

          <Card title="Composition Table">
            {holdings.length === 0 ? (
              <EmptyState message="No holdings yet." />
            ) : (
              <DataTable
                columns={[
                  {
                    key: 'asset',
                    header: 'Asset',
                    render: (row: HoldingRow) => `${row.symbol} · ${row.name}`,
                  },
                  {
                    key: 'type',
                    header: 'Type',
                    render: (row: HoldingRow) => row.type,
                  },
                  {
                    key: 'qty',
                    header: 'Quantity',
                    render: (row: HoldingRow) => row.quantity.toString(),
                  },
                  {
                    key: 'price',
                    header: 'Price',
                    render: (row: HoldingRow) => formatMoney(row.price),
                  },
                  {
                    key: 'value',
                    header: 'Value',
                    render: (row: HoldingRow) => formatMoney(row.value),
                  },
                  {
                    key: 'change',
                    header: '24h %',
                    render: (row: HoldingRow) =>
                      `${row.dayChangePct > 0 ? '+' : ''}${row.dayChangePct}%`,
                  },
                ]}
                rows={holdings}
                rowKey={(row) => row.symbol}
              />
            )}
          </Card>

          <Card title="Manage Assets">
            {isLoading ? (
              <p className="small">Loading assets...</p>
            ) : rows.length === 0 ? (
              <EmptyState message="No assets created yet." />
            ) : (
              <DataTable
                columns={[
                  {
                    key: 'name',
                    header: 'Asset',
                    render: (row: AssetWithPosition) => row.name,
                  },
                  {
                    key: 'type',
                    header: 'Type',
                    render: (row: AssetWithPosition) => row.assetType,
                  },
                  {
                    key: 'symbol',
                    header: 'Symbol',
                    render: (row: AssetWithPosition) =>
                      row.symbol ?? row.ticker ?? '-',
                  },
                  {
                    key: 'isin',
                    header: 'ISIN',
                    render: (row: AssetWithPosition) => row.isin ?? '-',
                  },
                  {
                    key: 'qty',
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
                        : formatMoney(row.resolvedUnitPrice),
                  },
                  {
                    key: 'value',
                    header: 'Current Value',
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
                      <div className="top-nav-actions">
                        <button
                          type="button"
                          onClick={() => selectAssetForPosition(row.id)}
                        >
                          Edit Position
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditingMetadata(row)}
                        >
                          Edit Metadata
                        </button>
                        <button
                          type="button"
                          onClick={() => void deactivateAsset(row.id)}
                          disabled={deactivatingId === row.id || !row.isActive}
                        >
                          {deactivatingId === row.id
                            ? 'Deactivating...'
                            : 'Deactivate'}
                        </button>
                      </div>
                    ),
                  },
                ]}
                rows={rows}
                rowKey={(row) => row.id}
              />
            )}
          </Card>
        </div>
      ) : null}

      {activeTab === 'prices' ? (
        <Card title="Daily Updated Prices">
          {markets.length === 0 ? (
            <EmptyState message="No market prices available yet." />
          ) : (
            <DataTable
              columns={[
                {
                  key: 'symbol',
                  header: 'Symbol',
                  render: (row) => row.symbol,
                },
                { key: 'name', header: 'Name', render: (row) => row.name },
                {
                  key: 'category',
                  header: 'Category',
                  render: (row) => row.category,
                },
                {
                  key: 'price',
                  header: 'Price',
                  render: (row) => formatMoney(row.price),
                },
                {
                  key: 'day',
                  header: '24h %',
                  render: (row) =>
                    `${row.dayChangePct > 0 ? '+' : ''}${row.dayChangePct}%`,
                },
              ]}
              rows={markets}
              rowKey={(row) => row.symbol}
            />
          )}
        </Card>
      ) : null}

      <Modal
        open={isCreateModalOpen}
        title="Create Asset"
        onClose={() => {
          if (!isCreating) {
            setIsCreateModalOpen(false);
          }
        }}
      >
        <form className="form-grid" onSubmit={createAsset}>
          <input
            value={createForm.name}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder="Asset name"
            required
          />
          <select
            value={createForm.assetType}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                assetType: event.target.value as AssetType,
              }))
            }
          >
            {assetTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input
            value={createForm.symbol}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                symbol: event.target.value.toUpperCase(),
              }))
            }
            placeholder="Symbol (optional)"
          />
          <input
            value={createForm.ticker}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                ticker: event.target.value.toUpperCase(),
              }))
            }
            placeholder="Ticker"
            required
          />
          <input
            value={createForm.isin}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                isin: event.target.value.toUpperCase(),
              }))
            }
            placeholder="ISIN (required for stock/etf/funds)"
          />
          <input
            value={createForm.exchange}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                exchange: event.target.value.toUpperCase(),
              }))
            }
            placeholder="Exchange (optional)"
          />
          <input
            value={createForm.providerSymbol}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                providerSymbol: event.target.value.toUpperCase(),
              }))
            }
            placeholder="Provider symbol (optional)"
          />
          <input
            value={createForm.currency}
            maxLength={3}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                currency: event.target.value.toUpperCase(),
              }))
            }
            placeholder="Currency"
            required
          />
          <input
            value={createForm.quantity}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                quantity: event.target.value,
              }))
            }
            placeholder="Quantity"
            required
          />
          <input
            value={createForm.averageCost}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                averageCost: event.target.value,
              }))
            }
            placeholder="Average cost (optional)"
          />
          <input
            value={createForm.manualPrice}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                manualPrice: event.target.value,
              }))
            }
            placeholder="Manual price (optional)"
          />
          <input
            value={createForm.notes}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
            placeholder="Notes (optional)"
          />
          <Button type="submit" variant="primary" disabled={isCreating} fullWidth>
            {isCreating ? 'Creating...' : 'Create Asset'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
