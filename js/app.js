import { initComposer, onModelChange, readModel, applyDraft, getImages } from './composer.js';
import { renderEmail, escapeHtml } from './renderer.js';
import { saveDraft, loadDraft } from './storage.js';
import { parseRecipients } from './recipients.js';
import { fileToBase64, sendCampaign } from './sender.js';
import { initAuth, signIn, signOut, getAccessToken, getUserEmail, isSignedIn } from './auth.js';

const el = (id) => document.getElementById(id);

let sending = false;

// ---------- modals ----------

function openModal(id) {
  el(id).hidden = false;
}

function closeModal(id) {
  el(id).hidden = true;
}

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

// Explains the permission before Google's own popup appears, and gives the
// click that triggers the popup — a fresh user gesture, so it isn't blocked.
function promptSignIn() {
  return new Promise((resolve, reject) => {
    const continueBtn = el('signin-modal-continue');
    const closeBtn = el('signin-modal-close');
    const cleanup = () => {
      continueBtn.removeEventListener('click', onContinue);
      closeBtn.removeEventListener('click', onCancel);
      continueBtn.disabled = false;
      closeModal('signin-modal');
    };
    const onContinue = async () => {
      continueBtn.disabled = true;
      try {
        await signIn();
        cleanup();
        resolve();
      } catch (e) {
        cleanup();
        reject(e);
      }
    };
    const onCancel = () => {
      cleanup();
      reject(new Error('Sign-in cancelled'));
    };
    continueBtn.addEventListener('click', onContinue);
    closeBtn.addEventListener('click', onCancel);
    openModal('signin-modal');
  });
}

// Sign-in happens on demand, the first time a send needs it.
async function ensureSignedIn() {
  if (isSignedIn()) return;
  if (!gisReady) {
    throw new Error('Google Sign-In is still loading — try again in a moment.');
  }
  await promptSignIn();
  refreshAuthUi();
}

function showStudio(open) {
  el('landing').hidden = open;
  el('studio').hidden = !open;
  el('nav-get-started').hidden = open;
  el('studio-back-btn').hidden = !open;
}

function bindAuth() {
  el('get-started-btn').addEventListener('click', () => showStudio(true));
  el('nav-get-started').addEventListener('click', () => showStudio(true));
  // The brand and the explicit Back button both return to the landing/explanation; work is untouched.
  el('brand-home').addEventListener('click', (e) => {
    e.preventDefault();
    showStudio(false);
  });
  el('studio-back-btn').addEventListener('click', () => showStudio(false));
  el('signout-btn').addEventListener('click', () => {
    signOut();
    clearRunUi();
    refreshAuthUi();
  });
}

// Reset campaign UI so the next sign-in opens a clean studio: a stale report
// would otherwise survive (including a resume action bound to the previous
// account's remaining recipient list).
function clearRunUi() {
  closeModal('send-modal');
  el('send-modal-list').innerHTML = '';
  el('send-modal-fill').style.width = '0%';
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
  el('studio-back-btn').disabled = sending;
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

// Confirms the campaign inside the modal itself (rather than a native
// confirm()) so the whole send flow lives in one consistent surface.
function confirmSendModal(recipients, fromEmail) {
  return new Promise((resolve) => {
    el('send-modal-title').textContent = 'Send campaign?';
    el('send-modal-count').textContent = String(recipients.length);
    el('send-modal-from').textContent = fromEmail;
    el('send-modal-confirm-section').hidden = false;
    el('send-modal-progress-section').hidden = true;
    el('send-modal-send-btn').hidden = false;
    el('send-modal-cancel-btn').hidden = false;
    el('send-modal-resume-btn').hidden = true;
    el('send-modal-close-btn').hidden = true;
    el('send-modal-x').hidden = false;

    const sendBtn = el('send-modal-send-btn');
    const cancelBtn = el('send-modal-cancel-btn');
    const xBtn = el('send-modal-x');
    const cleanup = () => {
      sendBtn.removeEventListener('click', onSend);
      cancelBtn.removeEventListener('click', onCancel);
      xBtn.removeEventListener('click', onCancel);
    };
    const onSend = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); closeModal('send-modal'); resolve(false); };
    sendBtn.addEventListener('click', onSend);
    cancelBtn.addEventListener('click', onCancel);
    xBtn.addEventListener('click', onCancel);
    openModal('send-modal');
  });
}

