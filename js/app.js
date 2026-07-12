import { initComposer, onModelChange, readModel, applyDraft, getImages } from './composer.js';
import { renderEmail } from './renderer.js';
import { saveDraft, loadDraft } from './storage.js';

function updatePreview(model) {
  const { logoUrl, contentUrl } = getImages();
  const { html } = renderEmail(model, { logo: logoUrl, content: contentUrl });
  document.getElementById('preview-frame').srcdoc = html;
}

function init() {
  initComposer();

  const draft = loadDraft();
  if (draft) applyDraft(draft);

  onModelChange((model) => {
    saveDraft(model);
    updatePreview(model);
  });

  updatePreview(readModel());
}

init();
