# DaScout Emailing — Static Gmail Marketing Composer

**Date:** 2026-07-12
**Status:** Approved design, pre-implementation

## Summary

A single-page static web app, hosted on GitHub Pages, where the user signs in with
Google, composes a marketing email through a structured form with a live preview,
uploads a logo and a content image, pastes a recipient list, and the app sends one
individual copy per recipient through the user's own Gmail account via the Gmail API.

No backend, no database, no secrets. The only credential is a Google OAuth client ID,
which is public by design.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| How does sending work on static hosting? | Google sign-in; send through the signed-in user's own Gmail via the Gmail API, directly from the browser. |
| Sender address | The signed-in Google account. (Arbitrary unverified sender addresses are not possible with any legitimate provider.) |
| Composer style | Structured template form (dedicated fields), not a free-form rich-text editor. |
| Images | Uploaded from disk; embedded in the email as inline `cid:` attachments. No external image hosting. |
| Recipient handling | One individual email per recipient, sent sequentially. Recipients never see each other. No personalization placeholders in v1. |
| Stack | Plain HTML + CSS + vanilla JS (ES modules). No framework, no build step. |

## Architecture

The repo is the deployable site. Four ES modules with clean boundaries:

### 1. Auth (`js/auth.js`)
- Google Identity Services (GIS) token client requesting scope
  `https://www.googleapis.com/auth/gmail.send` plus basic profile (to learn the
  signed-in address).
- Exposes: `signIn()`, `signOut()`, `getUserEmail()`, `getAccessToken()` —
  `getAccessToken()` silently re-prompts when the ~1-hour token expires mid-session.
- OAuth client ID lives in a small config file (`js/config.js`); it is public-safe.

### 2. Composer (`js/composer.js`)
The structured form. Fields:
- Logo image (file upload)
- Headline (single line)
- Body text (textarea; blank-line-separated paragraphs)
- Content image (file upload)
- CTA button: label text + destination URL
- Footer text (e.g., business name/address/unsubscribe note)
- Styling controls: brand color (color picker), text/button alignment
  (left/center), font family (short email-safe list: Arial, Georgia, Verdana,
  Tahoma, Trebuchet MS)

Emits a single "email model" object on every change (input event, debounced).

### 3. Renderer (`js/renderer.js`)
- Pure function: email model → email-client-safe HTML.
- Table-based layout, all styles inlined — renders correctly in Gmail and Outlook.
- Images referenced as `cid:logo` / `cid:content` inline attachments; the live
  preview substitutes local object URLs for the `cid:` references.
- Also generates a plain-text alternative part (improves deliverability).
- The same HTML feeds both the preview iframe and the actual send — what you see
  is what goes out.

### 4. Sender (`js/sender.js`)
- Parses the pasted recipient list (one address per line; commas/semicolons also
  accepted). Validates each address; invalid lines are flagged in the UI before
  anything sends.
- Builds a MIME message per recipient: `multipart/related` wrapping a
  `multipart/alternative` (text + HTML) plus the inline image parts;
  base64url-encoded for the Gmail API.
- Sends via `POST gmail/v1/users/me/messages/send`, sequentially, with a short
  fixed delay (~1s) between sends.
- Live progress UI: sent / failed / remaining. Failures don't stop the run.
- Final per-recipient report (success or the error message).

## Key behaviors

- **Test send** — button that sends the current email to the signed-in user's own
  address, for an inbox check before touching the real list.
- **Draft autosave** — form text and styling settings persist in `localStorage`;
  a refresh doesn't lose work. Uploaded images are NOT persisted (too large for
  localStorage) — the UI clearly indicates when images need re-picking.
- **Error handling** —
  - Invalid recipient lines highlighted pre-send; send button blocked until fixed
    or removed.
  - Per-recipient API failures collected and shown in the report.
  - Token expiry mid-run triggers a re-auth prompt; queue position is preserved
    and the run resumes.
  - Gmail daily-quota errors (HTTP 429 / quota-exceeded) stop the run with a clear
    message listing who was and wasn't sent.

## Constraints and known limits

- Gmail sending caps: ~500 recipients/day (consumer), ~2,000/day (Workspace).
  Suitable for small-scale marketing, not mass blasts.
- `gmail.send` is a sensitive OAuth scope: in "testing" (unverified) mode the app
  works for up to 100 explicitly listed test users. Fine for personal/team use.
  Publishing to arbitrary users would require Google's verification process —
  explicitly out of scope.
- GitHub Pages is static hosting; everything runs in the browser.

## Setup outside the code

`SETUP.md` in the repo documents, step by step:
1. Create a free Google Cloud project; enable the Gmail API.
2. Configure the OAuth consent screen (testing mode; add test users).
3. Create an OAuth client ID (Web application) with the `https://<user>.github.io`
   origin (and `http://localhost` for local dev) as authorized JavaScript origins.
4. Put the client ID in `js/config.js`.
5. Enable GitHub Pages on the repo (deploy from `main`, root).

## Testing

- **Unit-testable pure functions**, kept dependency-free: recipient parsing and
  validation, MIME message building, HTML rendering from an email model.
- **Manual test checklist**: auth flow (sign in/out, expiry), preview fidelity
  while typing, image embedding (test send shows inline images in Gmail),
  bad-address validation, multi-recipient send with progress and report,
  quota/expiry error paths.

## Out of scope (v1)

- Personalization placeholders (e.g., `{{name}}`)
- Free-form rich-text editing
- Multiple templates / template gallery
- Contact list management, unsubscribe handling, analytics
- Any backend component
