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
