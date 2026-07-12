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
