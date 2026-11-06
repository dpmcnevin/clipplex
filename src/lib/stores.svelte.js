/** Shared UI state. Runes work in a .svelte.js module, so this is plain state
 *  that any component can read and write without a store wrapper. */

export const toast = $state({
  open: false,
  message: "",
  link: "",
  kind: ""
});

export const overlay = $state({
  open: false,
  text: "",
  stage: "",
  progress: null
});

let timer = null;

export function showToast(message, kind = "", { link = "", sticky = false } = {}) {
  toast.message = message;
  toast.link = link;
  toast.kind = kind;
  toast.open = true;
  clearTimeout(timer);
  if (!sticky) timer = setTimeout(() => (toast.open = false), 8000);
}

export const hideToast = () => {
  clearTimeout(timer);
  toast.open = false;
};

export function showOverlay(text) {
  overlay.text = text;
  overlay.stage = "";
  overlay.progress = null;
  overlay.open = true;
}

export function setProgress(stage, progress) {
  overlay.stage = stage;
  overlay.progress = progress;
}

export const hideOverlay = () => {
  overlay.open = false;
  overlay.progress = null;
};