function beginSendModalProgress(recipients) {
  el('send-modal-title').textContent = recipients.length === 1 ? 'Sending test email' : 'Sending campaign';
  el('send-modal-confirm-section').hidden = true;
  el('send-modal-progress-section').hidden = false;
  el('send-modal-send-btn').hidden = true;
  el('send-modal-cancel-btn').hidden = true;
  el('send-modal-resume-btn').hidden = true;
  el('send-modal-close-btn').hidden = true;
  el('send-modal-x').hidden = true;
  updateSendModal(recipients, [], recipients.length);
  openModal('send-modal');
}

function updateSendModal(recipients, results, total) {
  const list = el('send-modal-list');
  list.innerHTML = recipients.map((to, i) => {
    const r = results[i];
    if (r) {
      return r.ok
        ? `<div class="send-row is-sent"><span class="addr">${escapeHtml(to)}</span><span class="status-chip">Sent</span></div>`
        : `<div class="send-row is-failed"><span class="addr">${escapeHtml(to)}</span><span class="err">${escapeHtml(r.error)}</span><span class="status-chip">Failed</span></div>`;
    }
    if (i === results.length) {
      return `<div class="send-row is-sending"><span class="spinner"></span><span class="addr">${escapeHtml(to)}</span><span class="status-chip">Sending</span></div>`;
    }
    return `<div class="send-row is-pending"><span class="addr">${escapeHtml(to)}</span><span class="status-chip">Queued</span></div>`;
  }).join('');

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  el('stat-sent').textContent = String(sent);
  el('stat-sending').textContent = results.length < total ? '1' : '0';
  el('stat-failed').textContent = String(failed);
  el('send-modal-fill').style.width = `${Math.round((results.length / total) * 100)}%`;
}

function finishSendModal(recipients, { results, aborted, remaining }) {
  updateSendModal(recipients, results, recipients.length);
  el('send-modal-title').textContent = aborted ? 'Run stopped early (quota/rate limit)' : 'Done';
  el('send-modal-x').hidden = false;
  if (aborted && remaining.length > 0) {
    el('send-modal-resume-btn').hidden = false;
    el('send-modal-resume-btn').textContent = `Send to remaining ${remaining.length}`;
    el('send-modal-resume-btn').onclick = () => runSend(remaining);
    el('send-modal-close-btn').hidden = true;
  } else {
    el('send-modal-resume-btn').hidden = true;
    el('send-modal-close-btn').hidden = false;
    el('send-modal-close-btn').onclick = () => closeModal('send-modal');
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
  if (sending) return;
  const model = readModel();
  if (!model.subject.trim()) {
    alert('Please enter a subject before sending.');
    return;
  }
  // Lock from the instant of the click: the sign-in popup below can stay open
  // for a while, and a second click during that window must not start a
  // concurrent run (which would double-send to every recipient).
  sending = true;
  setFormLocked(true);
  refreshSendButtons();
  try {
    try {
      await ensureSignedIn();
    } catch (e) {
      if (e.message !== 'Sign-in cancelled') {
        alert(`Sign-in is needed to send: ${e.message}`);
      }
      return;
    }
    const recipients = target === 'self' ? [getUserEmail()] : target;
    if (confirmCampaign) {
      const confirmed = await confirmSendModal(recipients, getUserEmail());
      if (!confirmed) return;
    }
    beginSendModalProgress(recipients);
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
        onProgress: ({ results, total }) => updateSendModal(recipients, results, total)
      });
      finishSendModal(recipients, outcome);
    } catch (e) {
      finishSendModal(recipients, { results: [{ to: recipients[0], ok: false, error: e.message }], aborted: true, remaining: recipients.slice(1) });
    }
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
