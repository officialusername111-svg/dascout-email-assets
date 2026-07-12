// localStorage draft persistence. Text/settings only — never images.
const KEY = 'dascout-emailing-draft';

export function saveDraft(model) {
  try {
    localStorage.setItem(KEY, JSON.stringify(model));
  } catch {
    // Storage full or blocked — autosave is best-effort.
  }
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
