import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEmail, escapeHtml } from '../js/renderer.js';

const baseModel = {
  subject: 'July Sale',
  headline: 'Big Summer Sale',
  bodyText: 'First paragraph.\n\nSecond paragraph.',
  ctaText: 'Shop now',
  ctaUrl: 'https://example.com/sale',
  footerText: 'DaScout Inc · 123 Main St',
  brandColor: '#ff5500',
  align: 'center',
  fontFamily: 'Arial, Helvetica, sans-serif'
};
const noImages = { logo: null, content: null };

test('escapeHtml escapes &, <, >, "', () => {
  assert.equal(escapeHtml('<b>&"x"</b>'), '&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
});

test('user text is escaped in html output', () => {
  const model = { ...baseModel, headline: '<script>alert(1)</script>' };
  const { html } = renderEmail(model, noImages);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('body splits into one block per blank-line-separated paragraph', () => {
  const { html } = renderEmail(baseModel, noImages);
  assert.ok(html.includes('First paragraph.'));
  assert.ok(html.includes('Second paragraph.'));
  const count = (html.match(/class="para"/g) || []).length;
  assert.equal(count, 2);
});

test('image srcs appear when provided, blocks omitted when null', () => {
  const withImages = renderEmail(baseModel, { logo: 'cid:logo', content: 'cid:content' });
  assert.ok(withImages.html.includes('src="cid:logo"'));
  assert.ok(withImages.html.includes('src="cid:content"'));
  const without = renderEmail(baseModel, noImages);
  assert.ok(!without.html.includes('<img'));
});

test('CTA button renders with brand color and url; omitted when ctaText empty', () => {
  const { html } = renderEmail(baseModel, noImages);
  assert.ok(html.includes('https://example.com/sale'));
  assert.ok(html.includes('#ff5500'));
  const noCta = renderEmail({ ...baseModel, ctaText: '' }, noImages);
  assert.ok(!noCta.html.includes('https://example.com/sale'));
});

test('plain-text alternative contains headline, paragraphs, cta url, footer', () => {
  const { text } = renderEmail(baseModel, noImages);
  assert.ok(text.includes('Big Summer Sale'));
  assert.ok(text.includes('First paragraph.'));
  assert.ok(text.includes('Shop now: https://example.com/sale'));
  assert.ok(text.includes('DaScout Inc'));
});

test('alignment and font flow into inline styles', () => {
  const left = renderEmail({ ...baseModel, align: 'left' }, noImages);
  assert.ok(left.html.includes('text-align:left'));
  assert.ok(left.html.includes('Arial, Helvetica, sans-serif'));
});
