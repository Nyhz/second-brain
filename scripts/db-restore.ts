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
const force = args.includes('--force');
const backupArg = args.find((arg) => !arg.startsWith('--')) ?? 'latest';

if (!force) {
  console.error(
    'Refusing to restore without --force. This operation drops and recreates the target database.',
  );
  process.exit(1);
}

const env = loadDotEnv();
const targetDb = env.POSTGRES_DB;
if (!targetDb) {
  throw new Error('POSTGRES_DB missing from .env');
}

const backupPath = await resolveBackupPath(backupArg);
await assertBackupExists(backupPath);

const maintenanceUrl = postgresUrlForDb(env, 'postgres');
const restoreUrl = postgresUrlForDb(env, targetDb);

console.log(`Restoring ${targetDb} from ${backupPath}`);
console.log('Recommended precondition: stop write traffic before running restore.');

await runCommand(
  [
    ...workerComposePrefix(),
    'psql',
    maintenanceUrl,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    terminateConnectionsSql(targetDb),
  ],
  'terminate restore database connections',
);

await runCommand(
  [
    ...workerComposePrefix(),
    'psql',
    maintenanceUrl,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    dropDatabaseSql(targetDb),
  ],
  'drop restore database',
);

await runCommand(
  [
    ...workerComposePrefix(),
    'psql',
    maintenanceUrl,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    createDatabaseSql(targetDb),
  ],
  'create restore database',
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
  'pg_restore',
);

console.log(`Restore completed for ${targetDb} from ${backupPath}`);
