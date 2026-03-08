import { formatMoney } from '../../../lib/format';
import { Card } from '../../ui/card';
import { KpiCard } from '../../ui/kpi-card';
import { ErrorState } from '../../ui/states';
import { TaxYearControls } from './tax-year-controls';

type TaxSummary = {
  year: number;
  realizedGainLossEur: number;
  dividendsGrossEur: number;
  dividendsWithholdingEur: number;
  dividendsNetEur: number;
  operations: {
    sells: number;
    dividends: number;
  };
};

export function TaxesFeature({
  taxYear,
  summary,
  reportUrl,
  errorMessage,
}: {
  taxYear: number;
  summary: TaxSummary | null;
  reportUrl: string;
  errorMessage: string | null;
}) {
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
          label="Dividends Net EUR"
          value={
            <span className="sb-sensitive-value">
              {formatMoney(summary?.dividendsNetEur ?? 0)}
            </span>
          }
        />
        <KpiCard
          label="Sell Operations"
          value={String(summary?.operations.sells ?? 0)}
        />
        <KpiCard
          label="Dividend Operations"
          value={String(summary?.operations.dividends ?? 0)}
        />
      </section>

      <Card title="Year-End Tax Summary">
        <div className="grid gap-4 sm:grid-cols-[220px_1fr_auto] sm:items-end">
          <TaxYearControls initialYear={taxYear} />
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
                <p>
                  Dividends Gross:{' '}
                  <span className="sb-sensitive-value">
                    {formatMoney(summary.dividendsGrossEur)}
                  </span>
                </p>
                <p>
                  Dividends Withholding:{' '}
                  <span className="sb-sensitive-value">
                    {formatMoney(summary.dividendsWithholdingEur)}
                  </span>
                </p>
                <p>
                  Dividends Net:{' '}
                  <span className="sb-sensitive-value">
                    {formatMoney(summary.dividendsNetEur)}
                  </span>
                </p>
              </>
            ) : (
              <p>No summary loaded.</p>
            )}
          </div>
          <a
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground"
            href={reportUrl}
          >
            Download Annual PDF
          </a>
        </div>
      </Card>
    </div>
  );
}
