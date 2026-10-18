import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const value = process.env.TEST_DATABASE_URL;
if (!value || !/(?:^|_)test(?:_|$)/.test(decodeURIComponent(new URL(value).pathname.slice(1)))) {
  console.error('TEST_DATABASE_URL must name an explicitly disposable test database');
  process.exit(1);
}
const files = ['infra/postgres/test/migrations.test.mjs'];
for (const service of ['session', 'order', 'payment']) {
  const directory = `services/${service}/test`;
  for (const name of (await readdir(directory)).sort()) if (name.endsWith('.integration.test.js')) files.push(`${directory}/${name}`);
}
const child = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit', env: process.env });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });
