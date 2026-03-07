'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '../../ui/button';

export function TaxYearControls({ initialYear }: { initialYear: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [year, setYear] = useState(String(initialYear));
  const [isPending, startTransition] = useTransition();

  const applyYear = () => {
    const parsed = Number(year);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('year', String(parsed));
    startTransition(() => {
      router.replace(`/taxes?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="tax-year">
          Tax Year
        </label>
        <input
          id="tax-year"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          type="number"
          value={year}
          onChange={(event) => setYear(event.target.value)}
          min={2000}
          max={2100}
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={applyYear}
        disabled={isPending}
      >
        {isPending ? 'Loading...' : 'Refresh'}
      </Button>
    </>
  );
}
