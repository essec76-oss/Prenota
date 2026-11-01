// js/admin-users.js — Gestione Utenti: lista, crea, modifica, elimina, reset PIN
import { loadAdminUsers, resetUserPin, adminCreateUser, adminUpdateUser, adminDeleteUser } from './api.js';
import { state } from './state.js';
import { showToast, closeModal, escapeHtml } from './utils.js';

// Tabelle e valori della funzione get_admin_users:
// il parametro accetta 'tesserati' oppure 'ospiti' (qualsiasi altro valore = ospiti).
const TABELLA = { tesserato: 'Tesserati', ospite: 'Ospiti' };
const RPC_TIPO = { tesserato: 'tesserati', ospite: 'ospiti' };

let currentTipo = 'tesserato'; // 'tesserato' | 'ospite' | 'crea'
let currentUsers = [];

function token() {
  return state.loggedUser && state.loggedUser.accessToken;
}

export async function openUserManagement() {
  const root = document.getElementById('modal-root');
  if (!root) { console.error('modal-root non trovato'); return; }

  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" style="max-width:900px;">
        <h2>👥 Gestione Utenti</h2>
        <p class="modal-subtitle">Crea, modifica o elimina tesserati e ospiti. Il reset PIN fa scegliere un nuovo PIN al prossimo login.</p>
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
          <button class="tab-btn" id="tab-tesserato">⭐ Tesserati</button>
          <button class="tab-btn" id="tab-ospite">👤 Ospiti</button>
          <button class="tab-btn" id="tab-crea">➕ Crea nuovo</button>
        </div>
        <div id="admin-users-container"><p>Caricamento utenti…</p></div>
        <div class="modal-actions" style="margin-top:16px;">
          <button class="btn-cancel" id="admin-users-close" style="width:100%;">Chiudi</button>
        </div>
      </div>
    </div>`;

  document.getElementById('tab-tesserato').addEventListener('click', () => switchTab('tesserato'));
  document.getElementById('tab-ospite').addEventListener('click', () => switchTab('ospite'));
  document.getElementById('tab-crea').addEventListener('click', () => switchTab('crea'));
  document.getElementById('admin-users-close').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target.id === 'overlay') closeModal();
  });

  switchTab('tesserato');
}

function switchTab(tab) {
  currentTipo = tab;
  ['tesserato', 'ospite', 'crea'].forEach(t => {
    const b = document.getElementById('tab-' + t);
    if (b) b.classList.toggle('active', t === tab);
  });
  if (tab === 'crea') renderCreateForm('tesserato');
  else caricaEmostra();
}

async function caricaEmostra() {
  const container = document.getElementById('admin-users-container');
  if (!container) return;
  container.innerHTML = '<p>Caricamento utenti…</p>';
  try {
    const t = token();
    if (!t) throw new Error('Sessione non valida. Rientra in modalità admin.');
    const users = await loadAdminUsers(RPC_TIPO[currentTipo], t);
    currentUsers = Array.isArray(users) ? users : [];
    renderUsersTable(container, currentUsers);
  } catch (err) {
    console.error('Errore caricamento utenti:', err);
    container.innerHTML = '<p class="error">Errore: ' + escapeHtml(err.message) + '</p>';
  }
}

// ---------- Helper sport e date ----------
function sportValue(u) {
  const t = !!u.is_tennis_member, p = !!u.is_padel_member;
  if (t && p) return 'both';
  if (t) return 'tennis';
  if (p) return 'padel';
  return 'both';
}

function sportLabel(u) {
  const t = !!u.is_tennis_member, p = !!u.is_padel_member;
  if (t && p) return '🎾 Tennis + 🏸 Padel';
  if (t) return '🎾 Tennis';
  if (p) return '🏸 Padel';
  return '❌ Nessuno';
}

function fmtData(iso) {
  return iso ? iso.split('-').reverse().join('/') : 'Nessuna';
}

// ---------- Lista ----------
function renderUsersTable(container, users) {
  if (!users.length) {
    container.innerHTML = '<p>Nessun utente trovato.</p>';
    return;
  }
  const rows = users.map(u => `
    <tr>
      <td><strong>${escapeHtml(u.codice || '')}</strong></td>
      <td>${escapeHtml(u.nome || '')} ${escapeHtml(u.cognome || '')}</td>
      <td>${sportLabel(u)}</td>
      <td>${fmtData(u.scadenza)}</td>
      <td title="${u.pin_set ? 'PIN impostato' : 'PIN non impostato'}">${u.pin_set ? '✅' : '⚠️'}</td>
      <td style="white-space:nowrap;">
        <button class="btn-edit-user" data-id="${escapeHtml(String(u.id))}">✏️ Modifica</button>
        <button class="btn-reset-pin" data-id="${escapeHtml(String(u.id))}">🔐 Reset PIN</button>
        <button class="btn-delete-user" data-id="${escapeHtml(String(u.id))}">🗑️</button>
      </td>
    </tr>`).join('');

  container.innerHTML = `
    <table class="admin-users-table" style="width:100%;">
      <thead><tr><th>Codice</th><th>Nome</th><th>Sport</th><th>Scadenza</th><th>PIN</th><th>Azioni</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  container.querySelectorAll('.btn-edit-user').forEach(b =>
    b.addEventListener('click', () => renderEditForm(b.dataset.id)));
  container.querySelectorAll('.btn-reset-pin').forEach(b =>
    b.addEventListener('click', () => handleResetPin(b.dataset.id)));
  container.querySelectorAll('.btn-delete-user').forEach(b =>
    b.addEventListener('click', () => handleDelete(b.dataset.id)));
}

