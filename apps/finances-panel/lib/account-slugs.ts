import type { Account } from '@second-brain/types';

const DEFAULT_ACCOUNT_SLUG = 'account';

const normalizeDate = (value: string) => {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const stripDiacritics = (value: string) =>
  value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

const toBaseAccountSlug = (name: string) => {
  const normalized = stripDiacritics(name.trim().toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || DEFAULT_ACCOUNT_SLUG;
};

const orderedAccounts = (accounts: Account[]) =>
  [...accounts].sort((left, right) => {
    const nameCompare = left.name.localeCompare(right.name, undefined, {
      sensitivity: 'base',
    });
    if (nameCompare !== 0) return nameCompare;

    const createdCompare =
      normalizeDate(left.createdAt) - normalizeDate(right.createdAt);
    if (createdCompare !== 0) return createdCompare;

    return left.id.localeCompare(right.id);
  });

export const buildAccountSlugMaps = (accounts: Account[]) => {
  const slugsById = new Map<string, string>();
  const idsBySlug = new Map<string, string>();
  const usedSlugs = new Set<string>();

  for (const account of orderedAccounts(accounts)) {
    const baseSlug = toBaseAccountSlug(account.name);
    let slug = baseSlug;
    let duplicateIndex = 2;

    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${duplicateIndex}`;
      duplicateIndex += 1;
    }

    usedSlugs.add(slug);
    slugsById.set(account.id, slug);
    idsBySlug.set(slug, account.id);
  }

  return {
    slugsById,
    idsBySlug,
  } as const;
};

export const getAccountSlugById = (accountId: string, accounts: Account[]) => {
  const { slugsById } = buildAccountSlugMaps(accounts);
  return slugsById.get(accountId) ?? null;
};

export const resolveAccountIdFromPathSegment = (
  segment: string,
  accounts: Account[],
) => {
  const normalizedSegment = decodeURIComponent(segment).trim();
  if (!normalizedSegment) {
    return null;
  }

  const directMatch = accounts.find(
    (account) => account.id === normalizedSegment,
  );
  if (directMatch) {
    return directMatch.id;
  }

  const { idsBySlug } = buildAccountSlugMaps(accounts);
  const lowerSegment = normalizedSegment.toLowerCase();
  const bySlug = idsBySlug.get(lowerSegment);
  if (bySlug) {
    return bySlug;
  }

  const slugifiedSegment = toBaseAccountSlug(normalizedSegment);
  return idsBySlug.get(slugifiedSegment) ?? null;
};
