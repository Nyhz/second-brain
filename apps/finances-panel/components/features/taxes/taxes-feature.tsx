'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';
import { formatMoney } from '../../../lib/format';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { KpiCard } from '../../ui/kpi-card';
import { ErrorState, LoadingSkeleton } from '../../ui/states';

type TaxSummary = {
  year: number;
  realizedGainLossEur: number;
};

export function TaxesFeature() {
  const [taxYear, setTaxYear] = useState(new Date().getUTCFullYear());
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadTaxSummary = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiRequest<TaxSummary>(
        `/finances/tax/yearly-summary?year=${taxYear}`,
      );
      setSummary(data);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, [taxYear]);

  useEffect(() => {
    void loadTaxSummary();
  }, [loadTaxSummary]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Taxes</h1>
          <p className="text-sm text-muted-foreground">
            Year-end realized gain and loss summary.
          </p>
        </div>
      </div>

      {errorMessage ? <ErrorState message={errorMessage} /> : null}

      {isLoading ? (
        <LoadingSkeleton lines={6} />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2">
            <KpiCard
              label={`Realized Gain/Loss ${summary?.year ?? taxYear}`}
              value={
                <span className="sb-sensitive-value">
                  {formatMoney(summary?.realizedGainLossEur ?? 0)}
                </span>
              }
            />
            <KpiCard
              label="Tax Year"
              value={String(summary?.year ?? taxYear)}
            />
          </section>

          <Card title="Year-End Tax Summary">
            <div className="grid gap-4 sm:grid-cols-[220px_1fr_auto] sm:items-end">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="tax-year">
                  Tax Year
                </label>
                <input
                  id="tax-year"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  type="number"
                  value={taxYear}
                  onChange={(event) => setTaxYear(Number(event.target.value))}
                  min={2000}
                  max={2100}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                {summary ? (
                  <>
                    <p>Year: {summary.year}</p>
                    <p>
                      Realized Gain/Loss:{' '}
                      <span className="sb-sensitive-value">
                        {formatMoney(summary.realizedGainLossEur)}
                      </span>
                    </p>
                  </>
                ) : (
                  <p>No summary loaded.</p>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void loadTaxSummary()}
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : 'Refresh'}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
