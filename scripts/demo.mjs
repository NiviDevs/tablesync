// Start the local demonstration with Docker; no host dependencies or accounts.
import { spawnSync } from 'node:child_process';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const command = process.argv[2] ?? 'start';
if (!['start', 'stop', 'logs', 'setup', 'seed'].includes(command)) throw new Error('Use npm run demo, demo:stop, demo:logs, demo:setup or demo:seed');
const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const historyEnd = process.argv[3] ?? today;
if (command === 'seed' && (process.argv.length > 4 || !/^\d{4}-\d{2}-\d{2}$/.test(historyEnd) ||
  !Number.isFinite(Date.parse(historyEnd)) || new Date(historyEnd).toISOString().slice(0, 10) !== historyEnd ||
  historyEnd < '2001-01-01' || historyEnd > today)) throw new Error('Use npm run demo:seed -- [YYYY-MM-DD], with a valid end date no later than today');
const local = join(root, '.local');
mkdirSync(local, { recursive: true, mode: 0o700 });
const envPath = join(root, '.env');
let settings = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
function ensureSetting(key, value) {
  const pattern = new RegExp(`^${key}=(.*)$`, 'm');
  const existing = settings.match(pattern);
  if (existing && existing[1].trim() && !['""', "''"].includes(existing[1].trim())) return;
  const next = `${key}=${value()}`;
  settings = existing ? settings.replace(pattern, () => next) : `${settings}\n${next}\n`;
}
ensureSetting('INTERNAL_API_SECRET', () => randomBytes(32).toString('hex'));
ensureSetting('GUEST_TOKEN_SECRET', () => randomBytes(32).toString('hex'));
ensureSetting('DEMO_JWT_PRIVATE_JWK', () => JSON.stringify(generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' })));
writeFileSync(envPath, settings, { mode: 0o600 });
if (command === 'setup') { console.log('Local demo credentials are ready in the ignored .env file.'); process.exit(0); }

function run(args, { capture = false, output, input } = {}) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8',
    input, stdio: output !== undefined ? ['ignore', output, 'inherit'] : capture ? ['ignore', 'pipe', 'pipe'] : [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'] });
  if (result.status !== 0) throw new Error(capture ? result.stderr?.trim() || result.error?.message || 'Docker command failed' : `Docker ${args[0]} failed. Run npm run demo:logs for details.`);
  return result.stdout?.trim() ?? '';
}
const access = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' });
if (access.status !== 0) {
  if (process.platform === 'linux' && access.stderr?.includes('permission denied') && !process.env.TABLESYNC_DOCKER_GROUP_READY) {
    const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
    const refreshed = spawnSync('newgrp', ['docker'], { input: `exec env TABLESYNC_DOCKER_GROUP_READY=1 ${quote(process.execPath)} ${quote(fileURLToPath(import.meta.url))} ${quote(command)}${command === 'seed' ? ` ${quote(historyEnd)}` : ''}\n`, stdio: ['pipe', 'inherit', 'inherit'] });
    process.exit(refreshed.status ?? 1);
  }
  console.error('Start Docker Desktop or Docker Engine, then run this command again.');
  process.exit(1);
}
try {
  const marker = join(local, 'compose-project');
  let project = process.env.TABLESYNC_COMPOSE_PROJECT || (existsSync(marker) ? readFileSync(marker, 'utf8').trim() : '');
  if (!project) {
    const running = run(['ps', '--filter', 'label=com.docker.compose.service=postgres', '--format', '{{.Label "com.docker.compose.project"}}'], { capture: true }).split('\n');
    project = running.includes('tablesync-role-a-f0') ? 'tablesync-role-a-f0' : running.find(name => /^tablesync[-_]/.test(name)) || 'tablesync-demo';
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(project)) throw new Error('Invalid TABLESYNC_COMPOSE_PROJECT');
  writeFileSync(marker, project);
  const compose = ['compose', '-p', project, '-f', 'docker-compose.yml', '-f', 'docker-compose.demo.yml'];
  console.log(`TableSync local demo (${project})`);
  if (command === 'stop') { run([...compose, 'stop']); console.log('Stopped. Orders and database volumes are preserved.'); process.exit(0); }
  if (command === 'logs') { run([...compose, 'logs', '--tail=80', '-f']); process.exit(0); }
  if (command === 'seed') {
    console.log(`Adding 365 days of simulated history ending ${historyEnd}. Existing records are preserved.`);
    run([...compose, 'exec', '-T', 'postgres', 'psql', '-X', '-U', 'tablesync', '-d', 'tablesync',
      '-v', 'ON_ERROR_STOP=1', '-v', `history_end=${historyEnd}`], { input: readFileSync(join(root, 'infra/postgres/demo-history.sql'), 'utf8') });
    console.log('Simulated history is ready. Refresh the owner dashboard. Repeating this command does not duplicate records.');
    process.exit(0);
  }
  console.log('Building the application. The first start downloads Docker images and may take several minutes.');
  run([...compose, 'build']);
  run([...compose, 'up', '-d', '--wait', '--wait-timeout', '180', 'postgres', 'redis', 'rabbitmq']);
  const sql = value => run([...compose, 'exec', '-T', 'postgres', 'psql', '-U', 'tablesync', '-d', 'tablesync', '-Atc', value], { capture: true });
  const ledger = sql("SELECT to_regclass('public.schema_migrations') IS NOT NULL");
  const applied = ledger === 't' ? Number(sql('SELECT count(*) FROM schema_migrations')) : 0;
  const existing = sql("SELECT to_regclass('public.table_sessions') IS NOT NULL") === 't';
  const migrate = [...compose, 'run', '--rm', '--no-deps'];
  if (!applied && existing) {
    const directory = join(local, 'backups');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const backup = join(directory, `before-migrations-${Date.now()}.sql`);
    const descriptor = openSync(backup, 'wx', 0o600);
    try { run([...compose, 'exec', '-T', 'postgres', 'pg_dump', '-U', 'tablesync', '--no-owner', '--no-acl', 'tablesync'], { output: descriptor }); }
    finally { closeSync(descriptor); }
    if (!statSync(backup).size) throw new Error('Database backup is empty; startup stopped');
    console.log('Saved an existing-database backup in .local/backups before migration.');
    run([...migrate, '-e', 'BASELINE_BACKUP_CONFIRMED=yes', 'session', 'node', 'infra/postgres/migrate.mjs', '--baseline']);
  } else run([...migrate, 'session', 'node', 'infra/postgres/migrate.mjs']);
  run([...compose, 'up', '-d', '--wait', '--wait-timeout', '180']);
  console.log('\nReady: http://localhost:3000\nGuest: http://localhost:3000/app?table=SAGE-12\nOwner / kitchen / DevOps sign-in: http://localhost:3000/restaurant/sign-in\nStop: npm run demo:stop (keeps your orders)');
} catch (error) { console.error(`\nStartup stopped: ${error.message}`); process.exitCode = 1; }
