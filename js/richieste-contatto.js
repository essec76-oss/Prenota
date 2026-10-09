// ============================================================
// richieste-contatto.js — Modulo "Richiedi contatto" (pubblico)
// ============================================================

import { escapeHtml, closeModal, showToast } from './utils.js';
import { inviaRichiesta } from './api.js';

export function mostraFormRichiestaContatto(utente) {
  const precompilato = !!utente;
  if (!precompilato) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="overlay" id="overlay">
        <div class="modal" role="dialog" aria-modal="true" style="max-width:520px;">
          <h2>📩 Richiedi contatto con il direttivo</h2>
          <p class="modal-subtitle">Compila i dati: un membro del direttivo ti contatterà a breve.</p>
          <div id="richiesta-form-container"></div>
        </div>
      </div>
    `;
    document.getElementById('overlay').addEventListener('click', function (e) {
      if (e.target.id === 'overlay') closeModal();
    });
    renderFormRichiesta(document.getElementById('richiesta-form-container'), utente, 'contatto');
    return;
  }
  let box = document.getElementById('richiesta-inline-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'richiesta-inline-box';
    const loginBox = document.getElementById('login-box');
    if (loginBox && loginBox.parentNode) {
      loginBox.parentNode.insertBefore(box, loginBox.nextSibling);
    } else {
      document.getElementById('auth-section').appendChild(box);
    }
  }
  box.innerHTML = '';
  renderFormRichiesta(box, utente, 'scaduto');
}

function renderFormRichiesta(container, utente, motivo) {
  const precompilato = !!utente;
  const nome = precompilato ? escapeHtml(utente.nome) : '';
  const cognome = precompilato ? escapeHtml(utente.cognome) : '';
  const sport = precompilato ? utente.sport : 'both';
  const codice = precompilato ? utente.codice : '';
  const isScaduto = motivo === 'scaduto';
  const titolo = isScaduto
    ? '⏰ La tua prova gratuita è terminata'
    : '📩 Richiedi contatto con il direttivo';
  const sottotitolo = isScaduto
    ? 'Vuoi continuare a giocare? Compila i dati e un membro del direttivo ti contatterà al più presto.'
    : 'Compila i dati: un membro del direttivo ti contatterà al più presto.';

  container.innerHTML = `
    <div class="richiesta-box">
      <h3>${titolo}</h3>
      <p class="rich-sub">${sottotitolo}</p>
      <div class="name-field">
        <label for="rich-nome">Nome *</label>
        <input id="rich-nome" type="text" value="${nome}" ${precompilato ? 'readonly' : ''} />
      </div>
      <div class="name-field">
        <label for="rich-cognome">Cognome *</label>
        <input id="rich-cognome" type="text" value="${cognome}" ${precompilato ? 'readonly' : ''} />
      </div>
      <div class="name-field">
        <label for="rich-telefono">Numero di telefono *</label>
        <input id="rich-telefono" type="tel" placeholder="Es. 3331234567" autocomplete="tel" />
      </div>
      <div class="name-field">
        <label for="rich-sport">Sport di interesse</label>
        <select id="rich-sport">
          <option value="both"   ${sport === 'both'   ? 'selected' : ''}>Tennis + Padel</option>
          <option value="tennis" ${sport === 'tennis' ? 'selected' : ''}>Solo Tennis</option>
          <option value="padel"  ${sport === 'padel'  ? 'selected' : ''}>Solo Padel</option>
        </select>
      </div>
      <div class="name-field">
        <label for="rich-messaggio">Messaggio (opzionale)</label>
        <textarea id="rich-messaggio" placeholder="Es. Vorrei provare, informazioni orari, ecc."></textarea>
      </div>
      <label class="privacy-row">
        <input type="checkbox" id="rich-privacy" />
        <span>Acconsento al trattamento dei miei dati personali (nome, cognome, telefono, sport, messaggio) da parte del Tennis Club Nulvi, esclusivamente per essere contattato in merito a questa richiesta. I dati non saranno ceduti a terzi. Per esercitare i tuoi diritti puoi rivolgerti direttamente al circolo.</span>
      </label>
      <div class="form-error" id="rich-error"></div>
      <div style="display:flex;gap:10px;margin-top:14px;">
        <button class="btn-cancel" id="rich-annulla" style="flex:1;padding:14px;border-radius:10px;border:1px solid var(--line);background:var(--surface);cursor:pointer;font-family:inherit;font-size:15px;font-weight:600;color:var(--ink-soft);">Annulla</button>
        <button class="btn-invia" id="rich-invia" style="flex:2;">📩 Invia richiesta al direttivo</button>
      </div>
    </div>
  `;
  document.getElementById('rich-invia').addEventListener('click', function () {
    inviaRichiestaContatto(codice);
  });
  document.getElementById('rich-annulla').addEventListener('click', function () {
    if (precompilato) {
      const box = document.getElementById('richiesta-inline-box');
      if (box) box.innerHTML = '';
      const loginError = document.getElementById('login-error');
      if (loginError) loginError.textContent = '';
      const loginCodice = document.getElementById('login-codice');
      if (loginCodice) loginCodice.value = '';
    } else {
      closeModal();
    }
  });
}

async function inviaRichiestaContatto(codiceOspite) {
  const errorEl = document.getElementById('rich-error');
  const btn = document.getElementById('rich-invia');
  const nome = (document.getElementById('rich-nome').value || '').trim();
  const cognome = (document.getElementById('rich-cognome').value || '').trim();
  const telefono = (document.getElementById('rich-telefono').value || '').trim();
  const sport = document.getElementById('rich-sport').value;
  const messaggio = (document.getElementById('rich-messaggio').value || '').trim();
  const privacy = document.getElementById('rich-privacy').checked;

  if (!nome || !cognome || !telefono) {
    errorEl.textContent = 'Nome, cognome e telefono sono obbligatori.';
    return;
  }
  if (!privacy) {
    errorEl.textContent = 'Devi accettare il trattamento dei dati per procedere.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Invio...';
  errorEl.textContent = '';

  try {
    const { ok, data } = await inviaRichiesta({
      azione: 'crea',
      nome, cognome, telefono, sport, messaggio,
      privacy_ok: privacy,
      codice_ospite_originale: codiceOspite || null
    });
    if (!ok || !data.success) throw new Error(data.error || 'Invio non riuscito.');

    const box = document.querySelector('.richiesta-box');
    if (box) {
      box.outerHTML = `
        <div class="richiesta-successo">
          ✅ Richiesta inviata!<br>
          Un membro del direttivo ti contatterà a breve.
        </div>
      `;
    } else {
      closeModal();
      showToast('✅ Richiesta inviata al direttivo!');
    }
  } catch (e) {
    errorEl.textContent = '❌ ' + e.message;
    btn.disabled = false;
    btn.textContent = '📩 Invia richiesta al direttivo';
  }
}
