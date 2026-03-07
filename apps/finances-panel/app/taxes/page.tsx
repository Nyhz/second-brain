import { TaxesFeature } from '../../components/features/taxes/taxes-feature';
import { loadServerTaxSummary } from '../../lib/data/server-data';
import { getApiErrorMessage } from '../../lib/errors';

type TaxSummary = {
  year: number;
  realizedGainLossEur: number;
};

const getSingleSearchParam = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export default async function TaxesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const yearParam = getSingleSearchParam(resolvedSearchParams.year);
  const parsedYear = Number(yearParam);
  const taxYear =
    Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : new Date().getUTCFullYear();

  let summary: TaxSummary | null = null;
  let errorMessage: string | null = null;

  try {
    summary = await loadServerTaxSummary(taxYear);
  } catch (error) {
    errorMessage = getApiErrorMessage(error);
  }

  return (
    <TaxesFeature
      taxYear={taxYear}
      summary={summary}
      errorMessage={errorMessage}
    />
  );
}
