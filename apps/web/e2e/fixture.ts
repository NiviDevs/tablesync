import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
export function fixture() {
  return JSON.parse(readFileSync(process.env.E2E_STATE_PATH!, 'utf8')) as {
    staffToken: string; guestSecret: string; controlToken: string; origin: string;
    databaseUrl: string; gateway: string; issuer: string;
  };
}
export async function query(sql: string, values: unknown[] = []) {
  const { Pool } = createRequire(`${process.cwd()}/package.json`)('pg');
  const pool = new Pool({ connectionString: fixture().databaseUrl });
  try { return (await pool.query(sql, values)).rows; }
  finally { await pool.end(); }
}
export async function control(action: string) {
  const response = await fetch(`${fixture().issuer}/${action}`, { method: 'POST', headers: { authorization: `Bearer ${fixture().controlToken}` } });
  if (!response.ok) throw new Error(`Test control failed: ${action}`);
}
