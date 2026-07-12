// Bridges the form DOM and the email model. Owns file inputs and object URLs.

const FIELDS = {
  subject: 'subject',
  headline: 'headline',
  bodyText: 'body-text',
  ctaText: 'cta-text',
  ctaUrl: 'cta-url',
  footerText: 'footer-text',
  brandColor: 'brand-color',
  align: 'align',
  fontFamily: 'font-family',
  headingColor: 'heading-color',
  textColor: 'text-color',
  bgMode: 'bg-mode',
  bgDirection: 'bg-direction',
  bgColor1: 'bg-color-1',
  bgColor2: 'bg-color-2',
  bgColor3: 'bg-color-3',
  headlineSize: 'headline-size',
  bodySize: 'body-size',
  footerSize: 'footer-size'
};

const CHECKBOXES = {
  showHeaderLogo: 'show-header-logo',
  showFooterLogo: 'show-footer-logo'
};

let logoFile = null;
let contentFile = null;
let footerLogoFile = null;
let logoUrl = null;
let contentUrl = null;
let footerLogoUrl = null;
let changeHandler = null;
let debounceTimer = null;

function el(id) {
  return document.getElementById(id);
}

export function readModel() {
  const model = {};
  for (const [key, id] of Object.entries(FIELDS)) {
    model[key] = el(id).value;
  }
  for (const [key, id] of Object.entries(CHECKBOXES)) {
    model[key] = el(id).checked;
  }
  return model;
}

export function applyDraft(model) {
  for (const [key, id] of Object.entries(FIELDS)) {
    if (typeof model[key] === 'string') el(id).value = model[key];
  }
  for (const [key, id] of Object.entries(CHECKBOXES)) {
    if (typeof model[key] === 'boolean') el(id).checked = model[key];
  }
}

export function getImages() {
  return { logoFile, contentFile, footerLogoFile, logoUrl, contentUrl, footerLogoUrl };
}

function emitChange() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (changeHandler) changeHandler(readModel());
  }, 150);
}

function bindFileInput(inputId, statusId, setFile) {
  el(inputId).addEventListener('change', (e) => {
    const file = e.target.files[0] || null;
    setFile(file);
    el(statusId).textContent = file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : 'No file selected';
    emitChange();
  });
}

export function onModelChange(handler) {
  changeHandler = handler;
}

export function initComposer() {
  for (const id of Object.values(FIELDS)) {
    el(id).addEventListener('input', emitChange);
  }
  for (const id of Object.values(CHECKBOXES)) {
    el(id).addEventListener('change', emitChange);
  }
  bindFileInput('logo-file', 'logo-status', (f) => {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    logoFile = f;
    logoUrl = f ? URL.createObjectURL(f) : null;
  });
  bindFileInput('content-file', 'content-status', (f) => {
    if (contentUrl) URL.revokeObjectURL(contentUrl);
    contentFile = f;
    contentUrl = f ? URL.createObjectURL(f) : null;
  });
  bindFileInput('footer-logo-file', 'footer-logo-status', (f) => {
    if (footerLogoUrl) URL.revokeObjectURL(footerLogoUrl);
    footerLogoFile = f;
    footerLogoUrl = f ? URL.createObjectURL(f) : null;
  });
}
