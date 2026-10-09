// ============================================================
// state.js — Stato globale mutabile
// ============================================================

const today = new Date();
today.setHours(0, 0, 0, 0);

const baseMonth = new Date(today.getFullYear(), today.getMonth(), 1);
const maxMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

export const state = {
  currentField: 'tennis',
  loggedUser: null,
  keyboxCodeTennis: null,
  keyboxCodePadel: null,

  today,
  baseMonth,
  maxMonth,

  viewMonth: new Date(baseMonth),
  selectedDate: null,
  bookingsCache: {},

  adminMode: false,
  currentUserTab: 'tesserati',
  currentPrenotazioniTipo: 'tesserato',
  userDataCache: {},

  richiesteCache: [],
  filtroStatoRichieste: 'nuova',

  selectedModalita: null,
};