// ---------- Form condiviso (creazione e modifica) ----------
function opt(val, label, sel) {
  return `<option value="${val}" ${sel === val ? 'selected' : ''}>${label}</option>`;
}

function campiForm(v) {
  const telefonoVisibile = v.tipo === 'ospite';
  return `
    <div class="name-field"><label for="f-nome">Nome *</label>
      <input id="f-nome" type="text" value="${escapeHtml(v.nome || '')}"></div>
    <div class="name-field"><label for="f-cognome">Cognome *</label>
      <input id="f-cognome" type="text" value="${escapeHtml(v.cognome || '')}"></div>
    <div class="name-field"><label for="f-sport">Sport</label>
      <select id="f-sport">
        ${opt('both', 'Tennis + Padel', v.sport)}${opt('tennis', 'Tennis', v.sport)}${opt('padel', 'Padel', v.sport)}
      </select></div>
    <div class="name-field" id="f-telefono-wrap" style="display:${telefonoVisibile ? 'block' : 'none'};">
      <label for="f-telefono">Telefono ${v.isEdit ? '(vuoto = invariato)' : '*'}</label>
      <input id="f-telefono" type="text" value="${escapeHtml(v.telefono || '')}"></div>
    <div class="name-field"><label for="f-scadenza">Scadenza (vuoto = nessuna)</label>
      <input id="f-scadenza" type="date" value="${escapeHtml(v.scadenza || '')}"></div>
    <div class="form-error" id="f-error" style="color:#c0392b;"></div>`;
}

function leggiCampi(tipo) {
  return {
    tipo,
    nome: document.getElementById('f-nome').value.trim(),
    cognome: document.getElementById('f-cognome').value.trim(),
    sport: document.getElementById('f-sport').value,
    telefono: document.getElementById('f-telefono').value.trim(),
    scadenza: document.getElementById('f-scadenza').value || null
  };
}

function mostraErrore(msg) {
  const el = document.getElementById('f-error');
  if (el) el.textContent = msg;
  else showToast('❌ ' + msg);
}

// ---------- Creazione ----------
function renderCreateForm(tipo) {
  const container = document.getElementById('admin-users-container');
  if (!container) return;
  container.innerHTML = `
    <h3>➕ Nuovo utente</h3>
    <div class="name-field"><label for="f-tipo">Tipo utente</label>
      <select id="f-tipo">
        ${opt('tesserato', '⭐ Tesserato', tipo)}${opt('ospite', '👤 Ospite', tipo)}
      </select></div>
    ${campiForm({ tipo })}
    <div class="modal-actions">
      <button class="btn-cancel" id="f-annulla">Annulla</button>
      <button class="btn-confirm" id="f-salva">💾 Crea utente</button>
    </div>`;

  document.getElementById('f-tipo').addEventListener('change', e => {
    const wrap = document.getElementById('f-telefono-wrap');
    if (wrap) wrap.style.display = e.target.value === 'ospite' ? 'block' : 'none';
  });
  document.getElementById('f-annulla').addEventListener('click', () => switchTab('tesserato'));
  document.getElementById('f-salva').addEventListener('click', salvaCreazione);
}

