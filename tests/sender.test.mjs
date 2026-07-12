import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendCampaign } from '../js/sender.js';

const baseOpts = {
  getToken: async () => 'tok-123',
  from: 'me@x.com',
  subject: 'S',
  html: '<p>h</p>',
  text: 'h',
  attachments: [],
  delayMs: 0
};

function okResponse() {
  return { ok: true, status: 200, json: async () => ({ id: 'm1' }) };
}
function errResponse(status, message) {
  return { ok: false, status, json: async () => ({ error: { message } }) };
}

test('sends one message per recipient with auth header and raw body', async () => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init }); return okResponse(); };
  const { results, aborted } = await sendCampaign({
    ...baseOpts, recipients: ['a@x.com', 'b@x.com'], fetchFn
  });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.includes('/gmail/v1/users/me/messages/send'));
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok-123');
  assert.ok(JSON.parse(calls[0].init.body).raw.length > 0);
  assert.deepEqual(results.map(r => r.ok), [true, true]);
  assert.equal(aborted, false);
});

test('a failed recipient is recorded and the run continues', async () => {
  let n = 0;
  const fetchFn = async () => (++n === 1 ? errResponse(400, 'Invalid to header') : okResponse());
  const { results, aborted } = await sendCampaign({
    ...baseOpts, recipients: ['bad@x.com', 'good@x.com'], fetchFn
  });
  assert.equal(results[0].ok, false);
  assert.equal(results[0].error, 'Invalid to header');
  assert.equal(results[1].ok, true);
  assert.equal(aborted, false);
});

test('HTTP 429 aborts the run and reports remaining recipients', async () => {
  let n = 0;
  const fetchFn = async () => (++n === 2 ? errResponse(429, 'Rate limit exceeded') : okResponse());
  const { results, aborted, remaining } = await sendCampaign({
    ...baseOpts, recipients: ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'], fetchFn
  });
  assert.equal(aborted, true);
  assert.equal(results.length, 2);
  assert.deepEqual(remaining, ['c@x.com', 'd@x.com']);
});

test('network exception is recorded per recipient, run continues', async () => {
  let n = 0;
  const fetchFn = async () => { if (++n === 1) throw new Error('offline'); return okResponse(); };
  const { results } = await sendCampaign({ ...baseOpts, recipients: ['a@x.com', 'b@x.com'], fetchFn });
  assert.equal(results[0].ok, false);
  assert.equal(results[0].error, 'offline');
  assert.equal(results[1].ok, true);
});

test('getToken failure aborts the run with remaining recipients', async () => {
  let n = 0;
  const getToken = async () => { if (++n === 2) throw new Error('consent denied'); return 'tok'; };
  const fetchFn = async () => okResponse();
  const { results, aborted, remaining } = await sendCampaign({
    ...baseOpts, getToken, recipients: ['a@x.com', 'b@x.com', 'c@x.com'], fetchFn
  });
  assert.equal(aborted, true);
  assert.equal(results.length, 2);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.ok(results[1].error.includes('Sign-in required'));
  assert.deepEqual(remaining, ['c@x.com']);
});

test('onProgress fires after every recipient', async () => {
  const ticks = [];
  const fetchFn = async () => okResponse();
  await sendCampaign({
    ...baseOpts, recipients: ['a@x.com', 'b@x.com'], fetchFn,
    onProgress: (p) => ticks.push(`${p.done}/${p.total}`)
  });
  assert.deepEqual(ticks, ['1/2', '2/2']);
});
