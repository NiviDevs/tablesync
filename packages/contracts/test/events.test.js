import test from 'node:test'; import assert from 'node:assert/strict';
test('event envelope carries a version and correlation id',()=>{const event={id:'evt_1',version:1,occurredAt:new Date().toISOString(),correlationId:'corr_1',data:{}};assert.equal(event.version,1);assert.ok(event.correlationId)});
