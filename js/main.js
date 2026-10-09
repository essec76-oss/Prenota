// ============================================================
// main.js — Entry point dell'applicazione
// ============================================================
// Importa tutti i moduli e avvia l'app quando il DOM è pronto.
// ============================================================

import { state } from './state.js';
import { showAuthUI, setAccent, renderFieldNote } from './ui.js';
import { renderDow, renderCalendar } from './calendar.js';
import { prefillLastCodice } from './auth.js';
import { setupEventListeners, updateCleanBtnVisibility } from './events.js';

// ---------- DISABILITA LOG DI DEBUG IN PRODUZIONE ----------
// (mantiene warn/error attivi per il debug)
(function silenceLogsInProduction() {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  if (!isLocal) {
    const noop = () => {};
    console.log = noop;
  }
})();

// ---------- INIT ----------
document.addEventListener('DOMContentLoaded', function () {
  // Precompila il codice salvato
  prefillLastCodice();

  // Mostra UI iniziale (non loggato)
  showAuthUI();

  // Applica l'accent di default (tennis)
  setAccent(state.currentField);
  renderFieldNote();
  renderDow();
  renderCalendar();

  // Aggiorna visibilità bottone "clean" (di norma nascosto)
  updateCleanBtnVisibility();

  // Attacca tutti gli event listener
  setupEventListeners();

  console.log('🚀 App avviata');
});
