// Pure module — no DOM. Table-based, inline-styled HTML that survives Gmail/Outlook.

const FONT_STACKS = [
  'Arial, Helvetica, sans-serif',
  'Georgia, serif',
  'Verdana, Geneva, sans-serif',
  'Tahoma, Geneva, sans-serif',
  "'Trebuchet MS', Helvetica, sans-serif"
];
const DEFAULT_FONT = FONT_STACKS[0];
const DEFAULT_COLOR = '#1a73e8';

function safeFont(value) {
  return FONT_STACKS.includes(value) ? value : DEFAULT_FONT;
}

function safeColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value)) ? value : DEFAULT_COLOR;
}

function safeUrl(value) {
  const url = String(value || '').trim();
  return /^(https?:|mailto:)/i.test(url) ? url : '#';
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderEmail(model, images) {
  const align = model.align === 'left' ? 'left' : 'center';
  const font = safeFont(model.fontFamily);
  const color = safeColor(model.brandColor);

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
      `<a href="${escapeHtml(safeUrl(model.ctaUrl))}" style="display:inline-block;padding:12px 28px;` +
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