async function salvaCreazione() {
  const v = leggiCampi(document.getElementById('f-tipo').value);
  if (!v.nome || !v.cognome) return mostraErrore('Nome e cognome sono obbligatori.');
  if (v.tipo === 'ospite' && !v.telefono) return mostraErrore('Il telefono è obbligatorio per gli ospiti.');
  try {
    const { ok, data } = await adminCreateUser(v, token());
    if (!ok || !data.success) throw new Error(data.error || 'Creazione fallita');
    alert('Utente creato.\n\nCodice di accesso: ' + data.codice + '\n\nComunicalo all\'utente.');
    switchTab(v.tipo);
  } catch (err) {
    mostraErrore(err.message);
  }
}

// ---------- Modifica ----------
function renderEditForm(id) {
  const u = currentUsers.find(x => String(x.id) === String(id));
  if (!u) return showToast('Utente non trovato');
  const container = document.getElementById('admin-users-container');
  container.innerHTML = `
    <h3>✏️ Modifica ${escapeHtml(u.codice || '')}</h3>
    ${campiForm({
      tipo: currentTipo, isEdit: true,
      nome: u.nome, cognome: u.cognome, sport: sportValue(u), scadenza: u.scadenza
    })}
    <div class="modal-actions">
      <button class="btn-cancel" id="f-annulla">Annulla</button>
      <button class="btn-confirm" id="f-salva">💾 Salva modifiche</button>
    </div>`;
  document.getElementById('f-annulla').addEventListener('click', caricaEmostra);
  document.getElementById('f-salva').addEventListener('click', () => salvaModifica(u.id));
}

async function salvaModifica(id) {
  const v = leggiCampi(currentTipo);
  if (!v.nome || !v.cognome) return mostraErrore('Nome e cognome sono obbligatori.');
  try {
    const { ok, data } = await adminUpdateUser({
      id, tipo: currentTipo,
      nome: v.nome, cognome: v.cognome, sport: v.sport,
      telefono: v.telefono || undefined, scadenza: v.scadenza
    }, token());
    if (!ok || !data.success) throw new Error(data.error || 'Modifica fallita');
    showToast('✅ Utente aggiornato.');
    caricaEmostra();
  } catch (err) {
    mostraErrore(err.message);
  }
}

// ---------- Eliminazione ----------
async function handleDelete(id) {
  const u = currentUsers.find(x => String(x.id) === String(id));
  const label = u ? `${u.nome} ${u.cognome} (${u.codice})` : id;
  if (!confirm(`Eliminare definitivamente ${label}?\n\nL'operazione non si può annullare.`)) return;
  try {
    const { ok, data } = await adminDeleteUser(id, currentTipo, token());
    if (!ok || !data.success) throw new Error(data.error || 'Eliminazione fallita');
    showToast('🗑️ Utente eliminato.');
    caricaEmostra();
  } catch (err) {
    showToast('❌ ' + err.message);
  }
}

// ---------- Reset PIN (invariato) ----------
async function handleResetPin(userId) {
  const u = currentUsers.find(x => String(x.id) === String(userId));
  const label = u ? ((u.nome || '') + ' ' + (u.cognome || '')).trim() : userId;
  if (!confirm('Vuoi resettare il PIN di ' + label + '?\n\nL\'utente dovrà scegliere un nuovo PIN al prossimo login.')) {
    return;
  }
  try {
    const t = token();
    if (!t) throw new Error('Sessione non valida.');
    const ok = await resetUserPin(TABELLA[currentTipo], userId, t);
    if (!ok) throw new Error('Reset fallito');
    showToast('✅ PIN resettato con successo.');
    await caricaEmostra();
  } catch (err) {
    console.error('Errore reset PIN:', err);
    showToast('❌ Errore reset PIN: ' + err.message);
  }
}
