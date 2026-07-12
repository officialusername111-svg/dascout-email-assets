import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeBase64, encodeBase64Url, buildMimeMessage } from '../js/mime.js';

test('encodeBase64 handles ASCII and UTF-8', () => {
  assert.equal(encodeBase64('hello'), 'aGVsbG8=');
  assert.equal(encodeBase64('héllo ✓'), Buffer.from('héllo ✓', 'utf8').toString('base64'));
});

test('encodeBase64Url is url-safe and unpadded', () => {
  const out = encodeBase64Url('subjects?>>');
  assert.ok(!out.includes('+'));
  assert.ok(!out.includes('/'));
  assert.ok(!out.endsWith('='));
  assert.equal(Buffer.from(out, 'base64url').toString('utf8'), 'subjects?>>');
});

const args = {
  from: 'me@x.com',
  to: 'you@y.com',
  subject: 'Hey ✓',
  html: '<p>Hi</p>',
  text: 'Hi',
  attachments: [{ cid: 'logo', mimeType: 'image/png', base64: 'aWFtYXBuZw==' }]
};

test('message has core headers and CRLF line endings', () => {
  const msg = buildMimeMessage(args);
  assert.ok(msg.startsWith('From: me@x.com\r\n'));
  assert.ok(msg.includes('To: you@y.com\r\n'));
  assert.ok(msg.includes('MIME-Version: 1.0\r\n'));
  assert.ok(!/[^\r]\n/.test(msg), 'every LF must be preceded by CR');
});

test('subject is RFC 2047 UTF-8 encoded', () => {
  const msg = buildMimeMessage(args);
  const expected = `Subject: =?UTF-8?B?${Buffer.from('Hey ✓', 'utf8').toString('base64')}?=`;
  assert.ok(msg.includes(expected));
});

test('multipart structure: related wraps alternative wraps text+html', () => {
  const msg = buildMimeMessage(args);
  assert.ok(msg.includes('Content-Type: multipart/related; boundary="rel-b0undary"'));
  assert.ok(msg.includes('Content-Type: multipart/alternative; boundary="alt-b0undary"'));
  assert.ok(msg.includes('Content-Type: text/plain; charset=UTF-8'));
  assert.ok(msg.includes('Content-Type: text/html; charset=UTF-8'));
  assert.ok(msg.indexOf('text/plain') < msg.indexOf('text/html'), 'text part before html part');
});

test('attachment becomes inline part with Content-ID', () => {
  const msg = buildMimeMessage(args);
  assert.ok(msg.includes('Content-Type: image/png'));
  assert.ok(msg.includes('Content-ID: <logo>'));
  assert.ok(msg.includes('Content-Disposition: inline'));
  assert.ok(msg.includes('aWFtYXBuZw=='));
});

test('no attachments still yields valid related/alternative structure', () => {
  const msg = buildMimeMessage({ ...args, attachments: [] });
  assert.ok(msg.includes('multipart/alternative'));
  assert.ok(msg.trimEnd().endsWith('--rel-b0undary--'));
});

test('CRLF in from/to cannot inject additional headers', () => {
  const msg = buildMimeMessage({ ...args, to: 'evil@x.com\r\nBcc: victim@y.com' });
  assert.ok(!/(^|\r\n)Bcc:/.test(msg));
  assert.ok(msg.includes('To: evil@x.com Bcc: victim@y.com'));
});
