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
