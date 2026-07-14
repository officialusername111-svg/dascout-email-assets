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
  const { logoUrl, contentUrl, footerLogoUrl } = getImages();
  const { html } = renderEmail(model, { logo: logoUrl, content: contentUrl, footerLogo: footerLogoUrl });
  el('preview-frame').srcdoc = html;
}

function ctaProblem(model) {
  if (model.ctaText.trim() && !/^(https?:|mailto:)/i.test(model.ctaUrl.trim())) {
    return 'Button has no destination link';
  }
  return null;
}

function refreshCtaFeedback(model) {
  const problem = ctaProblem(model);
  el('cta-feedback').innerHTML = problem ? `<span class="invalid">${escapeHtml(problem)}</span>` : '';
  el('content-warn').hidden = problem === null;
}

// ---------- auth UI ----------

let gisReady = false;

function refreshAuthUi() {
  const signedIn = isSignedIn();
  el('signout-btn').hidden = !signedIn;
  el('user-email').hidden = !signedIn;
  el('user-email').textContent = signedIn ? getUserEmail() : '';
  refreshSendButtons();
}

// Sign-in happens on demand, the first time a send needs it.
async function ensureSignedIn() {
  if (isSignedIn()) return;
  if (!gisReady) {
    throw new Error('Google Sign-In is still loading — try again in a moment.');
  }
  await signIn();
  refreshAuthUi();
}

function bindAuth() {
  el('get-started-btn').addEventListener('click', () => {
    el('landing').hidden = true;
    el('studio').hidden = false;
  });
  el('signout-btn').addEventListener('click', () => {
    signOut();
    clearRunUi();
    refreshAuthUi();
  });
}

// Reset campaign UI so the next sign-in opens a clean studio: a stale report
// would otherwise survive (including a resume button bound to the previous
// account's remaining recipient list).
function clearRunUi() {
  el('report').hidden = true;
  el('report').innerHTML = '';
  el('progress').hidden = true;
  el('progress-bar').style.width = '0%';
  el('progress-label').textContent = '';
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
  const badge = el('send-count');
  badge.hidden = valid.length + invalid.length === 0;
  badge.textContent = String(valid.length);
  badge.classList.toggle('text-bg-danger', invalid.length > 0);
  badge.classList.toggle('text-bg-primary', invalid.length === 0);
  refreshSendButtons();
}

function refreshSendButtons() {
  const { valid, invalid } = recipientState();
  el('test-send-btn').disabled = sending;
  el('send-btn').disabled = sending || valid.length === 0 || invalid.length > 0 || ctaProblem(readModel()) !== null;
  el('signout-btn').disabled = sending;
}

// ---------- sending ----------

async function collectAttachmentsAndHtml(model) {
  const { logoFile, contentFile, footerLogoFile } = getImages();
  const attachments = [];
  const srcs = { logo: null, content: null, footerLogo: null };
  if (logoFile && model.showHeaderLogo !== false) {
    attachments.push({ cid: 'logo', mimeType: logoFile.type, base64: await fileToBase64(logoFile) });
    srcs.logo = 'cid:logo';
  }
  if (contentFile) {
    attachments.push({ cid: 'content', mimeType: contentFile.type, base64: await fileToBase64(contentFile) });
    srcs.content = 'cid:content';
  }
  if (footerLogoFile && model.showFooterLogo !== false) {
    attachments.push({ cid: 'footerlogo', mimeType: footerLogoFile.type, base64: await fileToBase64(footerLogoFile) });
    srcs.footerLogo = 'cid:footerlogo';
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
  const resumeButton = aborted && remaining.length > 0
    ? `<button id="resume-btn" type="button">Send to remaining ${remaining.length}</button>`
    : '';
  el('report').hidden = false;
  el('report').innerHTML = `${headline}<ul>${items.join('')}</ul>${resumeButton}`;
  if (aborted && remaining.length > 0) {
    el('resume-btn').addEventListener('click', () => runSend(remaining));
  }
}

function setFormLocked(locked) {
  el('composer-form').querySelectorAll('input, textarea, select, .swatch').forEach((field) => {
    field.disabled = locked;
  });
  el('recipients').disabled = locked;
}

function syncBackgroundControls() {
  const mode = el('bg-mode').value;
  el('bg-direction').disabled = sending || mode === '1';
  el('bg-color-2').disabled = sending || mode === '1';
  el('bg-color-3').disabled = sending || mode !== '3';
}

function bindSizeClamps() {
  const LIMITS = { 'headline-size': [18, 40], 'body-size': [12, 24], 'footer-size': [10, 16] };
  for (const [id, [min, max]] of Object.entries(LIMITS)) {
    el(id).addEventListener('change', () => {
      const input = el(id);
      const n = parseInt(input.value, 10);
      const clamped = Number.isNaN(n) ? Number(input.defaultValue) : Math.min(max, Math.max(min, n));
      if (String(clamped) !== input.value) {
        input.value = String(clamped);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }
}

function bindSwatches() {
  const colorInput = el('brand-color');
  const syncSelection = () => {
    document.querySelectorAll('.swatch[data-color]').forEach((btn) => {
      btn.classList.toggle('sel', btn.dataset.color.toLowerCase() === colorInput.value.toLowerCase());
    });
  };
  document.querySelectorAll('.swatch[data-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
      colorInput.value = btn.dataset.color;
      colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  colorInput.addEventListener('input', syncSelection);
  syncSelection();
}

async function runSend(target, { confirmCampaign = false } = {}) {
  const model = readModel();
  if (!model.subject.trim()) {
    alert('Please enter a subject before sending.');
    return;
  }
  try {
    await ensureSignedIn();
  } catch (e) {
    alert(`Sign-in is needed to send: ${e.message}`);
    return;
  }
  const recipients = target === 'self' ? [getUserEmail()] : target;
  if (confirmCampaign && !confirm(`Send this email to ${recipients.length} recipient(s) from ${getUserEmail()}?`)) {
    return;
  }
  sending = true;
  setFormLocked(true);
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
    setFormLocked(false);
    syncBackgroundControls();
    refreshSendButtons();
  }
}

function bindSend() {
  el('recipients').addEventListener('input', refreshRecipientsFeedback);

  el('test-send-btn').addEventListener('click', () => {
    runSend('self');
  });

  el('send-btn').addEventListener('click', () => {
    const { valid } = recipientState();
    runSend(valid, { confirmCampaign: true });
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
    refreshCtaFeedback(model);
    refreshSendButtons();
  });

  bindAuth();
  bindSend();
  bindSwatches();
  bindSizeClamps();
  el('bg-mode').addEventListener('input', syncBackgroundControls);
  syncBackgroundControls();

  updatePreview(readModel());
  refreshCtaFeedback(readModel());
  refreshRecipientsFeedback();

  // GIS script is async — poll briefly until it's available. Sends attempted
  // before it's ready get a friendly retry message from ensureSignedIn().
  const gisPoll = setInterval(() => {
    if (window.google && google.accounts && google.accounts.oauth2) {
      clearInterval(gisPoll);
      initAuth();
      gisReady = true;
      refreshAuthUi();
    }
  }, 100);
}

init();
