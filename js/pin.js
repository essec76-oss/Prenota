// ============================================================
// pin.js — Gestione PIN (scelta, generazione, cambio)
// ============================================================

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { state } from './state.js';
import { showToast, closeModal, escapeHtml } from './utils.js';
import { signInWithSupabaseAuth } from './api.js';

// Lista nera PIN troppo banali
const PIN_NERI = [
  '000000', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999',
  '123456', '654321', '123123', '112233', '121212', '012345', '543210',
  '123450', '098765', '101010', '202020', '131313'
];

export function isPinValido(pin) {
  if (!/^\d{6}$/.test(pin)) return { ok: false, motivo: 'Il PIN deve essere di 6 cifre (0-9).' };
  if (PIN_NERI.includes(pin)) return { ok: false, motivo: 'Questo PIN è troppo semplice. Scegline un altro.' };
  // Blocca anche 6 cifre tutte uguali o sequenze troppo ovvie
  const cifre = pin.split('');
  if (cifre.every(c => c === cifre[0])) return { ok: false, motivo: 'Il PIN non può avere tutte le cifre uguali.' };
  return { ok: true };
}

export function generaPinCasuale() {
  let pin;
  do {
    pin = '';
    for (let i = 0; i < 6; i++) pin += Math.floor(Math.random() * 10);
  } while (!isPinValido(pin).ok);
  return pin;
}

// Imposta il PIN su Supabase Auth per l'utente loggato.
// Deve essere già loggato (ha accessToken).
export async function impostaPin(codice, pin) {
  if (!state.loggedUser || !state.loggedUser.accessToken) {
    return { ok: false, error: 'Sessione non attiva. Rifai il login.' };
  }

  // Chiama la Edge Function 'super-endpoint' che aggiorna la password di Auth
  // a codice:pin. Il pin viene passato in modo sicuro via HTTPS.
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/super-endpoint', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ codice, pin })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { ok: false, error: data.error || 'Errore impostazione PIN' };
    }
  } catch (e) {
    return { ok: false, error: 'Errore di rete: ' + (e.message || 'sconosciuto') };
  }

  // Aggiorna il DB: pin_set = true
  const isTesserato = codice.startsWith('t');
  const table = isTesserato ? 'Tesserati' : 'Ospiti';
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?codice=eq.' + encodeURIComponent(codice), {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
        'Authorization': 'Bearer ' + state.loggedUser.accessToken
      },
      body: JSON.stringify({ pin_set: true })
    });
    if (!res.ok) {
      return { ok: false, error: 'PIN impostato ma errore salvataggio stato. Contatta l\'admin.' };
    }
  } catch (e) {
    return { ok: false, error: 'Errore di rete: ' + (e.message || 'sconosciuto') };
  }

  // Aggiorna lo stato locale
  state.loggedUser.pin_set = true;
  return { ok: true };
}

// Mostra la schermata "scegli PIN" in modale.
// `obbligatorio = true` → non si può chiudere senza scegliere.
// `onComplete` viene chiamato quando l'utente ha scelto il PIN.
export function mostraSceltaPin(obbligatorio, onComplete) {
  const root = document.getElementById('modal-root');
  const nome = state.loggedUser ? (state.loggedUser.nome + ' ' + state.loggedUser.cognome) : '';

  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" style="max-width:480px;">
        <h2>🔐 Scegli il tuo PIN</h2>
        <p class="modal-subtitle">
          Ciao <strong>${escapeHtml(nome)}</strong>! Per proteggere il tuo account,
          scegli un PIN di <strong>6 cifre</strong>. Lo userai insieme al tuo codice
          ad ogni accesso.
        </p>

        <div class="name-field">
          <label for="pin-nuovo">Nuovo PIN (6 cifre)</label>
          <input id="pin-nuovo" type="password" inputmode="numeric" maxlength="6"
                 placeholder="••••••" autocomplete="new-password"
                 style="font-size:24px; letter-spacing:8px; text-align:center; font-family:monospace;" />
        </div>

        <div class="name-field">
          <label for="pin-conferma">Conferma PIN</label>
          <input id="pin-conferma" type="password" inputmode="numeric" maxlength="6"
                 placeholder="••••••" autocomplete="new-password"
                 style="font-size:24px; letter-spacing:8px; text-align:center; font-family:monospace;" />
        </div>

        <div style="background:var(--accent-soft);border-radius:8px;padding:12px;margin-bottom:12px;font-size:13px;color:var(--ink-soft);line-height:1.5;">
          💡 <strong>Suggerimenti</strong>:<br>
          • Scegli un PIN che ricordi facilmente<br>
          • Non usare <code>123456</code>, <code>000000</code>, o date di nascita<br>
          • Se lo dimentichi, chiedi all'admin di resettarlo
        </div>

        <div style="text-align:center;margin-bottom:12px;">
          <button type="button" id="pin-genera" style="background:none;border:none;color:var(--accent);font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;text-decoration:underline;">
            🎲 Genera un PIN casuale per me
          </button>
        </div>

        <div class="form-error" id="pin-error"></div>

        <div class="modal-actions">
          ${obbligatorio ? '' : '<button class="btn-cancel" id="pin-annulla">Più tardi</button>'}
          <button class="btn-confirm" id="pin-salva">✅ Salva PIN</button>
        </div>
      </div>
    </div>
  `;

  const nuovoEl = document.getElementById('pin-nuovo');
  const confermaEl = document.getElementById('pin-conferma');
  const errorEl = document.getElementById('pin-error');
  const salvaBtn = document.getElementById('pin-salva');

  // Solo cifre
  [nuovoEl, confermaEl].forEach(el => {
    el.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 6);
    });
  });

  nuovoEl.focus();

  // Bottone "Genera casuale"
  document.getElementById('pin-genera').addEventListener('click', function () {
    const pin = generaPinCasuale();
    nuovoEl.value = pin;
    confermaEl.value = pin;
    errorEl.textContent = '🎲 PIN generato: ' + pin + ' — scrivilo da qualche parte!';
    errorEl.style.color = 'var(--padel)';
    setTimeout(() => { errorEl.style.color = ''; }, 4000);
  });

  // Annulla (solo se non obbligatorio)
  const annullaBtn = document.getElementById('pin-annulla');
  if (annullaBtn) {
    annullaBtn.addEventListener('click', function () {
      closeModal();
      if (typeof onComplete === 'function') onComplete(false);
    });
  }

  // Salva
  salvaBtn.addEventListener('click', async function () {
    const pin1 = nuovoEl.value.trim();
    const pin2 = confermaEl.value.trim();

    if (pin1 !== pin2) {
      errorEl.textContent = 'I due PIN non coincidono.';
      errorEl.style.color = '';
      return;
    }

    const validazione = isPinValido(pin1);
    if (!validazione.ok) {
      errorEl.textContent = validazione.motivo;
      errorEl.style.color = '';
      return;
    }

    errorEl.textContent = '';
    salvaBtn.disabled = true;
    salvaBtn.textContent = 'Salvo…';

    const result = await impostaPin(state.loggedUser.codice, pin1);
    if (!result.ok) {
      errorEl.textContent = '❌ ' + result.error;
      salvaBtn.disabled = false;
      salvaBtn.textContent = '✅ Salva PIN';
      return;
    }

    closeModal();
    showToast('🔐 PIN impostato con successo!');
    if (typeof onComplete === 'function') onComplete(true);
  });
}
