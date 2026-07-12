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

function refreshAuthUi() {
  const signedIn = isSignedIn();
  el('signin-btn').hidden = signedIn;
  el('signout-btn').hidden = !signedIn;
  el('user-email').hidden = !signedIn;
  el('user-email').textContent = signedIn ? getUserEmail() : '';
  refreshSendButtons();
}

function bindAuth() {
  el('signin-btn').addEventListener('click', async () => {
    try {
      await signIn();
    } catch (e) {
      alert(`Sign-in failed: ${e.message}`);
    }
    refreshAuthUi();
  });
  el('signout-btn').addEventListener('click', () => {
    signOut();
    refreshAuthUi();
  });
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
  const signedIn = isSignedIn();
  el('test-send-btn').disabled = sending || !signedIn;
  el('send-btn').disabled = sending || !signedIn || valid.length === 0 || invalid.length > 0 || ctaProblem(readModel()) !== null;
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

async function runSend(recipients) {
  const model = readModel();
  if (!model.subject.trim()) {
    alert('Please enter a subject before sending.');
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
    refreshSendButtons();
  }
}

function bindSend() {
  el('recipients').addEventListener('input', refreshRecipientsFeedback);

  el('test-send-btn').addEventListener('click', () => {
    runSend([getUserEmail()]);
  });

  el('send-btn').addEventListener('click', () => {
    const { valid } = recipientState();
    if (!confirm(`Send this email to ${valid.length} recipient(s) from ${getUserEmail()}?`)) return;
    runSend(valid);
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

  updatePreview(readModel());
  refreshCtaFeedback(readModel());
  refreshRecipientsFeedback();

  // GIS script is async — poll briefly until it's available.
  const gisReady = setInterval(() => {
    if (window.google && google.accounts && google.accounts.oauth2) {
      clearInterval(gisReady);
      initAuth();
      refreshAuthUi();
    }
  }, 100);
}

init();
