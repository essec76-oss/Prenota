// ============================================================
// admin-users.js — Gestione Utenti (admin)
// ============================================================

import { state } from './state.js';
import { dateKey, showToast, closeModal, escapeHtml } from './utils.js';
import { loadAdminUsers, generateUniqueCode, createUser, updateUser, deleteUserRecord, deleteUserBookings, checkFutureBookings, loadPrenotazioniAdmin } from './api.js';

export async function openUserManagement() {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" style="max-width:620px;">
        <h2>👥 Gestione Utenti</h2>
        <p class="modal-subtitle">Crea nuovi utenti o gestisci quelli esistenti.</p>
        <div class="user-modal-tabs">
          <button class="active" data-tab="tesserati" id="tab-tesserati">⭐ Tesserati</button>
          <button data-tab="ospiti" id="tab-ospiti">👤 Ospiti</button>
          <button data-tab="prenotazioni" id="tab-prenotazioni">📅 Prenotazioni</button>
          <button data-tab="crea" id="tab-crea">➕ Crea nuovo</button>
        </div>
        <div id="user-list-container">
          <div class="user-list-empty">⏳ Caricamento utenti...</div>
        </div>
        <div id="user-create-form" style="display:none;">
          <div class="name-field">
            <label for="create-tipo">Tipo utente</label>
            <select id="create-tipo">
              <option value="tesserato">⭐ Tesserato</option>
              <option value="ospite">👤 Ospite</option>
            </select>
          </div>
          <div class="name-field">
            <label for="create-nome">Nome *</label>
            <input id="create-nome" type="text" placeholder="Nome" />
          </div>
          <div class="name-field">
            <label for="create-cognome">Cognome *</label>
            <input id="create-cognome" type="text" placeholder="Cognome" />
          </div>
          <div class="name-field" id="create-sport-field">
            <label for="create-sport">Sport</label>
            <select id="create-sport">
              <option value="both">Tennis + Padel</option>
              <option value="tennis">Tennis</option>
              <option value="padel">Padel</option>
            </select>
          </div>
          <div class="name-field" id="create-special-field" style="display:none;">
            <label for="create-special">
              <input type="checkbox" id="create-special" style="width:auto;margin-right:6px;vertical-align:middle;" />
              Può prenotare in modalità Torneo / Allenamento
            </label>
          </div>
          <div class="name-field">
            <label for="create-scadenza">Scadenza (lasciare vuoto per default)</label>
            <input id="create-scadenza" type="date" />
          </div>
          <div class="name-field">
            <label for="create-attivo">Attivo</label>
            <select id="create-attivo">
              <option value="true">✅ Attivo</option>
              <option value="false">❌ Inattivo</option>
            </select>
          </div>
          <div class="form-error" id="create-error"></div>
          <div class="modal-actions">
            <button class="btn-cancel" id="create-cancel">Annulla</button>
            <button class="btn-confirm" id="create-save">💾 Crea utente</button>
          </div>
        </div>
        <div class="modal-actions" style="margin-top:12px;">
          <button class="btn-cancel" id="user-close" style="flex:none;width:100%;">Chiudi</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('tab-tesserati').addEventListener('click', () => switchUserTab('tesserati'));
  document.getElementById('tab-ospiti').addEventListener('click', () => switchUserTab('ospiti'));
  document.getElementById('tab-prenotazioni').addEventListener('click', () => switchUserTab('prenotazioni'));
  document.getElementById('tab-crea').addEventListener('click', () => switchUserTab('crea'));
  document.getElementById('create-tipo').addEventListener('change', toggleCreateFields);
  document.getElementById('create-cancel').addEventListener('click', () => switchUserTab(state.currentUserTab));
  document.getElementById('create-save').addEventListener('click', handleCreateUser);
  document.getElementById('user-close').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  toggleCreateFields();
  await loadUserList('tesserati');
}

