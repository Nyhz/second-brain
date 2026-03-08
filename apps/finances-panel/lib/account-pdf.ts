export type AccountPdfDocumentType = 'transaction-ledger' | 'statement';
export type AccountPdfPeriodMode = 'month' | 'ytd';

type BuildAccountPdfUrlInput = {
  accountId: string;
  documentType: AccountPdfDocumentType;
  periodMode: AccountPdfPeriodMode;
  year?: number;
  month?: number;
};

export const buildAccountPdfUrl = ({
  accountId,
  documentType,
  periodMode,
  year,
  month,
}: BuildAccountPdfUrlInput) => {
  const encodedAccountId = encodeURIComponent(accountId);
  const path =
    documentType === 'transaction-ledger'
      ? `/api/finances/accounts/${encodedAccountId}/transaction-ledger.pdf`
      : `/api/finances/accounts/${encodedAccountId}/statement.pdf`;

  const params = new URLSearchParams({
    periodMode,
  });

  if (periodMode === 'month') {
    if (year !== undefined) {
      params.set('year', String(year));
    }
    if (month !== undefined) {
      params.set('month', String(month));
    }
  }

  return `${path}?${params.toString()}`;
};
