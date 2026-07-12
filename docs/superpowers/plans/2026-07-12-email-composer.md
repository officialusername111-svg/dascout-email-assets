# DaScout Emailing — Static Gmail Marketing Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static single-page app (GitHub Pages-hostable) where a user signs in with Google, composes a marketing email via a structured form with live preview and inline images, and sends one copy per recipient through their own Gmail via the Gmail API.

**Architecture:** Vanilla ES modules, no framework, no build step. Pure logic (recipient parsing, HTML rendering, MIME building, send loop with injected fetch) lives in dependency-free modules tested with Node's built-in test runner; browser-only concerns (GIS auth, DOM wiring, FileReader) live in thin modules verified manually.

**Tech Stack:** HTML/CSS/vanilla JS (ES modules), Google Identity Services (GIS) token client, Gmail API `messages.send`, Node ≥18 built-in `node --test` for unit tests. Zero npm dependencies.

**Spec:** `docs/superpowers/specs/2026-07-12-email-composer-design.md`

## Global Constraints

- No build step: the repo root is the deployable site. No bundler, no transpiler.
- Zero npm dependencies (`package.json` exists only for `"type": "module"` and the test script).
- Pure modules (`js/recipients.js`, `js/renderer.js`, `js/mime.js`, `js/sender.js`) must not touch `document`, `window`, `localStorage`, or GIS — they must import cleanly in Node.
- All user-entered text is HTML-escaped before rendering.
- Email HTML is table-based with inline styles only (Gmail/Outlook-safe). Fonts limited to: Arial, Georgia, Verdana, Tahoma, Trebuchet MS.
- Line endings in MIME messages are CRLF (`\r\n`).
- OAuth scopes: `https://www.googleapis.com/auth/gmail.send` + `https://www.googleapis.com/auth/userinfo.email`. Client ID lives in `js/config.js` (public-safe).
- localStorage draft key: `dascout-emailing-draft`. Images are never persisted to localStorage.
- Commits go directly to `main`/`master` (repo convention).
- Security exception (deliberate): the GIS script tag (`https://accounts.google.com/gsi/client`) carries NO `integrity` attribute. Google rotates this script continuously and publishes no stable hashes — SRI-pinning it breaks sign-in on Google's next deploy. Do not add one. It is the plan's only external script; everything else is local.

**Parallelization note:** Tasks 2, 3, 4, 6 are file-disjoint and may run in parallel worktrees after Task 1. Task 5 depends on Task 4. Tasks 7–8 depend on everything prior and are sequential.

**The email model** (produced by composer, consumed by renderer/storage — canonical shape):

```js
{
  subject: '',       // string
  headline: '',      // string
  bodyText: '',      // string; blank-line-separated paragraphs
  ctaText: '',       // string; button label ('' = no button)
  ctaUrl: '',        // string
  footerText: '',    // string
  brandColor: '#1a73e8', // '#rrggbb'
  align: 'center',   // 'left' | 'center'
  fontFamily: 'Arial, Helvetica, sans-serif'
}
```

---

### Task 1: Project scaffold (page skeleton, styles, config, test harness)

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `css/styles.css`
- Create: `js/config.js`
- Create: `.gitignore`

**Interfaces:**
- Produces: all DOM element ids used by later tasks (listed in the HTML below); `GOOGLE_CLIENT_ID` export from `js/config.js`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "dascout-emailing",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Write `js/config.js`**

```js
// Google OAuth 2.0 Client ID (Web application). Public by design — safe to commit.
// See SETUP.md for how to create one. Replace the placeholder before first sign-in.
export const GOOGLE_CLIENT_ID = 'REPLACE_WITH_YOUR_CLIENT_ID.apps.googleusercontent.com';
```

