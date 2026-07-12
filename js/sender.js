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
