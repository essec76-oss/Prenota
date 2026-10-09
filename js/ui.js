// ============================================================
// ui.js — Funzioni di rendering dell'interfaccia utente
// ============================================================

import { FIELDS } from './config.js';
import { state } from './state.js';

// ---------- SHOW / HIDE AUTH ----------
export function showAuthUI() {
  document.getElementById('auth-section').style.display = 'block';
  document.getElementById('logged-in-extras').style.display = 'none';
  document.getElementById('logged-in-extras-bottom').style.display = 'none';
}

export function showLoggedInUI() {
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('logged-in-extras').style.display = 'block';
  document.getElementById('logged-in-extras-bottom').style.display = 'block';
}

// ---------- ACCENT ----------
export function setAccent(field) {
  const f = FIELDS[field];
  document.documentElement.style.setProperty(
    '--accent',
    getComputedStyle(document.documentElement).getPropertyValue(f.color)
  );
  document.documentElement.style.setProperty(
    '--accent-soft',
    getComputedStyle(document.documentElement).getPropertyValue(f.colorSoft)
  );
}

// ---------- EXPIRY ----------
export function renderGuestExpiry() {
  const el = document.getElementById('guest-expiry');
  const loggedUser = state.loggedUser;
  if (!loggedUser || loggedUser.tipo !== 'ospite' || !loggedUser.scadenza) {
    el.style.display = 'none';
    return;
  }
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const scad = new Date(loggedUser.scadenza + 'T00:00:00');
  const giorniResidui = Math.round((scad - oggi) / (1000 * 60 * 60 * 24));
  const dataFmt = scad.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  let testo;
  if (giorniResidui <= 0) {
    testo = '⏳ Il tuo accesso come ospite scade oggi.';
  } else if (giorniResidui === 1) {
    testo = '⏳ Il tuo accesso come ospite scade domani (' + dataFmt + ').';
  } else {
    testo = '⏳ Il tuo accesso come ospite scade tra ' + giorniResidui + ' giorni (' + dataFmt + ').';
  }
  el.textContent = testo;
  el.classList.toggle('urgent', giorniResidui <= 1);
  el.style.display = 'block';
}

export function renderTesseratoExpiry() {
  const el = document.getElementById('tesserato-expiry');
  if (!el) return;
  const loggedUser = state.loggedUser;
  if (!loggedUser || loggedUser.tipo !== 'tesserato' || !loggedUser.scadenza) {
    el.style.display = 'none';
    return;
  }
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const scad = new Date(loggedUser.scadenza + 'T00:00:00');
  const giorniResidui = Math.round((scad - oggi) / (1000 * 60 * 60 * 24));
  const dataFmt = scad.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  let testo, colore;
  if (giorniResidui < 0) {
    testo = '⚠️ Tessera scaduta il ' + dataFmt;
    colore = '#B84B1E';
  } else if (giorniResidui === 0) {
    testo = '⚠️ La tessera scade OGGI (' + dataFmt + ')';
    colore = '#B84B1E';
  } else if (giorniResidui <= 7) {
    testo = '⏳ La tessera scade tra ' + giorniResidui + ' giorni (' + dataFmt + ')';
    colore = '#D68A2A';
  } else if (giorniResidui <= 30) {
    testo = '📅 Tessera valida fino al ' + dataFmt + ' (tra ' + giorniResidui + ' giorni)';
    colore = '#2B6E5A';
  } else {
    testo = '✅ Tessera valida fino al ' + dataFmt;
    colore = '#2B6E5A';
  }
  el.textContent = testo;
  el.style.color = colore;
  el.style.display = 'block';
}

// ---------- FIELD NOTE ----------
export function canBookField(field) {
  const loggedUser = state.loggedUser;
  if (!loggedUser) return false;
  if (field === 'tennis') return !!loggedUser.is_tennis_member;
  if (field === 'padel') return !!loggedUser.is_padel_member;
  return false;
}

export function isOwnBooking(booking) {
  const loggedUser = state.loggedUser;
  if (!loggedUser) return false;
  if (loggedUser.tipo === 'tesserato') return booking.tesserato_id === loggedUser.id;
  if (loggedUser.tipo === 'ospite') return booking.ospite_id === loggedUser.id;
  return false;
}

export function renderFieldNote() {
  const note = state.currentField === 'tennis'
    ? 'Puoi prenotare slot da 1 ora. Basta anche solo il tuo nome (Allenamento), oppure aggiungi fino a 4 giocatori.'
    : 'Puoi prenotare slot da 1 ora e mezza. Servono esattamente 4 nomi per prenotare.';
  const noteEl = document.getElementById('field-note');
  if (state.loggedUser && !canBookField(state.currentField)) {
    noteEl.textContent = '⚠️ Non sei abilitato per ' + (state.currentField === 'tennis' ? 'il tennis' : 'il padel') + ': puoi vedere il calendario ma non prenotare questo campo.';
    noteEl.classList.add('warning');
  } else {
    noteEl.textContent = note;
    noteEl.classList.remove('warning');
  }
}

// ---------- BADGE UTENTE ----------
export function renderUserBadge() {
  const loggedUser = state.loggedUser;
  const tipoLabel = loggedUser.tipo === 'tesserato'
    ? '<span class="badge-tesserato">⭐ Tesserato</span>'
    : '<span class="badge-ospite">Ospite</span>';
  document.getElementById('user-name-display').textContent = loggedUser.nome + ' ' + loggedUser.cognome;
  document.getElementById('user-badge').innerHTML = tipoLabel;
}

// ---------- CLEAN BTN ----------
export function updateCleanBtnVisibility() {
  const btn = document.getElementById('clean-btn');
  if (btn) btn.style.display = (state.loggedUser && state.loggedUser.is_admin) ? 'inline-block' : 'none';
}

// ---------- UPDATE COURT IMAGE ----------
export function updateCourtImage(field) {
  const img = document.getElementById('court-image');
  if (!img) return;
  const src = field === 'tennis' ? 'campo-tennis.jpg' : 'campo-padel.jpg';
  const alt = field === 'tennis' ? 'Schema dimensioni campo da tennis' : 'Schema dimensioni campo da padel';
  img.style.opacity = '0';
  setTimeout(function () {
    img.src = src;
    img.alt = alt;
    img.style.opacity = '1';
  }, 300);
}

// ---------- SWITCH FIELD ----------
export async function switchField(field) {
  state.currentField = field;
  document.getElementById('tab-tennis').classList.toggle('active', field === 'tennis');
  document.getElementById('tab-padel').classList.toggle('active', field === 'padel');
  document.getElementById('tab-tennis').setAttribute('aria-selected', field === 'tennis');
  document.getElementById('tab-padel').setAttribute('aria-selected', field === 'padel');
  setAccent(field);
  renderFieldNote();
  updateCourtImage(field);
  state.bookingsCache = {};

  // Import dinamici per evitare dipendenze circolari
  const { renderCalendar, updateBookingDots } = await import('./calendar.js');
  const { renderSlots } = await import('./slots.js');
  renderSlots();
  updateBookingDots();
}
