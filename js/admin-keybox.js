// ============================================================
// admin-keybox.js — Gestione codici Key Box (admin)
// ============================================================

import { state } from './state.js';
import { showToast, closeModal } from './utils.js';
import { loadKeyboxCodes, updateKeybox } from './api.js';
import { renderSlots } from './slots.js';

export async function openKeyboxManagement() {
  const keybox = await loadKeyboxCodes(state.loggedUser.accessToken);
  state.keyboxCodeTennis = keybox.tennis;
  state.keyboxCodePadel = keybox.padel;

  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="keybox-title">
        <h2 id="keybox-title">🔑 Codici Key Box</h2>
        <p class="modal-subtitle">Il codice attuale è mostrato a tutti su ogni prenotazione, in base al campo (tennis o padel). Cambiali qui quando le combinazioni cambiano.</p>
        <div class="name-field">
          <label for="keybox-input-tennis">Nuovo codice Tennis</label>
          <input id="keybox-input-tennis" type="text" placeholder="Es. 1234" autocomplete="off" value="${state.keyboxCodeTennis || ''}" />
        </div>
        <div class="name-field">
          <label for="keybox-input-padel">Nuovo codice Padel</label>
          <input id="keybox-input-padel" type="text" placeholder="Es. 1234" autocomplete="off" value="${state.keyboxCodePadel || ''}" />
        </div>
        <div class="form-error" id="keybox-error"></div>
        <div class="modal-actions">
          <button class="btn-cancel" id="keybox-cancel">Annulla</button>
          <button class="btn-confirm" id="keybox-save">💾 Aggiorna codici</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('keybox-cancel').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('keybox-save').addEventListener('click', handleUpdateKeybox);
}

async function handleUpdateKeybox() {
  const errorEl = document.getElementById('keybox-error');
  const nuovoCodiceTennis = document.getElementById('keybox-input-tennis').value.trim();
  const nuovoCodicePadel = document.getElementById('keybox-input-padel').value.trim();
  const saveBtn = document.getElementById('keybox-save');

  if (!nuovoCodiceTennis || !nuovoCodicePadel) {
    errorEl.textContent = 'Entrambi i codici sono obbligatori.';
    return;
  }
  if (!state.loggedUser || !state.loggedUser.accessToken) {
    errorEl.textContent = '❌ Solo un admin con login sicuro attivo può modificare i codici.';
    return;
  }
  if (!state.adminMode) {
    errorEl.textContent = '❌ Attiva prima la modalità Admin (checkbox).';
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvo...';
  errorEl.textContent = '';

  const { ok, data } = await updateKeybox(nuovoCodiceTennis, nuovoCodicePadel, state.loggedUser.accessToken);

  if (!ok) {
    errorEl.textContent = '❌ Errore: ' + (data.error || 'aggiornamento fallito');
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Aggiorna codici';
    return;
  }
  state.keyboxCodeTennis = data.codice_keybox_tennis;
  state.keyboxCodePadel = data.codice_keybox_padel;
  showToast('✅ Codici Key Box aggiornati');
  closeModal();
  renderSlots();
}
