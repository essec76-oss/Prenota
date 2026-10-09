// ============================================================
// cancel.js — Cancellazione prenotazioni + mostra codice personale
// ============================================================

import { state } from './state.js';
import { showToast, closeModal, escapeHtml } from './utils.js';
import { deleteBooking, adminDeleteBooking, fetchOwnCode } from './api.js';
import { updateBookingDots } from './calendar.js';
import { showCodeModal, renderSlots } from './slots.js';

export function openCancelModal(slot, timeId, booking) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
        <h2 id="cancel-title">Cancella prenotazione</h2>
        <div class="meta">${new Date(state.selectedDate + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} · ${slot.label}</div>
        <div class="name-field">
          <label for="cancel-code">Inserisci il codice a 4 cifre di cancellazione (lo trovi sulla riga della tua prenotazione)</label>
          <input id="cancel-code" type="text" inputmode="numeric" maxlength="4" autocomplete="off" />
        </div>
        <div class="form-error" id="form-error"></div>
        <div class="modal-actions">
          <button class="btn-cancel" id="btn-cancel">Indietro</button>
          <button class="btn-confirm" id="btn-confirm">Cancella prenotazione</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('btn-confirm').addEventListener('click', () => doCancelBooking(booking));
}

export async function doCancelBooking(booking) {
  const errorEl = document.getElementById('form-error');
  const typedCode = document.getElementById('cancel-code').value.trim();
  if (!/^\d{4}$/.test(typedCode)) {
    errorEl.textContent = 'Inserisci un codice di 4 cifre.';
    return;
  }

  const confirmBtn = document.getElementById('btn-confirm');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Cancello…';

  const { ok, status, data } = await deleteBooking(booking.id, typedCode);

  if (!ok || !data.success) {
    if (status === 403) {
      errorEl.textContent = 'Codice errato. Riprova.';
    } else if (status === 404) {
      errorEl.textContent = 'Prenotazione non trovata. Forse è già stata cancellata.';
    } else {
      errorEl.textContent = data.error || 'Errore nella cancellazione. Riprova.';
    }
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Cancella prenotazione';
    return;
  }

  closeModal();
  showToast('Prenotazione cancellata');
  updateBookingDots();
  renderSlots();
}

export async function doAdminCancel(bookingId, slotLabel) {
  if (!confirm('⚠️ Sei sicuro di voler cancellare questa prenotazione come ADMIN?\n\n' + slotLabel)) {
    return;
  }
  const accessToken = state.loggedUser && state.loggedUser.accessToken;
  const ok = await adminDeleteBooking(bookingId, accessToken);
  if (ok) {
    showToast('✅ Prenotazione cancellata (admin)');
    renderSlots();
    updateBookingDots();
  } else {
    showToast('❌ Errore nella cancellazione admin');
  }
}

export async function fetchAndShowOwnCode(bookingId) {
  if (!state.loggedUser) {
    showToast('❌ Devi essere loggato per vedere il codice.');
    return;
  }
  if (!state.loggedUser.accessToken) {
    showToast('❌ Sessione sicura non attiva. Esci e rifai il login, poi riprova.');
    return;
  }
  try {
    const { ok, data } = await fetchOwnCode(bookingId, state.loggedUser.codice, state.loggedUser.accessToken);
    if (!ok || !data.success) {
      showToast('❌ ' + (data.error || 'Impossibile leggere il codice'));
      return;
    }
    showCodeModal(data.code);
  } catch (e) {
    console.error('Errore recupero codice:', e);
    showToast('❌ Errore di connessione');
  }
}
