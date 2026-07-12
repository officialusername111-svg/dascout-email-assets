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

test('unsafe fontFamily and brandColor fall back to safe defaults', () => {
  const model = {
    ...baseModel,
    fontFamily: '";</style><img src=x onerror=alert(1)>',
    brandColor: 'red" onmouseover="x'
  };
  const { html } = renderEmail(model, noImages);
  assert.ok(!html.includes('onerror'));
  assert.ok(!html.includes('onmouseover'));
  assert.ok(html.includes('Arial, Helvetica, sans-serif'));
  assert.ok(html.includes('#1a73e8'));
});

test('non-http(s)/mailto CTA urls are neutralized', () => {
  const { html } = renderEmail({ ...baseModel, ctaUrl: 'javascript:alert(1)' }, noImages);
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('href="#"'));
});

const fullModel = {
  ...baseModel,
  bgMode: '3',
  bgDirection: 'vertical',
  bgColor1: '#0a0a0a',
  bgColor2: '#1c1108',
  bgColor3: '#3a2413',
  headingColor: '#d4a86a',
  textColor: '#e8e0d5',
  headlineSize: '30',
  bodySize: '16',
  footerSize: '11',
  showHeaderLogo: true,
  showFooterLogo: true
};

test('3-color gradient renders with first-color bgcolor fallback', () => {
  const { html } = renderEmail(fullModel, noImages);
  assert.ok(html.includes('linear-gradient(180deg,#0a0a0a,#1c1108,#3a2413)'));
  assert.ok(html.includes('bgcolor="#0a0a0a"'));
  assert.ok(html.includes('background-color:#0a0a0a'));
});

test('solid mode emits no gradient', () => {
  const { html } = renderEmail({ ...fullModel, bgMode: '1' }, noImages);
  assert.ok(!html.includes('linear-gradient'));
  assert.ok(html.includes('background-color:#0a0a0a'));
});

test('2-color mode uses two stops; directions map to angles', () => {
  const two = renderEmail({ ...fullModel, bgMode: '2' }, noImages).html;
  assert.ok(two.includes('linear-gradient(180deg,#0a0a0a,#1c1108)'));
  const h = renderEmail({ ...fullModel, bgDirection: 'horizontal' }, noImages).html;
  assert.ok(h.includes('linear-gradient(90deg'));
  const d = renderEmail({ ...fullModel, bgDirection: 'diagonal' }, noImages).html;
  assert.ok(d.includes('linear-gradient(135deg'));
});

test('invalid background colors fall back safely', () => {
  const { html } = renderEmail(
    { ...fullModel, bgMode: '2', bgColor1: 'evil"><script>', bgColor2: 'nope' },
    noImages
  );
  assert.ok(!html.includes('script'));
  assert.ok(html.includes('background-color:#ffffff'));
});

test('heading and text colors apply; invalid values fall back', () => {
  const { html } = renderEmail(fullModel, noImages);
  assert.ok(html.includes('color:#d4a86a'));
  assert.ok(html.includes('color:#e8e0d5'));
  const fb = renderEmail({ ...fullModel, headingColor: 'x', textColor: 'y' }, noImages).html;
  assert.ok(fb.includes('color:#222222'));
  assert.ok(fb.includes('color:#444444'));
});

test('font sizes apply and clamp to their ranges', () => {
  const { html } = renderEmail(fullModel, noImages);
  assert.ok(html.includes('font-size:30px'));
  assert.ok(html.includes('font-size:16px'));
  assert.ok(html.includes('font-size:11px'));
  const clamped = renderEmail(
    { ...fullModel, headlineSize: '400', bodySize: 'abc', footerSize: '1' },
    noImages
  ).html;
  assert.ok(clamped.includes('font-size:40px'));
  assert.ok(clamped.includes('font-size:15px'));
  assert.ok(clamped.includes('font-size:10px'));
});

test('header and footer logos render when provided; toggles hide them', () => {
  const imgs = { logo: 'cid:logo', content: null, footerLogo: 'cid:footerlogo' };
  const shown = renderEmail(fullModel, imgs).html;
  assert.ok(shown.includes('src="cid:logo"'));
  assert.ok(shown.includes('src="cid:footerlogo"'));
  const hidden = renderEmail(
    { ...fullModel, showHeaderLogo: false, showFooterLogo: false },
    imgs
  ).html;
  assert.ok(!hidden.includes('src="cid:logo"'));
  assert.ok(!hidden.includes('src="cid:footerlogo"'));
});

test('legacy model without new fields keeps prior defaults', () => {
  const { html } = renderEmail(baseModel, noImages);
  assert.ok(html.includes('background-color:#ffffff'));
  assert.ok(html.includes('font-size:26px'));
  assert.ok(html.includes('color:#222222'));
  assert.ok(!html.includes('linear-gradient'));
});
