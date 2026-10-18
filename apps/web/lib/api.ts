import type { ApiError } from '../../../packages/contracts/src/http';
export type { CartView, CheckoutView, OrderView, OrderStatus, TableView } from '../../../packages/contracts/src/http';
export type { MenuItem, RestaurantAnalytics } from '../../../packages/contracts/src/http';
export type Menu = { items: import('../../../packages/contracts/src/http').MenuItem[] };

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; token?: string; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`/api/backend${path}`, { method: options.method, headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) {
    const error = (data as ApiError).error;
    throw new ApiFailure(response.status, error?.code ?? 'REQUEST_FAILED', error?.message ?? 'Request failed');
  }
  return data as T;
}
export const money = (minor: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);