function switchUserTab(tab) {
  state.currentUserTab = tab;
  document.querySelectorAll('.user-modal-tabs button').forEach(btn => btn.classList.remove('active'));
  const tabBtn = document.getElementById('tab-' + tab);
  if (tabBtn) tabBtn.classList.add('active');
  const listContainer = document.getElementById('user-list-container');
  const createForm = document.getElementById('user-create-form');
  if (tab === 'crea') {
    listContainer.style.display = 'none';
    createForm.style.display = 'block';
  } else if (tab === 'prenotazioni') {
    listContainer.style.display = 'block';
    createForm.style.display = 'none';
    loadPrenotazioniList(state.currentPrenotazioniTipo);
  } else {
    listContainer.style.display = 'block';
    createForm.style.display = 'none';
    loadUserList(tab);
  }
}

function toggleCreateFields() {
  document.getElementById('create-sport-field').style.display = 'block';
  const tipo = document.getElementById('create-tipo').value;
  const specialField = document.getElementById('create-special-field');
  if (specialField) {
    specialField.style.display = (tipo === 'tesserato') ? 'block' : 'none';
  }
}

function attachUserActionListeners(container) {
  container.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', function () {
      const action = btn.dataset.action;
      const table = btn.dataset.table;
      const id = btn.dataset.id;
      const record = state.userDataCache[table + ':' + id];
      if (!record) { showToast('❌ Utente non trovato, ricarica la lista.'); return; }
      const nomeCompleto = record.nome + ' ' + record.cognome;
      if (action === 'edit') {
        editUser(table, id, nomeCompleto, record.scadenza || '', record.attivo !== undefined ? record.attivo : true, record.is_tennis_member, record.is_padel_member, record.can_book_special);
      } else if (action === 'delete') {
        deleteUser(table, id, nomeCompleto);
      }
    });
  });
}

