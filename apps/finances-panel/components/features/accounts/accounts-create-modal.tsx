'use client';

import type { Account } from '@second-brain/types';
import { useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/errors';
import { Button } from '@second-brain/ui';
import { Modal } from '../../ui/modal';

type CreatableAccountType =
  | 'savings'
  | 'brokerage'
  | 'crypto_exchange'
  | 'investment_platform'
  | 'retirement_plan';

export function AccountsCreateModal({
  onClose,
  onCreated,
  onError,
  open,
}: {
  onClose: () => void;
  onCreated: (createdName: string) => Promise<void>;
  onError: (message: string | null) => void;
  open: boolean;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [accountType, setAccountType] =
    useState<CreatableAccountType>('brokerage');
  const [currentCash, setCurrentCash] = useState('0');

  const createAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = name.trim();
    if (!normalizedName) {
      onError('Account name is required.');
      return;
    }

    let openingBalanceEur = 0;
    if (accountType === 'savings') {
      const parsedCash = Number(currentCash || '0');
      if (!Number.isFinite(parsedCash) || parsedCash < 0) {
        onError('Current Cash (EUR) must be a non-negative number.');
        return;
      }
      openingBalanceEur = parsedCash;
    }

    setIsCreating(true);
    try {
      const created = await apiRequest<Account>('/finances/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: normalizedName,
          currency: 'EUR',
          baseCurrency: 'EUR',
          openingBalanceEur,
          accountType,
        }),
      });

      setName('');
      setAccountType('brokerage');
      setCurrentCash('0');
      onError(null);
      await onCreated(created.name);
      onClose();
    } catch (error) {
      onError(getApiErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Create Account"
      onClose={() => {
        if (!isCreating) {
          onClose();
        }
      }}
    >
      <form className="grid gap-4" onSubmit={createAccount}>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="account-name">
            Name
          </label>
          <input
            id="account-name"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>

        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="account-type">
            Type
          </label>
          <select
            id="account-type"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={accountType}
            onChange={(event) =>
              setAccountType(event.target.value as CreatableAccountType)
            }
          >
            <option value="savings">Savings</option>
            <option value="brokerage">Broker</option>
            <option value="crypto_exchange">Exchange</option>
            <option value="investment_platform">Investment Fund Account</option>
            <option value="retirement_plan">Retirement Plan</option>
          </select>
        </div>

        {accountType === 'savings' ? (
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="account-cash">
              Current Cash (EUR)
            </label>
            <input
              id="account-cash"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              type="number"
              step="0.01"
              min="0"
              value={currentCash}
              onChange={(event) => setCurrentCash(event.target.value)}
              required
            />
          </div>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          disabled={isCreating}
          fullWidth
        >
          {isCreating ? 'Creating...' : 'Create Account'}
        </Button>
      </form>
    </Modal>
  );
}
