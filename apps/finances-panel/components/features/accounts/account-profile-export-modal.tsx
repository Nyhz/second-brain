'use client';

import { useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import {
  type AccountPdfDocumentType,
  type AccountPdfPeriodMode,
  buildAccountPdfUrl,
} from '../../../lib/account-pdf';
import { Button } from '../../ui/button';
import { Modal } from '../../ui/modal';

const DOCUMENT_OPTIONS: Array<{
  value: AccountPdfDocumentType;
  label: string;
  description: string;
}> = [
  {
    value: 'transaction-ledger',
    label: 'Transaction Ledger',
    description: 'Detailed account transactions for the selected period.',
  },
  {
    value: 'statement',
    label: 'Statement',
    description: 'Summary-first account statement with balances and activity totals.',
  },
];

const PERIOD_MODE_OPTIONS: Array<{
  value: AccountPdfPeriodMode;
  label: string;
}> = [
  { value: 'month', label: 'Month / Year' },
  { value: 'ytd', label: 'Current Year to Date' },
];

const MONTH_OPTIONS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const now = new Date();
const defaultMonth = now.getUTCMonth() + 1;
const defaultYear = now.getUTCFullYear();
const yearOptions = Array.from({ length: 8 }, (_, index) => defaultYear - index);

export function AccountProfileExportModal({
  accountId,
}: {
  accountId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [documentType, setDocumentType] =
    useState<AccountPdfDocumentType>('transaction-ledger');
  const [periodMode, setPeriodMode] = useState<AccountPdfPeriodMode>('month');
  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);

  const downloadUrl = useMemo(
    () =>
      buildAccountPdfUrl({
        accountId,
        documentType,
        periodMode,
        year,
        month,
      }),
    [accountId, documentType, month, periodMode, year],
  );

  const selectedDocument = DOCUMENT_OPTIONS.find(
    (option) => option.value === documentType,
  );

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <FileDown className="h-4 w-4" aria-hidden="true" />
        Export PDF
      </Button>

      {isOpen ? (
        <Modal
          open={isOpen}
          title="Export Account PDF"
          onClose={() => setIsOpen(false)}
          footer={
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                PDFs are generated for this account only.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    window.location.assign(downloadUrl);
                    setIsOpen(false);
                  }}
                >
                  Download PDF
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-5">
            <div className="grid gap-1.5">
              <label
                className="text-sm font-medium"
                htmlFor="account-pdf-document-type"
              >
                Document
              </label>
              <select
                id="account-pdf-document-type"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={documentType}
                onChange={(event) =>
                  setDocumentType(event.target.value as AccountPdfDocumentType)
                }
              >
                {DOCUMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {selectedDocument?.description}
              </p>
            </div>

            <div className="grid gap-1.5">
              <label
                className="text-sm font-medium"
                htmlFor="account-pdf-period-mode"
              >
                Period
              </label>
              <select
                id="account-pdf-period-mode"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={periodMode}
                onChange={(event) =>
                  setPeriodMode(event.target.value as AccountPdfPeriodMode)
                }
              >
                {PERIOD_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {periodMode === 'month' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor="account-pdf-month">
                    Month
                  </label>
                  <select
                    id="account-pdf-month"
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={month}
                    onChange={(event) => setMonth(Number(event.target.value))}
                  >
                    {MONTH_OPTIONS.map((label, index) => (
                      <option key={label} value={index + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor="account-pdf-year">
                    Year
                  </label>
                  <select
                    id="account-pdf-year"
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={year}
                    onChange={(event) => setYear(Number(event.target.value))}
                  >
                    {yearOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                Generates from January 1 of the current year through today.
              </div>
            )}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
