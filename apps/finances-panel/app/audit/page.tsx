import { AuditFeature } from '../../components/features/audit/audit-feature';
import { loadServerAuditData } from '../../lib/data/server-data';

const getSingleSearchParam = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const entityType = getSingleSearchParam(resolvedSearchParams.entityType);
  const entityId = getSingleSearchParam(resolvedSearchParams.entityId);
  const rows = (
    await loadServerAuditData(entityType, entityId, 100).catch(() => ({
      rows: [],
    }))
  ).rows;

  return <AuditFeature rows={rows} />;
}
