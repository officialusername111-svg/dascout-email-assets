import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecipients } from '../js/recipients.js';

test('empty input yields empty lists', () => {
  assert.deepEqual(parseRecipients(''), { valid: [], invalid: [] });
  assert.deepEqual(parseRecipients('  \n\n '), { valid: [], invalid: [] });
});

test('splits on newlines, commas, and semicolons', () => {
  const { valid, invalid } = parseRecipients('a@x.com\nb@x.com, c@x.com; d@x.com');
  assert.deepEqual(valid, ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']);
  assert.deepEqual(invalid, []);
});

test('flags invalid addresses, keeps valid ones', () => {
  const { valid, invalid } = parseRecipients('good@x.com\nnot-an-email\n@nouser.com\nno@tld');
  assert.deepEqual(valid, ['good@x.com']);
  assert.deepEqual(invalid, ['not-an-email', '@nouser.com', 'no@tld']);
});

test('dedupes case-insensitively, keeping first casing', () => {
  const { valid } = parseRecipients('Alice@X.com\nalice@x.com\nALICE@X.COM');
  assert.deepEqual(valid, ['Alice@X.com']);
});

test('trims whitespace around addresses', () => {
  const { valid } = parseRecipients('  a@x.com  \n\t b@x.com ');
  assert.deepEqual(valid, ['a@x.com', 'b@x.com']);
});
