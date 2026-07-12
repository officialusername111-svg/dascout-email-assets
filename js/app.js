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
  const { logoUrl, contentUrl } = getImages();
  const { html } = renderEmail(model, { logo: logoUrl, content: contentUrl });
  el('preview-frame').srcdoc = html;
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
  refreshSendButtons();
}

function refreshSendButtons() {
  const { valid, invalid } = recipientState();
  const signedIn = isSignedIn();
  el('test-send-btn').disabled = sending || !signedIn;
  el('send-btn').disabled = sending || !signedIn || valid.length === 0 || invalid.length > 0;
}

// ---------- sending ----------

async function collectAttachmentsAndHtml(model) {
  const { logoFile, contentFile } = getImages();
  const attachments = [];
  const srcs = { logo: null, content: null };
  if (logoFile) {
    attachments.push({ cid: 'logo', mimeType: logoFile.type, base64: await fileToBase64(logoFile) });
    srcs.logo = 'cid:logo';
  }
  if (contentFile) {
    attachments.push({ cid: 'content', mimeType: contentFile.type, base64: await fileToBase64(contentFile) });
    srcs.content = 'cid:content';
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
  el('report').hidden = false;
  el('report').innerHTML = `${headline}<ul>${items.join('')}</ul>`;
}

async function runSend(recipients) {
  const model = readModel();
  if (!model.subject.trim()) {
    alert('Please enter a subject before sending.');
    return;
  }
  sending = true;
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
  });

  bindAuth();
  bindSend();

  updatePreview(readModel());
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