- [ ] **Step 4: Write `index.html`** (complete page; later tasks only add JS behavior, never new markup)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DaScout Emailing</title>
  <link rel="stylesheet" href="css/styles.css">
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
<body>
  <header class="topbar">
    <h1>DaScout Emailing</h1>
    <div class="auth-area">
      <span id="user-email" class="user-email" hidden></span>
      <button id="signin-btn" type="button">Sign in with Google</button>
      <button id="signout-btn" type="button" hidden>Sign out</button>
    </div>
  </header>

  <main class="layout">
    <section class="panel form-panel" aria-label="Email composer">
      <h2>Compose</h2>
      <form id="composer-form" autocomplete="off">
        <label for="subject">Subject</label>
        <input id="subject" type="text" maxlength="200" placeholder="Your July offer is here">

        <fieldset>
          <legend>Branding</legend>
          <label for="logo-file">Logo image</label>
          <input id="logo-file" type="file" accept="image/png,image/jpeg,image/gif">
          <span id="logo-status" class="file-status">No logo selected</span>

          <label for="brand-color">Brand color</label>
          <input id="brand-color" type="color" value="#1a73e8">

          <label for="font-family">Font</label>
          <select id="font-family">
            <option value="Arial, Helvetica, sans-serif">Arial</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="Verdana, Geneva, sans-serif">Verdana</option>
            <option value="Tahoma, Geneva, sans-serif">Tahoma</option>
            <option value="'Trebuchet MS', Helvetica, sans-serif">Trebuchet MS</option>
          </select>

          <label for="align">Alignment</label>
          <select id="align">
            <option value="center">Center</option>
            <option value="left">Left</option>
          </select>
        </fieldset>

        <fieldset>
          <legend>Content</legend>
          <label for="headline">Headline</label>
          <input id="headline" type="text" maxlength="200" placeholder="Big Summer Sale">

          <label for="body-text">Body text (blank line = new paragraph)</label>
          <textarea id="body-text" rows="8" placeholder="Write your message..."></textarea>

          <label for="content-file">Content image</label>
          <input id="content-file" type="file" accept="image/png,image/jpeg,image/gif">
          <span id="content-status" class="file-status">No image selected</span>

          <label for="cta-text">Button text</label>
          <input id="cta-text" type="text" maxlength="60" placeholder="Shop now">

          <label for="cta-url">Button link</label>
          <input id="cta-url" type="url" placeholder="https://example.com/sale">

          <label for="footer-text">Footer</label>
          <textarea id="footer-text" rows="3" placeholder="DaScout Inc · 123 Main St · You received this because..."></textarea>
        </fieldset>
      </form>
    </section>

    <section class="panel preview-panel" aria-label="Live preview">
      <h2>Preview</h2>
      <iframe id="preview-frame" title="Email preview" sandbox="allow-same-origin"></iframe>
    </section>

    <section class="panel send-panel" aria-label="Send">
      <h2>Send</h2>
      <label for="recipients">Recipients (one per line; commas and semicolons also work)</label>
      <textarea id="recipients" rows="6" placeholder="alice@example.com&#10;bob@example.com"></textarea>
      <div id="recipients-feedback" class="feedback" role="status"></div>

      <div class="send-buttons">
        <button id="test-send-btn" type="button" disabled>Send test to myself</button>
        <button id="send-btn" type="button" disabled>Send campaign</button>
      </div>

      <div id="progress" class="progress" hidden>
        <div class="progress-track"><div id="progress-bar" class="progress-bar"></div></div>
        <span id="progress-label"></span>
      </div>

      <div id="report" class="report" hidden></div>
    </section>
  </main>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 5: Write `css/styles.css`**

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: #f0f2f5;
  color: #1c1e21;
}
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.25rem;
  background: #ffffff;
  border-bottom: 1px solid #d9dce1;
}
.topbar h1 { margin: 0; font-size: 1.15rem; }
.auth-area { display: flex; align-items: center; gap: 0.6rem; }
.user-email { font-size: 0.85rem; color: #555; }

.layout {
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(360px, 1fr) minmax(300px, 380px);
  gap: 1rem;
  padding: 1rem;
  align-items: start;
}
@media (max-width: 1100px) { .layout { grid-template-columns: 1fr; } }

.panel {
  background: #ffffff;
  border: 1px solid #d9dce1;
  border-radius: 8px;
  padding: 1rem;
}
.panel h2 { margin-top: 0; font-size: 1rem; }

label { display: block; margin: 0.7rem 0 0.25rem; font-size: 0.85rem; font-weight: 600; }
input[type="text"], input[type="url"], textarea, select {
  width: 100%;
  padding: 0.45rem 0.55rem;
  border: 1px solid #c4c9d0;
  border-radius: 5px;
  font: inherit;
}
fieldset { border: 1px solid #e2e5e9; border-radius: 6px; margin: 0.9rem 0; padding: 0.25rem 0.75rem 0.75rem; }
legend { font-size: 0.8rem; font-weight: 700; color: #666; padding: 0 0.3rem; }
.file-status { display: block; font-size: 0.78rem; color: #777; margin-top: 0.2rem; }

button {
  padding: 0.5rem 0.9rem;
  border: none;
  border-radius: 5px;
  background: #1a73e8;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
button:disabled { background: #a8b3c0; cursor: not-allowed; }
#signout-btn { background: #5f6368; }

.preview-panel iframe {
  width: 100%;
  min-height: 560px;
  border: 1px solid #e2e5e9;
  border-radius: 6px;
  background: #f4f4f4;
}

.send-buttons { display: flex; gap: 0.6rem; margin-top: 0.8rem; }
.feedback { font-size: 0.8rem; margin-top: 0.35rem; min-height: 1.1em; }
.feedback .invalid { color: #c5221f; }
.feedback .ok { color: #188038; }

.progress { margin-top: 0.9rem; }
.progress-track { height: 8px; background: #e2e5e9; border-radius: 4px; overflow: hidden; }
.progress-bar { height: 100%; width: 0%; background: #188038; transition: width 0.2s; }
#progress-label { font-size: 0.8rem; color: #555; }

.report { margin-top: 0.9rem; font-size: 0.8rem; max-height: 240px; overflow-y: auto; }
.report ul { margin: 0.3rem 0; padding-left: 1.1rem; }
.report .fail { color: #c5221f; }
.report .sent { color: #188038; }
```

- [ ] **Step 6: Verify the page loads**

Run: `Start-Process index.html` (or open in a browser). Expected: three-panel layout renders, no console errors except that `js/app.js` 404s (it doesn't exist yet — acceptable at this task).

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore js/config.js index.html css/styles.css
git commit -m "feat: scaffold static composer page, styles, and config"
```

---

### Task 2: Recipient parsing and validation (`js/recipients.js`)

**Files:**
- Create: `js/recipients.js`
- Test: `tests/recipients.test.mjs`

**Interfaces:**
- Produces: `parseRecipients(raw: string) → { valid: string[], invalid: string[] }` — splits on newlines/commas/semicolons, trims, drops empties, dedupes case-insensitively (keeps first casing), validates with a pragmatic email regex.

- [ ] **Step 1: Write the failing tests** — `tests/recipients.test.mjs`

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/recipients.test.mjs`
Expected: FAIL — `Cannot find module ... js/recipients.js`

- [ ] **Step 3: Implement `js/recipients.js`**

```js
// Pure module — no DOM. Pragmatic validation: something@something.tld, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseRecipients(raw) {
  const tokens = raw
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const seen = new Set();
  const valid = [];
  const invalid = [];

  for (const token of tokens) {
    if (EMAIL_RE.test(token)) {
      const key = token.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        valid.push(token);
      }
    } else {
      invalid.push(token);
    }
  }
  return { valid, invalid };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/recipients.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add js/recipients.js tests/recipients.test.mjs
git commit -m "feat: recipient list parsing, validation, and dedupe"
```

---

### Task 3: Email HTML renderer (`js/renderer.js`)

**Files:**
- Create: `js/renderer.js`
- Test: `tests/renderer.test.mjs`

**Interfaces:**
- Consumes: the email model (shape in Global Constraints).
- Produces:
  - `renderEmail(model, images) → { html: string, text: string }` where `images = { logo: string|null, content: string|null }` (each value is an `src` — an object URL for preview or `cid:logo` / `cid:content` for sending; `null` omits that image block).
  - `escapeHtml(s: string) → string` (exported for reuse in report rendering).

- [ ] **Step 1: Write the failing tests** — `tests/renderer.test.mjs`

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/renderer.test.mjs`
Expected: FAIL — `Cannot find module ... js/renderer.js`

- [ ] **Step 3: Implement `js/renderer.js`**

```js
// Pure module — no DOM. Table-based, inline-styled HTML that survives Gmail/Outlook.

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderEmail(model, images) {
  const align = model.align === 'left' ? 'left' : 'center';
  const font = model.fontFamily || 'Arial, Helvetica, sans-serif';
  const color = model.brandColor || '#1a73e8';

  const paragraphs = String(model.bodyText || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const rows = [];

  if (images.logo) {
    rows.push(
      `<tr><td style="padding:24px 32px 8px;text-align:${align};">` +
      `<img src="${images.logo}" alt="Logo" style="max-width:200px;max-height:80px;border:0;"></td></tr>`
    );
  }
  if (model.headline) {
    rows.push(
      `<tr><td style="padding:16px 32px 8px;text-align:${align};` +
      `font-family:${font};font-size:26px;font-weight:bold;color:#222222;">` +
      `${escapeHtml(model.headline)}</td></tr>`
    );
  }
  for (const p of paragraphs) {
    rows.push(
      `<tr><td class="para" style="padding:8px 32px;text-align:${align};` +
      `font-family:${font};font-size:15px;line-height:1.6;color:#444444;">` +
      `${escapeHtml(p).replace(/\n/g, '<br>')}</td></tr>`
    );
  }
  if (images.content) {
    rows.push(
      `<tr><td style="padding:16px 32px;text-align:${align};">` +
      `<img src="${images.content}" alt="" style="max-width:100%;border:0;border-radius:4px;"></td></tr>`
    );
  }
  if (model.ctaText) {
    rows.push(
      `<tr><td style="padding:20px 32px;text-align:${align};">` +
      `<a href="${escapeHtml(model.ctaUrl || '#')}" style="display:inline-block;padding:12px 28px;` +
      `background-color:${color};color:#ffffff;font-family:${font};font-size:15px;` +
      `font-weight:bold;text-decoration:none;border-radius:4px;">` +
      `${escapeHtml(model.ctaText)}</a></td></tr>`
    );
  }
  if (model.footerText) {
    rows.push(
      `<tr><td style="padding:24px 32px;text-align:${align};` +
      `font-family:${font};font-size:12px;line-height:1.5;color:#999999;` +
      `border-top:1px solid #eeeeee;">${escapeHtml(model.footerText).replace(/\n/g, '<br>')}</td></tr>`
    );
  }

  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head>` +
    `<body style="margin:0;padding:0;background-color:#f4f4f4;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">` +
    `<tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" ` +
    `style="max-width:600px;width:100%;background-color:#ffffff;border-radius:6px;text-align:${align};">` +
    rows.join('') +
    `</table></td></tr></table></body></html>`;

  const textParts = [];
  if (model.headline) textParts.push(model.headline, '');
  for (const p of paragraphs) textParts.push(p, '');
  if (model.ctaText) textParts.push(`${model.ctaText}: ${model.ctaUrl || ''}`, '');
  if (model.footerText) textParts.push('--', model.footerText);
  const text = textParts.join('\n').trim() + '\n';

  return { html, text };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/renderer.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add js/renderer.js tests/renderer.test.mjs
git commit -m "feat: email-safe HTML and plain-text renderer"
```

---

### Task 4: MIME message builder (`js/mime.js`)

**Files:**
- Create: `js/mime.js`
- Test: `tests/mime.test.mjs`

**Interfaces:**
- Produces:
  - `encodeBase64(str: string) → string` — UTF-8-safe base64 (uses `TextEncoder` + `btoa`; both exist in browsers and Node ≥16).
  - `encodeBase64Url(str: string) → string` — base64url, no padding (Gmail API `raw` format).
  - `buildMimeMessage({ from, to, subject, html, text, attachments = [] }) → string` — full RFC 2822 message, CRLF line endings; `attachments: [{ cid: string, mimeType: string, base64: string }]` become inline `Content-ID` parts. Structure: `multipart/related` wrapping `multipart/alternative` (text, html) plus image parts. Text/html parts are base64-encoded (avoids line-length and charset pitfalls). Subject is RFC 2047 encoded: `=?UTF-8?B?...?=`.

- [ ] **Step 1: Write the failing tests** — `tests/mime.test.mjs`

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/mime.test.mjs`
Expected: FAIL — `Cannot find module ... js/mime.js`

- [ ] **Step 3: Implement `js/mime.js`**

```js
// Pure module — no DOM. Builds RFC 2822 messages for the Gmail API `raw` field.

const REL_BOUNDARY = 'rel-b0undary';
const ALT_BOUNDARY = 'alt-b0undary';

function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function encodeBase64(str) {
  return bytesToBase64(new TextEncoder().encode(str));
}

export function encodeBase64Url(str) {
  return encodeBase64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function wrap76(b64) {
  return b64.replace(/(.{76})/g, '$1\r\n');
}

export function buildMimeMessage({ from, to, subject, html, text, attachments = [] }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${encodeBase64(subject)}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${REL_BOUNDARY}"`,
    '',
    `--${REL_BOUNDARY}`,
    `Content-Type: multipart/alternative; boundary="${ALT_BOUNDARY}"`,
    '',
    `--${ALT_BOUNDARY}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(encodeBase64(text)),
    '',
    `--${ALT_BOUNDARY}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(encodeBase64(html)),
    '',
    `--${ALT_BOUNDARY}--`
  ];

  for (const att of attachments) {
    lines.push(
      '',
      `--${REL_BOUNDARY}`,
      `Content-Type: ${att.mimeType}`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${att.cid}>`,
      'Content-Disposition: inline',
      '',
      wrap76(att.base64)
    );
  }

  lines.push('', `--${REL_BOUNDARY}--`);
  return lines.join('\r\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/mime.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add js/mime.js tests/mime.test.mjs
git commit -m "feat: MIME multipart builder with inline attachments and base64url"
```

---

### Task 5: Campaign sender (`js/sender.js`)

**Files:**
- Create: `js/sender.js`
- Test: `tests/sender.test.mjs`

**Interfaces:**
- Consumes: `buildMimeMessage`, `encodeBase64Url` from `js/mime.js` (Task 4).
- Produces:
  - `fileToBase64(file: File) → Promise<string>` — browser-only helper (FileReader); NOT unit-tested in Node.
  - `sendCampaign(opts) → Promise<{ results, aborted, remaining }>` with
    `opts = { getToken: async () => string, from, recipients: string[], subject, html, text, attachments, onProgress?: ({done,total,results}) => void, fetchFn = fetch, delayMs = 1000 }`.
    Sequential loop; per-recipient errors recorded and the run continues; HTTP 429 or a quota-flavored error aborts with `remaining` listing unsent recipients; `results` entries are `{ to, ok: true }` or `{ to, ok: false, error: string }`.

- [ ] **Step 1: Write the failing tests** — `tests/sender.test.mjs`

```js
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

test('onProgress fires after every recipient', async () => {
  const ticks = [];
  const fetchFn = async () => okResponse();
  await sendCampaign({
    ...baseOpts, recipients: ['a@x.com', 'b@x.com'], fetchFn,
    onProgress: (p) => ticks.push(`${p.done}/${p.total}`)
  });
  assert.deepEqual(ticks, ['1/2', '2/2']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sender.test.mjs`
Expected: FAIL — `Cannot find module ... js/sender.js`

- [ ] **Step 3: Implement `js/sender.js`**

```js
// Send loop is pure-testable (fetch injected). fileToBase64 is browser-only.
import { buildMimeMessage, encodeBase64Url } from './mime.js';

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function sendCampaign({
  getToken, from, recipients, subject, html, text, attachments = [],
  onProgress, fetchFn = fetch, delayMs = 1000
}) {
  const results = [];

  for (let i = 0; i < recipients.length; i++) {
    const to = recipients[i];
    let fatal = false;
    try {
      const token = await getToken();
      const raw = buildMimeMessage({ from, to, subject, html, text, attachments });
      const resp = await fetchFn(SEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encodeBase64Url(raw) })
      });
      if (resp.ok) {
        results.push({ to, ok: true });
      } else {
        const body = await resp.json().catch(() => ({}));
        const error = (body && body.error && body.error.message) || `HTTP ${resp.status}`;
        results.push({ to, ok: false, error });
        if (resp.status === 429 || /quota|rate limit/i.test(error)) fatal = true;
      }
    } catch (e) {
      results.push({ to, ok: false, error: e.message });
    }

    if (onProgress) onProgress({ done: i + 1, total: recipients.length, results });

    if (fatal) {
      return { results, aborted: true, remaining: recipients.slice(i + 1) };
    }
    if (i < recipients.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return { results, aborted: false, remaining: [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/sender.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the whole suite**

Run: `node --test tests/`
Expected: PASS — recipients + renderer + mime + sender, 24 tests total

- [ ] **Step 6: Commit**

```bash
git add js/sender.js tests/sender.test.mjs
git commit -m "feat: sequential campaign sender with progress, abort-on-quota"
```

---

### Task 6: Google auth module (`js/auth.js`)

**Files:**
- Create: `js/auth.js`

**Interfaces:**
- Consumes: `GOOGLE_CLIENT_ID` from `js/config.js`; the GIS script loaded in `index.html` (`google.accounts.oauth2`).
- Produces (all consumed by `js/app.js` in Tasks 7–8):
  - `initAuth() → void` — must be called once after GIS script load.
  - `signIn() → Promise<string>` — interactive consent; resolves to the signed-in email.
  - `getAccessToken() → Promise<string>` — returns cached token if ≥60s of life remains, otherwise silently re-requests (popup may appear if consent expired).
  - `getUserEmail() → string|null`
  - `isSignedIn() → boolean`
  - `signOut() → void` — revokes the token and clears state.

No unit test (GIS is browser+network-only). Verified structurally now, manually in Task 8's checklist.

- [ ] **Step 1: Implement `js/auth.js`**

```js
// Browser-only module: wraps Google Identity Services token flow.
import { GOOGLE_CLIENT_ID } from './config.js';

const SCOPES =
  'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let userEmail = null;

export function initAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: () => {} // replaced per-request in requestToken
  });
}

function requestToken(promptMode) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error_description || resp.error));
        return;
      }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + (Number(resp.expires_in) - 60) * 1000;
      resolve(accessToken);
    };
    tokenClient.error_callback = (err) => {
      reject(new Error(err.message || err.type || 'Sign-in failed'));
    };
    tokenClient.requestAccessToken({ prompt: promptMode });
  });
}

