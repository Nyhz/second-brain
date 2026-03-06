'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';

type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | boolean | Date | null | undefined;
  headerClassName?: string;
  cellClassName?: string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
};

export function DataTable<T>({ columns, rows, rowKey }: DataTableProps<T>) {
  const [sortState, setSortState] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  const sortedRows = useMemo(() => {
    if (!sortState) {
      return rows;
    }

    const activeColumn = columns.find((column) => column.key === sortState.key);
    if (!activeColumn?.sortValue) {
      return rows;
    }

    const compareValue = (
      left: string | number | boolean | Date | null | undefined,
      right: string | number | boolean | Date | null | undefined,
    ) => {
      if (left === null || left === undefined) {
        return right === null || right === undefined ? 0 : 1;
      }
      if (right === null || right === undefined) {
        return -1;
      }

      if (left instanceof Date || right instanceof Date) {
        const leftNumber = left instanceof Date ? left.getTime() : Number(left);
        const rightNumber = right instanceof Date ? right.getTime() : Number(right);
        return leftNumber - rightNumber;
      }

      if (typeof left === 'string' || typeof right === 'string') {
        return String(left).localeCompare(String(right), undefined, {
          sensitivity: 'base',
          numeric: true,
        });
      }

      const leftNumber = Number(left);
      const rightNumber = Number(right);
      if (!Number.isFinite(leftNumber) && !Number.isFinite(rightNumber)) {
        return String(left).localeCompare(String(right), undefined, {
          sensitivity: 'base',
          numeric: true,
        });
      }
      if (!Number.isFinite(leftNumber)) {
        return 1;
      }
      if (!Number.isFinite(rightNumber)) {
        return -1;
      }
      return leftNumber - rightNumber;
    };

    const sorted = [...rows].sort((a, b) => {
      const result = compareValue(
        activeColumn.sortValue?.(a),
        activeColumn.sortValue?.(b),
      );
      return sortState.direction === 'asc' ? result : -result;
    });

    return sorted;
  }, [columns, rows, sortState]);

  const toggleSort = (columnKey: string) => {
    setSortState((current) => {
      if (!current || current.key !== columnKey) {
        return { key: columnKey, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { key: columnKey, direction: 'desc' };
      }
      return null;
    });
  };

  const sortMarker = (columnKey: string) => {
    if (!sortState || sortState.key !== columnKey) {
      return '↕';
    }
    return sortState.direction === 'asc' ? '▲' : '▼';
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/30">
          <tr className="border-b border-border/70">
            {columns.map((col) => (
              <th
                key={col.key}
                aria-sort={
                  sortState?.key === col.key
                    ? sortState.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                className={cn(
                  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                  col.headerClassName,
                )}
              >
                {col.sortValue ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {col.header}
                    <span className="text-[10px]" aria-hidden="true">
                      {sortMarker(col.key)}
                    </span>
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-border/50 transition-colors hover:bg-muted/35"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-4 py-3.5 align-top text-foreground',
                    col.cellClassName,
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
