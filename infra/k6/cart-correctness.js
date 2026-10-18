// Optional synthetic mutation check; never runs as part of the read-load demo.
import http from 'k6/http';
import { sleep } from 'k6';
import crypto from 'k6/crypto';
if (__ENV.ALLOW_SYNTHETIC_WRITES !== 'yes') throw new Error('Set ALLOW_SYNTHETIC_WRITES=yes for an unused local synthetic table');
const base = (__ENV.TARGET_URL || 'http://127.0.0.1:18080').replace(/\/$/, '');
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(base)) throw new Error('Correctness workload permits loopback only');
if (!__ENV.TABLE_CODE) throw new Error('Create an unused synthetic table in the owner screen and set TABLE_CODE');
export const options = { vus: 1, iterations: 1 };
const uuid = () => {
  const bytes = new Uint8Array(crypto.randomBytes(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
function call(path, method = 'GET', body, token) {
  const response = http.request(method, base + path, body ? JSON.stringify(body) : null, { headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  if (response.status < 200 || response.status >= 300) throw new Error(`${method} ${path}: ${response.status}`);
  return response.json();
}
export default function () {
  const a = call('/v1/table-sessions/join','POST',{tableCode:__ENV.TABLE_CODE,name:'Synthetic A',joinKey:uuid()});
  const b = call('/v1/table-sessions/join','POST',{tableCode:__ENV.TABLE_CODE,name:'Synthetic B',joinKey:uuid()});
  if (a.table.session.id !== b.table.session.id) throw new Error('Join created separate seatings');
  const path = `/v1/sessions/${a.table.session.id}`;
  let cart = call(path+'/cart','GET',null,a.guestToken);
  cart = call(path+'/cart/items/paneer','PUT',{quantity:1,expectedRevision:cart.revision},a.guestToken);
  const body = {operationKey:uuid(),expectedRevision:cart.revision};
  let checkout = call(path+'/checkouts','POST',body,a.guestToken);
  const replay = call(path+'/checkouts','POST',body,b.guestToken);
  if (replay.id !== checkout.id) throw new Error('Replay changed checkout identity');
  for (let i=0;i<30 && !checkout.orderId;i++) {sleep(1);checkout=call(`/v1/checkouts/${checkout.id}`,'GET',null,a.guestToken);}
  if (checkout.status !== 'COMMITTED' || !checkout.orderId) throw new Error('Order delivery incomplete');
  console.log(JSON.stringify({checkoutId:checkout.id,orderId:checkout.orderId,simulated:true}));
}