export async function signIn() {
  await requestToken('consent');
  const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!resp.ok) throw new Error('Could not read account email');
  const info = await resp.json();
  userEmail = info.email;
  return userEmail;
}

export async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  return requestToken(''); // re-request; usually silent for an already-consented user
}

export function getUserEmail() {
  return userEmail;
}

export function isSignedIn() {
  return userEmail !== null;
}

export function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiresAt = 0;
  userEmail = null;
}
```

- [ ] **Step 2: Structural check**

Run: `node --check js/auth.js`
Expected: no output (syntax valid). Full behavior is exercised in Task 8's manual checklist.

- [ ] **Step 3: Commit**

```bash
git add js/auth.js
git commit -m "feat: Google Identity Services auth wrapper with token refresh"
```

---

### Task 7: Composer, draft storage, and live preview (`js/composer.js`, `js/storage.js`, `js/app.js`)

**Files:**
- Create: `js/composer.js`
- Create: `js/storage.js`
- Create: `js/app.js` (preview + autosave wiring; send wiring arrives in Task 8)

**Interfaces:**
- Consumes: DOM ids from Task 1; `renderEmail` from Task 3.
- Produces (consumed by Task 8's additions to `js/app.js`):
  - `composer.js`: `readModel() → model`, `applyDraft(model) → void`, `onModelChange(handler) → void` (debounced 150 ms), `getImages() → { logoFile: File|null, contentFile: File|null, logoUrl: string|null, contentUrl: string|null }`, `initComposer() → void`.
  - `storage.js`: `saveDraft(model) → void`, `loadDraft() → model|null`.

- [ ] **Step 1: Implement `js/storage.js`**

```js
// localStorage draft persistence. Text/settings only — never images.
const KEY = 'dascout-emailing-draft';

