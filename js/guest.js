// ============================================================
// guest.js — Registrazione ospite + contatore posti rimasti
// ============================================================

import { showToast, closeModal, escapeHtml } from './utils.js';
import { createGuest, loadGuestSlots } from './api.js';

export async function loadGuestSlotsCounter() {
  const el = document.getElementById('guest-slots-counter');
  if (!el) return;
  try {
    const data = await loadGuestSlots();

    // Se l'API non risponde (es. GitHub Pages senza backend) nascondi il box
    if (data === null || data === undefined || typeof data.rimasti !== 'number') {
      el.style.display = 'none';
      return;
    }

    el.style.display = 'block';

    if (data.rimasti <= 0) {
      el.textContent = '⛔ Limite giornaliero raggiunto. Riprova domani.';
      el.classList.add('esaurito');
    } else {
      const plurale = data.rimasti === 1 ? 'o' : 'i';
      el.textContent = '⏳ Rimangono ancora ' + data.rimasti + ' post' + plurale + ' disponibil' + plurale + ' per oggi, affrettati! Iscriviti subito.';
      el.classList.remove('esaurito');
    }
  } catch (e) {
    console.error('Errore caricamento posti rimasti:', e);
    // In caso di errore, nascondi il contatore (non mostrare "undefined")
    el.style.display = 'none';
  }
}

export function openGuestRegisterModal() {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="guest-reg-title">
        <h2 id="guest-reg-title">Crea profilo ospite</h2>
        <p class="modal-subtitle">Crea il tuo profilo in pochi secondi.</p>
        <div class="name-field">
          <label for="guest-nome">Nome *</label>
          <input id="guest-nome" type="text" placeholder="Il tuo nome" autocomplete="given-name" />
        </div>
        <div class="name-field">
          <label for="guest-cognome">Cognome *</label>
          <input id="guest-cognome" type="text" placeholder="Il tuo cognome" autocomplete="family-name" />
        </div>
        <div class="name-field">
          <label for="guest-telefono">Numero di telefono *</label>
          <input id="guest-telefono" type="tel" placeholder="Es. 3331234567" autocomplete="tel" />
        </div>
        <div class="name-field">
          <label for="guest-sport">Sport</label>
          <select id="guest-sport">
            <option value="both">Tennis + Padel</option>
            <option value="tennis">Solo Tennis</option>
            <option value="padel">Solo Padel</option>
          </select>
        </div>
        <div class="form-error" id="guest-reg-error"></div>
        <div class="modal-actions">
          <button class="btn-cancel" id="guest-reg-cancel">Annulla</button>
        </div>
        <button class="btn-guest-code" id="guest-create-code-btn" style="margin-top:10px;">
          Crea codice id
        </button>
      </div>
    </div>
  `;
  document.getElementById('guest-reg-cancel').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('guest-create-code-btn').addEventListener('click', handleCreateGuestProfile);
}

async function handleCreateGuestProfile() {
  const errorEl = document.getElementById('guest-reg-error');
  const nome = document.getElementById('guest-nome').value.trim();
  const cognome = document.getElementById('guest-cognome').value.trim();
  const telefono = document.getElementById('guest-telefono').value.trim();
  const sport = document.getElementById('guest-sport').value;

  if (!nome || !cognome || !telefono) {
    errorEl.textContent = 'Nome, Cognome e Numero di telefono sono obbligatori.';
    return;
  }

  const { ok, data } = await createGuest(nome, cognome, sport, telefono);
  if (!ok || !data.success) {
    errorEl.textContent = data.error || 'Registrazione non riuscita.';
    return;
  }

  closeModal();
  showGuestCodeModal(data.codice, nome, cognome, data.scadenza);
  loadGuestSlotsCounter();
}

function showGuestCodeModal(codice, nome, cognome, scadenza) {
  const dataFmt = new Date(scadenza + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay-welcome" id="overlay">
      <div class="modal-welcome" role="dialog" aria-modal="true">
        <div class="welcome-icon">🎾</div>
        <h2>Benvenuto/a, ${escapeHtml(nome)}!</h2>
        <p class="welcome-text">Il tuo profilo ospite è pronto. Da oggi puoi vedere il calendario e prenotare liberamente tennis e padel per le prossime <strong>2 settimane</strong>, fino al <strong>${dataFmt}</strong>.</p>
        <p style="text-align:center;margin:14px 0 4px;font-size:14px;color:var(--ink-soft);">Il tuo codice di accesso personale:</p>
        <div class="booking-code">${codice}</div>
        <div class="save-warning">📸 Salva subito questo codice sul tuo telefono (ad esempio con uno screenshot): ti servirà ogni volta per accedere e prenotare.</div>
        <div class="modal-actions">
          <button class="btn-confirm" id="guest-code-ok" style="flex:none;width:100%;">Ho salvato il codice</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('guest-code-ok').addEventListener('click', function () {
    closeModal();
    const loginInput = document.getElementById('login-codice');
    if (loginInput) {
      loginInput.value = codice;
      loginInput.type = 'text';
    }
    showToast('Ora puoi accedere con il tuo codice');
  });
}
