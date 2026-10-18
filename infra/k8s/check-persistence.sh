#!/usr/bin/env bash
set -euo pipefail
: "${EVIDENCE_DIR:?Set EVIDENCE_DIR to a local evidence directory}"
mkdir -p "$EVIDENCE_DIR"
k=(kubectl --context=tablesync -n tablesync)
if [[ ! -s "$EVIDENCE_DIR/persistence.json" ]]; then
  # Synthetic application flow, using the public gateway inside this local cluster.
  "${k[@]}" exec -i deployment/api-gateway -- node --input-type=module > "$EVIDENCE_DIR/persistence.json" <<'JS'
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:8080';
async function call(path, method = 'GET', body, token) {
  const response = await fetch(base + path, { method, headers: {
    ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
  assert.ok(response.ok, `${method} ${path}: ${response.status}`);
  return response.json();
}
const joined = await call('/v1/table-sessions/join', 'POST', { tableCode: 'SAGE-12', name: 'Kubernetes persistence check', joinKey: crypto.randomUUID() });
const id = joined.table.session.id, token = joined.guestToken;
const cart = await call(`/v1/sessions/${id}/cart`, 'GET', undefined, token);
assert.equal(cart.state, 'EDITING', 'Use previous persistence.json to verify an already committed cart');
const updated = await call(`/v1/sessions/${id}/cart/items/paneer`, 'PUT', { quantity: 1, expectedRevision: cart.revision }, token);
let checkout = await call(`/v1/sessions/${id}/checkouts`, 'POST', { operationKey: crypto.randomUUID(), expectedRevision: updated.revision }, token);
for (let i = 0; i < 30 && !checkout.orderId; i++) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  checkout = await call(`/v1/checkouts/${checkout.id}`, 'GET', undefined, token);
}
assert.equal(checkout.status, 'COMMITTED'); assert.ok(checkout.orderId);
console.log(JSON.stringify({ checkoutId: checkout.id, orderId: checkout.orderId, checkedAt: new Date().toISOString(), simulated: true }));
JS
fi
checkout_id=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["checkoutId"])' "$EVIDENCE_DIR/persistence.json")
order_id=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["orderId"])' "$EVIDENCE_DIR/persistence.json")
"${k[@]}" rollout restart deployment/order
"${k[@]}" rollout status deployment/order --timeout=180s
"${k[@]}" exec deployment/order -- node --input-type=module -e '
  import assert from "node:assert/strict";
  const response = await fetch(`http://127.0.0.1:8082/v1/checkouts/${process.argv[1]}`, {headers:{authorization:`Bearer ${process.env.INTERNAL_API_SECRET}`}});
  assert.equal(response.status, 200);
  const checkout = await response.json(); assert.equal(checkout.status,"COMMITTED"); assert.equal(checkout.orderId,process.argv[2]);
  console.log(JSON.stringify({checkoutId:checkout.id,orderId:checkout.orderId,afterRestart:true,checkedAt:new Date().toISOString()}));
' "$checkout_id" "$order_id" | tee "$EVIDENCE_DIR/persistence-after-restart.json"
