import type { AssetType, AssetWithPosition } from '@second-brain/types';
import { prettyAssetType } from '../../../lib/display';
import { formatMoney } from '../../../lib/format';
import { AssetRowActions } from './asset-row-actions';

const typeLabel = (value: AssetType) => prettyAssetType(value);

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

export function AssetsTable({
  direction,
  rows,
  sort,
  holdingsByAssetId,
}: {
  direction: 'asc' | 'desc';
  sort:
    | 'asset'
    | 'currentValue'
    | 'isin'
    | 'quantity'
    | 'status'
    | 'symbol'
    | 'type'
    | 'unitPrice';
  rows: AssetWithPosition[];
  holdingsByAssetId: Record<string, number>;
}) {
  const sortHref = (
    column:
      | 'asset'
      | 'currentValue'
      | 'isin'
      | 'quantity'
      | 'status'
      | 'symbol'
      | 'type'
      | 'unitPrice',
  ) => {
    const nextDirection =
      sort === column && direction === 'asc' ? 'desc' : 'asc';
    return `/assets?sort=${column}&direction=${nextDirection}`;
  };

  const sortMarker = (
    column:
      | 'asset'
      | 'currentValue'
      | 'isin'
      | 'quantity'
      | 'status'
      | 'symbol'
      | 'type'
      | 'unitPrice',
  ) => {
    if (sort !== column) {
      return '↕';
    }
    return direction === 'asc' ? '▲' : '▼';
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/30">
          <tr className="border-b border-border/70">
            {[
              ['asset', 'Asset'],
              ['type', 'Type'],
              ['symbol', 'Symbol'],
              ['isin', 'ISIN'],
              ['quantity', 'Quantity'],
              ['unitPrice', 'Unit Price'],
              ['currentValue', 'Current Value (EUR)'],
              ['status', 'Status'],
            ].map(([key, label]) => (
              <th
                key={key}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <a
                  href={sortHref(
                    key as
                      | 'asset'
                      | 'currentValue'
                      | 'isin'
                      | 'quantity'
                      | 'status'
                      | 'symbol'
                      | 'type'
                      | 'unitPrice',
                  )}
                  className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  {label}
                  <span className="text-[10px]" aria-hidden="true">
                    {sortMarker(
                      key as
                        | 'asset'
                        | 'currentValue'
                        | 'isin'
                        | 'quantity'
                        | 'status'
                        | 'symbol'
                        | 'type'
                        | 'unitPrice',
                    )}
                  </span>
                </a>
              </th>
            ))}
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border/50 transition-colors hover:bg-muted/35"
            >
              <td className="px-4 py-3.5 align-top text-foreground">
                <div>
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.symbol ??
                      (row.assetType === 'crypto' ? '-' : (row.isin ?? '-'))}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3.5 align-top text-foreground">
                {typeLabel(row.assetType)}
              </td>
              <td className="px-4 py-3.5 align-top text-foreground">
                {row.symbol ?? '-'}
              </td>
              <td className="px-4 py-3.5 align-top text-foreground">
                {row.assetType === 'crypto' ? '' : (row.isin ?? '-')}
              </td>
              <td className="px-4 py-3.5 align-top text-foreground">
                {formatQuantity(holdingsByAssetId[row.id] ?? 0)}
              </td>
              <td className="px-4 py-3.5 align-top text-foreground">
                {row.resolvedUnitPrice === null ? (
                  '-'
                ) : (
                  <span className="sb-sensitive-value">
                    {`${row.resolvedUnitPrice.toFixed(2)} ${row.currency}`}
                  </span>
                )}
              </td>
              <td className="px-4 py-3.5 align-top text-foreground">
                {row.currentValue === null ? (
                  '-'
                ) : (
                  <span className="sb-sensitive-value">
                    {formatMoney(row.currentValue)}
                  </span>
                )}
              </td>
              <td className="px-4 py-3.5 align-top text-foreground">
                {row.isActive ? 'Active' : 'Inactive'}
              </td>
              <td className="px-4 py-3.5 align-top text-foreground">
                <AssetRowActions asset={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
