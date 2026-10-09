// ============================================================
// utils.js — Utility generiche
// ============================================================

export function pad(n) {
  return n.toString().padStart(2, '0');
}

export function dateKey(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function fmtTime(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return pad(hh) + ':' + pad(mm);
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function showToast(msg) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  root.innerHTML = '<div class="toast">' + escapeHtml(msg) + '</div>';
  setTimeout(() => { root.innerHTML = ''; }, 2600);
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

export function scrollToAuth() {
  const authSection = document.getElementById('auth-section');
  if (!authSection) return;
  authSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const input = document.getElementById('login-codice');
  if (input) setTimeout(() => input.focus(), 300);
}

export function copiaLink() {
  const link = window.location.href;
  navigator.clipboard.writeText(link).then(function () {
    const msg = document.getElementById('messaggio-copia');
    if (msg) {
      msg.innerText = 'Link copiato negli appunti!';
      setTimeout(function () { msg.innerText = ''; }, 2000);
    }
  });
}