export async function loadUserList(tipo) {
  const container = document.getElementById('user-list-container');
  container.innerHTML = '<div class="user-list-empty">⏳ Caricamento...</div>';
  if (!state.loggedUser || !state.loggedUser.accessToken) {
    container.innerHTML = '<div class="user-list-empty">❌ Serve una sessione admin sicura.</div>';
    return;
  }
  try {
    const data = await loadAdminUsers(tipo, state.loggedUser.accessToken);
    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = '<div class="user-list-empty">📭 Nessun ' + (tipo === 'tesserati' ? 'tesserato' : 'ospite') + ' presente.</div>';
      return;
    }
    const isTesserati = tipo === 'tesserati';
    let html = '<div class="user-list-section-title">' + (isTesserati ? '⭐ Tesserati' : '👤 Ospiti') + '</div>';
    html += '<table class="user-list-table"><thead><tr><th>Codice</th><th>Nome</th><th>Sport</th>'
      + (isTesserati ? '<th>Torneo/Allen.</th>' : '')
      + '<th>Scadenza</th><th>Stato</th><th>Azioni</th></tr></thead><tbody>';
    data.forEach(u => {
      state.userDataCache[(isTesserati ? 'Tesserati:' : 'Ospiti:') + u.id] = u;
      const sports = [];
      if (u.is_tennis_member) sports.push('🎾');
      if (u.is_padel_member) sports.push('🏸');
      const sportLabel = sports.length === 0 ? '❌ Nessuno' : sports.join(' ');
      const scadenza = u.scadenza ? String(u.scadenza).split('-').reverse().join('/') : 'N/D';
      const attivo = (u.attivo === undefined || u.attivo === null) ? true : !!u.attivo;
      const attivoLabel = attivo ? '✅ Attivo' : '❌ Inattivo';
      const specialLabel = u.can_book_special ? '✅' : '—';
      html += `<tr>
        <td><strong>${escapeHtml(u.codice)}</strong></td>
        <td>${escapeHtml(u.nome + ' ' + u.cognome)}</td>
        <td>${sportLabel}</td>
        ${isTesserati ? `<td>${specialLabel}</td>` : ''}
        <td>${scadenza}</td>
        <td>${attivoLabel}</td>
        <td>
          <div class="user-actions">
            <button class="btn-edit" data-action="edit" data-table="${isTesserati ? 'Tesserati' : 'Ospiti'}" data-id="${escapeHtml(u.id)}">✏️</button>
            <button class="btn-delete" data-action="delete" data-table="${isTesserati ? 'Tesserati' : 'Ospiti'}" data-id="${escapeHtml(u.id)}">🗑️</button>
          </div>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
    attachUserActionListeners(container);
  } catch (e) {
    container.innerHTML = '<div class="user-list-empty">❌ Errore nel caricamento: ' + e.message + '</div>';
  }
}

async function loadPrenotazioniList(tipo) {
  state.currentPrenotazioniTipo = tipo;
  const container = document.getElementById('user-list-container');
  const selectedTesserati = tipo === 'tesserato' ? 'selected' : '';
  const selectedOspiti = tipo === 'ospite' ? 'selected' : '';
  container.innerHTML = `
    <div class="name-field">
      <label for="prenotazioni-tipo-filter">Mostra prenotazioni di</label>
      <select id="prenotazioni-tipo-filter">
        <option value="tesserato" ${selectedTesserati}>⭐ Tesserati</option>
        <option value="ospite" ${selectedOspiti}>👤 Ospiti</option>
      </select>
    </div>
    <div id="prenotazioni-list-body"><div class="user-list-empty">⏳ Caricamento...</div></div>
  `;
  document.getElementById('prenotazioni-tipo-filter').addEventListener('change', function () {
    loadPrenotazioniList(this.value);
  });
  const body = document.getElementById('prenotazioni-list-body');
  try {
    const data = await loadPrenotazioniAdmin(tipo);
    if (data.length === 0) {
      const label = tipo === 'tesserato' ? 'tesserati' : 'ospiti';
      body.innerHTML = '<div class="user-list-empty">📭 Nessuna prenotazione attiva fatta da ' + label + '.</div>';
      return;
    }
    const titleLabel = tipo === 'tesserato' ? '⭐ Prenotazioni dei Tesserati' : '👤 Prenotazioni degli Ospiti';
    let html = '<div class="user-list-section-title">' + titleLabel + '</div>';
    html += '<table class="user-list-table"><thead><tr><th>Data</th><th>Ora</th><th>Campo</th><th>Prenotato da</th><th>Giocatori</th></tr></thead><tbody>';
    data.forEach(r => {
      const dataFmt = r.date ? r.date.split('-').reverse().join('/') : '';
      const campoLabel = r.field === 'padel' ? '🏸 Padel' : '🎾 Tennis';
      const modalitaLabel = r.modalita === 'torneo' ? ' (Torneo)' : (r.modalita === 'allenamento' ? ' (Allenamento)' : '');
      const nomi = (r.names || '').split(',').map(s => s.trim()).filter(Boolean).map(escapeHtml).join(', ');
      html += `<tr>
        <td>${dataFmt}</td>
        <td>${escapeHtml(r.time || '')}</td>
        <td>${campoLabel}</td>
        <td>${escapeHtml(r.prenotato_da || '')}</td>
        <td>${nomi}${modalitaLabel}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = '<div class="user-list-empty">❌ Errore nel caricamento: ' + e.message + '</div>';
  }
}

async function handleCreateUser() {
  const errorEl = document.getElementById('create-error');
  const tipo = document.getElementById('create-tipo').value;
  const nome = document.getElementById('create-nome').value.trim();
  const cognome = document.getElementById('create-cognome').value.trim();
  const sport = document.getElementById('create-sport').value;
  const canBookSpecial = tipo === 'tesserato' && document.getElementById('create-special').checked;
  const scadenza = document.getElementById('create-scadenza').value || null;
  const attivo = document.getElementById('create-attivo').value === 'true';
  const saveBtn = document.getElementById('create-save');

  if (!nome || !cognome) {
    errorEl.textContent = 'Nome e Cognome sono obbligatori.';
    return;
  }
  if (!state.loggedUser || !state.loggedUser.accessToken) {
    errorEl.textContent = '❌ Solo un admin con login sicuro attivo può creare utenti.';
    return;
  }
  if (!state.adminMode) {
    errorEl.textContent = '❌ Attiva prima la modalità Admin (checkbox).';
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvo...';
  errorEl.textContent = '';

  try {
    const codice = await generateUniqueCode(tipo, state.loggedUser.accessToken);

    let insertPayload;
    if (tipo === 'tesserato') {
      insertPayload = {
        nome, cognome, codice,
        is_tennis_member: sport === 'tennis' || sport === 'both',
        is_padel_member: sport === 'padel' || sport === 'both',
        is_admin: false,
        can_book_special: canBookSpecial,
        scadenza: scadenza || null,
        attivo: attivo
      };
    } else {
      insertPayload = {
        nome, cognome, codice,
        is_tennis_member: sport === 'tennis' || sport === 'both',
        is_padel_member: sport === 'padel' || sport === 'both',
        attivo: attivo,
        scadenza: scadenza || null
      };
    }

    const table = tipo === 'tesserato' ? 'Tesserati' : 'Ospiti';
    const { ok, data } = await createUser(table, insertPayload, state.loggedUser.accessToken);

    if (!ok) {
      const errorDetail = data.message || data.details || JSON.stringify(data);
      throw new Error(errorDetail);
    }

    const tipoLabel = tipo === 'tesserato' ? 'Tesserato' : 'Ospite';
    showToast('✅ ' + tipoLabel + ' ' + nome + ' ' + cognome + ' creato! Codice: ' + codice);
    document.getElementById('create-nome').value = '';
    document.getElementById('create-cognome').value = '';
    document.getElementById('create-scadenza').value = '';
    document.getElementById('create-attivo').value = 'true';
    await loadUserList(state.currentUserTab);
  } catch (e) {
    console.error('❌ Errore creazione utente:', e);
    errorEl.textContent = '❌ Errore: ' + (e.message || 'creazione fallita');
  }
  saveBtn.disabled = false;
  saveBtn.textContent = '💾 Crea utente';
}

async function editUser(table, id, nome, scadenzaCorrente, attivoCorrente, isTennis, isPadel, canBookSpecialCorrente) {
  const tennis = isTennis === true || isTennis === 'true';
  const padel = isPadel === true || isPadel === 'true';
  const specialCorrente = canBookSpecialCorrente === true || canBookSpecialCorrente === 'true';
  let sportCorrente = 'both';
  if (tennis && padel) sportCorrente = 'both';
  else if (tennis) sportCorrente = 'tennis';
  else if (padel) sportCorrente = 'padel';
  const dataInput = scadenzaCorrente || '';
  const attivoChecked = attivoCorrente === true || attivoCorrente === 'true';
  const isTesserato = table === 'Tesserati';
  const root = document.getElementById('modal-root');

  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" style="max-width:480px;">
        <h2>✏️ Modifica ${escapeHtml(nome)}</h2>
        <p class="modal-subtitle">Aggiorna sport, scadenza e stato dell'utente.</p>
        <div class="name-field">
          <label for="edit-sport">Sport</label>
          <select id="edit-sport">
            <option value="both" ${sportCorrente === 'both' ? 'selected' : ''}>Tennis + Padel</option>
            <option value="tennis" ${sportCorrente === 'tennis' ? 'selected' : ''}>Tennis</option>
            <option value="padel" ${sportCorrente === 'padel' ? 'selected' : ''}>Padel</option>
          </select>
        </div>
        ${isTesserato ? `
        <div class="name-field">
          <label for="edit-special">
            <input type="checkbox" id="edit-special" style="width:auto;margin-right:6px;vertical-align:middle;" ${specialCorrente ? 'checked' : ''} />
            Può prenotare in modalità Torneo / Allenamento
          </label>
        </div>` : ''}
        <div class="name-field">
          <label for="edit-scadenza">Scadenza</label>
          <input id="edit-scadenza" type="date" value="${dataInput}" />
        </div>
        <div class="name-field">
          <label for="edit-attivo">Stato</label>
          <select id="edit-attivo">
            <option value="true" ${attivoChecked ? 'selected' : ''}>✅ Attivo</option>
            <option value="false" ${!attivoChecked ? 'selected' : ''}>❌ Inattivo</option>
          </select>
        </div>
        <div class="form-error" id="edit-error"></div>
        <div class="modal-actions">
          <button class="btn-cancel" id="edit-cancel">Annulla</button>
          <button class="btn-confirm" id="edit-save">💾 Salva modifiche</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('edit-cancel').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('edit-save').addEventListener('click', async function () {
    const errorEl = document.getElementById('edit-error');
    const sport = document.getElementById('edit-sport').value;
    const specialEl = document.getElementById('edit-special');
    const nuovaScadenza = document.getElementById('edit-scadenza').value || null;
    const nuovoAttivo = document.getElementById('edit-attivo').value === 'true';
    const saveBtn = document.getElementById('edit-save');

    if (!state.loggedUser || !state.loggedUser.accessToken) {
      errorEl.textContent = '❌ Solo un admin con login sicuro attivo può modificare gli utenti.';
      return;
    }
    if (!state.adminMode) {
      errorEl.textContent = '❌ Attiva prima la modalità Admin (checkbox).';
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvo...';
    errorEl.textContent = '';

    const payload = {
      is_tennis_member: sport === 'tennis' || sport === 'both',
      is_padel_member: sport === 'padel' || sport === 'both',
      scadenza: nuovaScadenza,
      attivo: nuovoAttivo
    };
    if (isTesserato && specialEl) payload.can_book_special = specialEl.checked;

    const ok = await updateUser(table, id, payload, state.loggedUser.accessToken);
    if (!ok) {
      errorEl.textContent = '❌ Errore salvataggio';
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Salva modifiche';
      return;
    }
    closeModal();
    showToast('✅ Modifiche salvate per ' + nome);
    await loadUserList(state.currentUserTab);
  });
}

async function deleteUser(table, id, nome) {
  if (!state.loggedUser || !state.loggedUser.accessToken) {
    showToast('❌ Solo un admin con login sicuro attivo può eliminare utenti.');
    return;
  }
  if (!state.adminMode) {
    showToast('❌ Attiva prima la modalità Admin (checkbox).');
    return;
  }

  let confirmMsg = '⚠️ Sei sicuro di voler eliminare ' + nome + '?';
  try {
    const futureBookings = await checkFutureBookings(id, table);
    if (futureBookings.length > 0) {
      const dettagli = futureBookings.map(b => '• ' + b.date + ' ore ' + b.time + ' (' + b.field + ')').join('\n');
      confirmMsg = '⚠️ ATTENZIONE: ' + nome + ' ha ' + futureBookings.length + ' prenotazione/i futura/e:\n\n' + dettagli
        + '\n\nEliminando questo utente verranno cancellate ANCHE queste prenotazioni.\n\nVuoi procedere comunque?';
    }
  } catch (checkErr) {
    console.warn('⚠️ Impossibile verificare prenotazioni future:', checkErr);
  }

  if (!confirm(confirmMsg)) return;

  try {
    await deleteUserBookings(id, table, state.loggedUser.accessToken);
  } catch (delErr) {
    console.warn('⚠️ Impossibile cancellare le prenotazioni collegate:', delErr);
    showToast('⚠️ Le prenotazioni future potrebbero non essere state cancellate');
  }

  const ok = await deleteUserRecord(table, id, state.loggedUser.accessToken);
  if (ok) {
    showToast('✅ ' + nome + ' eliminato con successo');
    await loadUserList(state.currentUserTab);
  } else {
    showToast('❌ Errore eliminazione');
  }
}