export function saveDraft(model) {
  try {
    localStorage.setItem(KEY, JSON.stringify(model));
  } catch {
    // Storage full or blocked — autosave is best-effort.
  }
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Implement `js/composer.js`**

```js
// Bridges the form DOM and the email model. Owns file inputs and object URLs.

const FIELDS = {
  subject: 'subject',
  headline: 'headline',
  bodyText: 'body-text',
  ctaText: 'cta-text',
  ctaUrl: 'cta-url',
  footerText: 'footer-text',
  brandColor: 'brand-color',
  align: 'align',
  fontFamily: 'font-family'
};

let logoFile = null;
let contentFile = null;
let logoUrl = null;
let contentUrl = null;
let changeHandler = null;
let debounceTimer = null;

function el(id) {
  return document.getElementById(id);
}

export function readModel() {
  const model = {};
  for (const [key, id] of Object.entries(FIELDS)) {
    model[key] = el(id).value;
  }
  return model;
}

export function applyDraft(model) {
  for (const [key, id] of Object.entries(FIELDS)) {
    if (typeof model[key] === 'string') el(id).value = model[key];
  }
}

export function getImages() {
  return { logoFile, contentFile, logoUrl, contentUrl };
}

function emitChange() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (changeHandler) changeHandler(readModel());
  }, 150);
}

function bindFileInput(inputId, statusId, setFile) {
  el(inputId).addEventListener('change', (e) => {
    const file = e.target.files[0] || null;
    setFile(file);
    el(statusId).textContent = file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : 'No file selected';
    emitChange();
  });
}

export function onModelChange(handler) {
  changeHandler = handler;
}

export function initComposer() {
  for (const id of Object.values(FIELDS)) {
    el(id).addEventListener('input', emitChange);
  }
  bindFileInput('logo-file', 'logo-status', (f) => {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    logoFile = f;
    logoUrl = f ? URL.createObjectURL(f) : null;
  });
  bindFileInput('content-file', 'content-status', (f) => {
    if (contentUrl) URL.revokeObjectURL(contentUrl);
    contentFile = f;
    contentUrl = f ? URL.createObjectURL(f) : null;
  });
}
```

- [ ] **Step 3: Implement `js/app.js`** (preview + autosave only; Task 8 extends this file)

```js
import { initComposer, onModelChange, readModel, applyDraft, getImages } from './composer.js';
import { renderEmail } from './renderer.js';
import { saveDraft, loadDraft } from './storage.js';

function updatePreview(model) {
  const { logoUrl, contentUrl } = getImages();
  const { html } = renderEmail(model, { logo: logoUrl, content: contentUrl });
  document.getElementById('preview-frame').srcdoc = html;
}

function init() {
  initComposer();

  const draft = loadDraft();
  if (draft) applyDraft(draft);

  onModelChange((model) => {
    saveDraft(model);
    updatePreview(model);
  });

  updatePreview(readModel());
}

init();
```

- [ ] **Step 4: Manual verification**

Serve locally (needed for ES modules): `python -m http.server 8000` or any static server, open `http://localhost:8000`. Verify:
1. Typing in headline/body updates the preview as you type.
2. Picking a logo and content image shows them in the preview; status labels show filename and size.
3. Changing brand color, font, alignment restyles the preview.
4. Refresh the page: text fields are restored; image status labels correctly show "No file selected" (images intentionally not persisted).
5. No console errors.

- [ ] **Step 5: Commit**

```bash
git add js/composer.js js/storage.js js/app.js
git commit -m "feat: structured composer form with live preview and draft autosave"
```

---

### Task 8: Auth + send flow wiring (`js/app.js` completed)

**Files:**
- Modify: `js/app.js` (replace entirely with the version below)

**Interfaces:**
- Consumes: everything from Tasks 2–7 — `parseRecipients`, `renderEmail`/`escapeHtml`, `sendCampaign`/`fileToBase64`, auth module exports, composer exports.
- Produces: the finished app.

- [ ] **Step 1: Replace `js/app.js` with the full wiring**

```js
import { initComposer, onModelChange, readModel, applyDraft, getImages } from './composer.js';
import { renderEmail, escapeHtml } from './renderer.js';
import { saveDraft, loadDraft } from './storage.js';
import { parseRecipients } from './recipients.js';
import { fileToBase64, sendCampaign } from './sender.js';
import { initAuth, signIn, signOut, getAccessToken, getUserEmail, isSignedIn } from './auth.js';

const el = (id) => document.getElementById(id);

let sending = false;

// ---------- preview ----------

function updatePreview(model) {
  const { logoUrl, contentUrl } = getImages();
  const { html } = renderEmail(model, { logo: logoUrl, content: contentUrl });
  el('preview-frame').srcdoc = html;
}

// ---------- auth UI ----------

function refreshAuthUi() {
  const signedIn = isSignedIn();
  el('signin-btn').hidden = signedIn;
  el('signout-btn').hidden = !signedIn;
  el('user-email').hidden = !signedIn;
  el('user-email').textContent = signedIn ? getUserEmail() : '';
  refreshSendButtons();
}

function bindAuth() {
  el('signin-btn').addEventListener('click', async () => {
    try {
      await signIn();
    } catch (e) {
      alert(`Sign-in failed: ${e.message}`);
    }
    refreshAuthUi();
  });
  el('signout-btn').addEventListener('click', () => {
    signOut();
    refreshAuthUi();
  });
}

// ---------- recipients ----------

function recipientState() {
  return parseRecipients(el('recipients').value);
}

function refreshRecipientsFeedback() {
  const { valid, invalid } = recipientState();
  const parts = [];
  if (valid.length) parts.push(`<span class="ok">${valid.length} valid recipient${valid.length === 1 ? '' : 's'}</span>`);
  if (invalid.length) parts.push(`<span class="invalid">Invalid: ${invalid.map(escapeHtml).join(', ')}</span>`);
  el('recipients-feedback').innerHTML = parts.join(' · ');
  refreshSendButtons();
}

function refreshSendButtons() {
  const { valid, invalid } = recipientState();
  const signedIn = isSignedIn();
  el('test-send-btn').disabled = sending || !signedIn;
  el('send-btn').disabled = sending || !signedIn || valid.length === 0 || invalid.length > 0;
}

// ---------- sending ----------

async function collectAttachmentsAndHtml(model) {
  const { logoFile, contentFile } = getImages();
  const attachments = [];
  const srcs = { logo: null, content: null };
  if (logoFile) {
    attachments.push({ cid: 'logo', mimeType: logoFile.type, base64: await fileToBase64(logoFile) });
    srcs.logo = 'cid:logo';
  }
  if (contentFile) {
    attachments.push({ cid: 'content', mimeType: contentFile.type, base64: await fileToBase64(contentFile) });
    srcs.content = 'cid:content';
  }
  const { html, text } = renderEmail(model, srcs);
  return { attachments, html, text };
}

function showProgress(done, total) {
  el('progress').hidden = false;
  el('progress-bar').style.width = `${Math.round((done / total) * 100)}%`;
  el('progress-label').textContent = `${done} / ${total} sent`;
}

function showReport({ results, aborted, remaining }) {
  const items = results.map((r) =>
    r.ok
      ? `<li class="sent">${escapeHtml(r.to)} — sent</li>`
      : `<li class="fail">${escapeHtml(r.to)} — ${escapeHtml(r.error)}</li>`
  );
  let headline = aborted
    ? `<strong class="fail">Run stopped early (quota/rate limit).</strong> ${remaining.length} recipient(s) not attempted: ${remaining.map(escapeHtml).join(', ')}`
    : `<strong>Done.</strong> ${results.filter((r) => r.ok).length} sent, ${results.filter((r) => !r.ok).length} failed.`;
  el('report').hidden = false;
  el('report').innerHTML = `${headline}<ul>${items.join('')}</ul>`;
}

async function runSend(recipients) {
  const model = readModel();
  if (!model.subject.trim()) {
    alert('Please enter a subject before sending.');
    return;
  }
  sending = true;
  refreshSendButtons();
  el('report').hidden = true;
  showProgress(0, recipients.length);

  try {
    const { attachments, html, text } = await collectAttachmentsAndHtml(model);
    const outcome = await sendCampaign({
      getToken: getAccessToken,
      from: getUserEmail(),
      recipients,
      subject: model.subject,
      html,
      text,
      attachments,
      onProgress: ({ done, total }) => showProgress(done, total)
    });
    showReport(outcome);
  } catch (e) {
    el('report').hidden = false;
    el('report').innerHTML = `<strong class="fail">Send failed: ${escapeHtml(e.message)}</strong>`;
  } finally {
    sending = false;
    refreshSendButtons();
  }
}

function bindSend() {
  el('recipients').addEventListener('input', refreshRecipientsFeedback);

  el('test-send-btn').addEventListener('click', () => {
    runSend([getUserEmail()]);
  });

  el('send-btn').addEventListener('click', () => {
    const { valid } = recipientState();
    if (!confirm(`Send this email to ${valid.length} recipient(s) from ${getUserEmail()}?`)) return;
    runSend(valid);
  });
}

// ---------- init ----------

function init() {
  initComposer();

  const draft = loadDraft();
  if (draft) applyDraft(draft);

  onModelChange((model) => {
    saveDraft(model);
    updatePreview(model);
  });

  bindAuth();
  bindSend();

  updatePreview(readModel());
  refreshRecipientsFeedback();

  // GIS script is async — poll briefly until it's available.
  const gisReady = setInterval(() => {
    if (window.google && google.accounts && google.accounts.oauth2) {
      clearInterval(gisReady);
      initAuth();
      refreshAuthUi();
    }
  }, 100);
}

init();
```

- [ ] **Step 2: Run the unit suite (regression)**

Run: `node --test tests/`
Expected: PASS, 24 tests — the wiring must not have touched pure modules.

- [ ] **Step 3: Manual verification (pre-OAuth parts)**

Serve locally, open the page. Verify without signing in:
1. Send buttons are disabled while signed out.
2. Typing `bad-address` in recipients shows it flagged invalid; a valid address shows "1 valid recipient".
3. Send button stays disabled while any invalid line exists.
4. Preview still live-updates; no console errors.

(Full auth + real-send verification happens in Task 9 after OAuth setup, since it requires a real client ID.)

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat: wire auth, recipients validation, test send, and campaign send"
```

---

### Task 9: Setup docs and end-to-end verification (`SETUP.md`, `README.md`)

**Files:**
- Create: `SETUP.md`
- Create: `README.md`

**Interfaces:**
- Consumes: the finished app; the Google Cloud console (human steps).

- [ ] **Step 1: Write `SETUP.md`**

```markdown
# Setup — Google OAuth + GitHub Pages

The app is static; the only setup is a (free) Google Cloud OAuth client and
enabling GitHub Pages.

## 1. Google Cloud project + Gmail API

1. Go to https://console.cloud.google.com/ and create a project
   (e.g., "dascout-emailing").
2. **APIs & Services → Library** → search "Gmail API" → **Enable**.

## 2. OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** → Create.
3. Fill in app name ("DaScout Emailing"), your email for both contact fields.
   No logo, no extra domains needed. Save through the steps.
4. **Audience / Test users**: add the Google account(s) that will use the app
   (up to 100). While the app is in "Testing" status, ONLY these accounts can
   sign in — that is expected and fine for personal/team use.

> The `gmail.send` scope is "sensitive". In Testing mode Google shows an
> "unverified app" interstitial at first sign-in — click "Continue".
> Publishing to the general public would require Google verification;
> that is out of scope.

## 3. OAuth client ID

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Authorized JavaScript origins — add BOTH:
   - `http://localhost:8000` (local development)
   - `https://<your-username>.github.io` (production)
4. No redirect URIs needed (token flow uses a popup).
5. Copy the Client ID (ends in `.apps.googleusercontent.com`) into
   `js/config.js`.

## 4. GitHub Pages

1. Push this repo to GitHub.
2. Repo **Settings → Pages** → Source: "Deploy from a branch" →
   Branch: `main` (or `master`), folder `/ (root)` → Save.
3. The app appears at `https://<your-username>.github.io/<repo-name>/`
   within a minute or two.

> If the repo is served from a subpath (`/<repo-name>/`), that's fine —
> the app uses only relative paths.

## 5. Local development

Any static server works; ES modules require http(s), not file://.

    python -m http.server 8000

Then open http://localhost:8000.

## Sending limits (Gmail)

- Consumer Gmail: roughly 500 recipients/day.
- Google Workspace: roughly 2,000 recipients/day.
- The app sends one email per recipient, ~1 second apart, and stops with a
  clear report if Google returns a quota error.
```

- [ ] **Step 2: Write `README.md`**

```markdown
# DaScout Emailing

A static marketing-email composer and sender. Hosted on GitHub Pages; sends
through YOUR Gmail account via the Gmail API — no backend, no database, no
secrets.

## Features

- Structured composer: logo, headline, body paragraphs, content image,
  CTA button, footer — with brand color, font, and alignment controls.
- Live preview that matches exactly what recipients receive
  (table-based, inline-styled, Gmail/Outlook-safe HTML + plain-text part).
- Images embedded inline in the email itself (no external hosting).
- Paste a recipient list; each recipient gets their own individual copy
  (nobody sees anyone else's address).
- Test-send to yourself, live progress bar, per-recipient result report.
- Draft autosave (text and settings) in localStorage.

## Quick start

1. Complete [SETUP.md](SETUP.md) (Google OAuth client + GitHub Pages).
2. Open the app, **Sign in with Google**.
3. Compose, pick images, **Send test to myself**, check your inbox.
4. Paste recipients, **Send campaign**.

## Development

No build step. Serve the repo root with any static server:

    python -m http.server 8000

Run unit tests (Node ≥ 18):

    npm test

## Limits

Gmail caps sending (~500/day consumer, ~2,000/day Workspace). This tool is
for small-scale campaigns, not mass blasts. The `gmail.send` OAuth scope in
Testing mode limits sign-in to the test users you list (up to 100).
```

- [ ] **Step 3: Full manual E2E checklist** (requires the human to have completed SETUP.md steps 1–3 with a real client ID in `js/config.js`)

1. Sign in with Google → email appears in header; buttons enable.
2. Compose with logo + content image → **Send test to myself** → open Gmail: inline images render, layout matches preview, plain-text part exists (three-dot menu → Show original → confirm `multipart/alternative`).
3. Two-recipient real send → progress bar advances → report lists both as sent.
4. Sign out → buttons disable, email clears.
5. Refresh mid-compose → text restored, images need re-picking (status labels reset).

Record any failures as defects (route to fix-me) rather than patching ad hoc.

- [ ] **Step 4: Commit**

```bash
git add SETUP.md README.md
git commit -m "docs: setup guide and README"
```

---

## Self-review (performed at plan-writing time)

- **Spec coverage:** auth (T6), composer fields incl. styling (T1/T7), live preview (T7), inline cid images + preview substitution (T3/T7/T8), plain-text part (T3/T4), recipient parse/validate/dedupe + pre-send blocking (T2/T8), sequential per-recipient send with delay/progress/report/quota-abort (T5/T8), test send (T8), draft autosave excl. images (T7), token refresh mid-run via `getToken` per recipient (T5/T6), SETUP.md + limits (T9). Subject field added (T1) — required for a sendable email; spec omission noted during planning.
- **Placeholder scan:** none — every code step is complete.
- **Type consistency:** email model keys match across composer/renderer/storage; `attachments` shape `{cid, mimeType, base64}` consistent across mime/sender/app; `images` shape `{logo, content}` consistent across renderer/app.
