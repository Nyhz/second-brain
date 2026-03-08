import {
  assertBackupExists,
  createDatabaseSql,
  dropDatabaseSql,
  loadDotEnv,
  postgresUrlForDb,
  resolveBackupPath,
  runCommand,
  terminateConnectionsSql,
  workerComposePrefix,
} from './db-backup-shared';

const args = Bun.argv.slice(2);
const backupArg = args.find((arg) => !arg.startsWith('--')) ?? 'latest';

const env = loadDotEnv();
const backupPath = await resolveBackupPath(backupArg);
await assertBackupExists(backupPath);

const tempDb = `restore_verify_${Date.now()}`;
const maintenanceUrl = postgresUrlForDb(env, 'postgres');
const restoreUrl = postgresUrlForDb(env, tempDb);

console.log(`Verifying restore for ${backupPath} using temp database ${tempDb}`);

try {
  await runCommand(
    [
      ...workerComposePrefix(),
      'psql',
      maintenanceUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      terminateConnectionsSql(tempDb),
    ],
    'terminate temp restore database connections',
  );

  await runCommand(
    [
      ...workerComposePrefix(),
      'psql',
      maintenanceUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      dropDatabaseSql(tempDb),
    ],
    'drop temp restore database before verify',
  );

  await runCommand(
    [
      ...workerComposePrefix(),
      'psql',
      maintenanceUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      createDatabaseSql(tempDb),
    ],
    'create temp restore database',
  );

  await runCommand(
    [
      ...workerComposePrefix(),
      'pg_restore',
      '--clean',
      '--if-exists',
      '--no-owner',
      '--dbname',
      restoreUrl,
      backupPath,
    ],
    'pg_restore verify restore',
  );

  const verificationSql = `
    select
      to_regnamespace('core') is not null as has_core_schema,
      to_regnamespace('finances') is not null as has_finances_schema,
      (select count(*) from finances.accounts) as account_count,
      (select count(*) from finances.assets) as asset_count,
      (select count(*) from finances.asset_transactions) as asset_transaction_count,
      (select count(*) from core.backup_runs) as backup_run_count;
  `;

  const { stdout } = await runCommand(
    [
      ...workerComposePrefix(),
      'psql',
      restoreUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '-P',
      'format=unaligned',
      '-P',
      'tuples_only=on',
      '-c',
      verificationSql,
    ],
    'query restored database',
  );

  console.log('Restore verification summary:');
  console.log(stdout.trim());
  console.log(`Restore verification succeeded for ${backupPath}`);
} finally {
  await runCommand(
    [
      ...workerComposePrefix(),
      'psql',
      maintenanceUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      terminateConnectionsSql(tempDb),
    ],
    'terminate temp restore database connections for cleanup',
  );

  await runCommand(
    [
      ...workerComposePrefix(),
      'psql',
      maintenanceUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      dropDatabaseSql(tempDb),
    ],
    'drop temp restore database',
  );
}
