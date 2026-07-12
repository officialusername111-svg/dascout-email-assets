// Browser-only module: wraps Google Identity Services token flow.
import { GOOGLE_CLIENT_ID } from './config.js';

const SCOPES =
  'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let userEmail = null;
let pendingToken = null;
let pendingPrompt = null;

export function initAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: () => {} // replaced per-request in requestToken
  });
}

function requestToken(promptMode) {
  if (pendingToken) {
    if (pendingPrompt === promptMode) return pendingToken;
    // A flight with a different prompt mode is in progress. Wait for it:
    // if it delivers a token, use that; if it fails, issue this request.
    return pendingToken.then(
      (token) => token,
      () => requestToken(promptMode)
    );
  }
  const p = new Promise((resolve, reject) => {
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
  pendingToken = p;
  pendingPrompt = promptMode;
  p.then(
    () => { pendingToken = null; pendingPrompt = null; },
    () => { pendingToken = null; pendingPrompt = null; }
  );
  return p;
}

export async function signIn() {
  await requestToken('consent');
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!resp.ok) throw new Error('Could not read account email');
    const info = await resp.json();
    userEmail = info.email;
    return userEmail;
  } catch (e) {
    accessToken = null;
    tokenExpiresAt = 0;
    throw e;
  }
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
