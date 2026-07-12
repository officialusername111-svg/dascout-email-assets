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
const DEFAULT_BG = '#ffffff';
const DEFAULT_HEADING_COLOR = '#222222';
const DEFAULT_TEXT_COLOR = '#444444';

// linear-gradient angle per direction choice
const GRADIENT_ANGLES = { vertical: '180deg', horizontal: '90deg', diagonal: '135deg' };

function safeFont(value) {
  return FONT_STACKS.includes(value) ? value : DEFAULT_FONT;
}

function safeColorOr(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value)) ? value : fallback;
}

function safeColor(value) {
  return safeColorOr(value, DEFAULT_COLOR);
}

function safeUrl(value) {
  const url = String(value || '').trim();
  return /^(https?:|mailto:)/i.test(url) ? url : '#';
}

function clampSize(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Background: solid color, or 2-3 stop gradient with the first color doubling
// as the bgcolor fallback for clients that strip gradients (Outlook desktop).
function backgroundStyles(model) {
  const c1 = safeColorOr(model.bgColor1, DEFAULT_BG);
  const mode = model.bgMode === '2' || model.bgMode === '3' ? model.bgMode : '1';
  if (mode === '1') {
    return { bgcolor: c1, style: `background-color:${c1};` };
  }
  const c2 = safeColorOr(model.bgColor2, c1);
  const stops = [c1, c2];
  if (mode === '3') stops.push(safeColorOr(model.bgColor3, c2));
  const angle = GRADIENT_ANGLES[model.bgDirection] || GRADIENT_ANGLES.vertical;
  return {
    bgcolor: c1,
    style: `background-color:${c1};background-image:linear-gradient(${angle},${stops.join(',')});`
  };
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
  const headingColor = safeColorOr(model.headingColor, DEFAULT_HEADING_COLOR);
  const textColor = safeColorOr(model.textColor, DEFAULT_TEXT_COLOR);
  const headlineSize = clampSize(model.headlineSize, 18, 40, 26);
  const bodySize = clampSize(model.bodySize, 12, 24, 15);
  const footerSize = clampSize(model.footerSize, 10, 16, 12);
  const bg = backgroundStyles(model);

  const paragraphs = String(model.bodyText || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const rows = [];

  if (images.logo && model.showHeaderLogo !== false) {
    rows.push(
      `<tr><td style="padding:24px 32px 8px;text-align:${align};">` +
      `<img src="${images.logo}" alt="Logo" style="max-width:200px;max-height:80px;border:0;"></td></tr>`
    );
  }
  if (model.headline) {
    rows.push(
      `<tr><td style="padding:16px 32px 8px;text-align:${align};` +
      `font-family:${font};font-size:${headlineSize}px;font-weight:bold;color:${headingColor};">` +
      `${escapeHtml(model.headline)}</td></tr>`
    );
  }
  for (const p of paragraphs) {
    rows.push(
      `<tr><td class="para" style="padding:8px 32px;text-align:${align};` +
      `font-family:${font};font-size:${bodySize}px;line-height:1.6;color:${textColor};">` +
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
  const footerLogoShown = images.footerLogo && model.showFooterLogo !== false;
  if (footerLogoShown || model.footerText) {
    const parts = [];
    if (footerLogoShown) {
      const margin = align === 'center' ? '0 auto 10px' : '0 0 10px';
      parts.push(
        `<img src="${images.footerLogo}" alt="Logo" ` +
        `style="max-width:140px;max-height:48px;border:0;display:block;margin:${margin};">`
      );
    }
    if (model.footerText) {
      parts.push(escapeHtml(model.footerText).replace(/\n/g, '<br>'));
    }
    rows.push(
      `<tr><td style="padding:24px 32px;text-align:${align};` +
      `font-family:${font};font-size:${footerSize}px;line-height:1.5;color:${textColor};">` +
      `${parts.join('')}</td></tr>`
    );
  }

  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head>` +
    `<body style="margin:0;padding:0;background-color:#f4f4f4;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">` +
    `<tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="${bg.bgcolor}" ` +
    `style="max-width:600px;width:100%;${bg.style}border-radius:6px;text-align:${align};">` +
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
