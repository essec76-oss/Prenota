// js/admin-users.js
// Gestione Utenti — pannello admin con colonna PIN e reset PIN

import { loadAdminUsers, resetUserPin } from './api.js';
import { state } from './state.js';
import { showToast, closeModal } from './utils.js';

let currentUsers = [];
let currentTipo = 'tesserato'; // 'tesserato' | 'ospite'

export async function openUserManagement() {
  const root = document.getElementById('modal-root');
  if (!root) {
    console.error('modal-root non trovato');
    return;
  }

  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" style="max-width:900px;">
        <h2>👥 Gestione Utenti</h2>
        <p class="modal-subtitle">Gestisci tesserati e ospiti. Reset PIN per far scegliere un nuovo PIN al prossimo login.</p>

        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <button class="tab-btn" id="tab-tesserati">Tesserati</button>
          <button class="tab-btn" id="tab-ospiti">Ospiti</button>
        </div>

        <div id="admin-users-container">
          <p>Caricamento utenti…</p>
        </div>

        <div class="modal-actions" style="margin-top:16px;">
          <button class="btn-cancel" id="admin-users-close" style="width:100%;">Chiudi</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('admin-users-close').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', (e) => {
    if (e.target.id === 'overlay') closeModal();
  });

  document.getElementById('tab-tesserati').addEventListener('click', () => {
    currentTipo = 'tesserato';
    aggiornaTabAttiva();
    caricaEmostra();
  });
  document.getElementById('tab-ospiti').addEventListener('click', () => {
    currentTipo = 'ospite';
    aggiornaTabAttiva();
    caricaEmostra();
  });

  aggiornaTabAttiva();
  await caricaEmostra();
}

function aggiornaTabAttiva() {
  const t = document.getElementById('tab-tesserati');
  const o = document.getElementById('tab-ospiti');
  if (!t || !o) return;
  t.classList.toggle('active', currentTipo === 'tesserato');
  o.classList.toggle('active', currentTipo === 'ospite');
}

async function caricaEmostra() {
  const container = document.getElementById('admin-users-container');
  if (!container) return;

  container.innerHTML = '<p>Caricamento utenti…</p>';

  try {
    const token = state.loggedUser && state.loggedUser.accessToken;
    if (!token) throw new Error('Sessione non valida. Rientra in modalità admin.');

    const users = await loadAdminUsers(currentTipo, token);
    currentUsers = Array.isArray(users) ? users : [];
    renderUsersTable(container, currentUsers);
  } catch (err) {
    console.error('Errore caricamento utenti:', err);
    container.innerHTML = `<p class="error">Errore: ${escapeHtml(err.message)}</p>`;
  }
}

function renderUsersTable(container, users) {
  if (!users.length) {
    container.innerHTML = '<p>Nessun utente trovato.</p>';
    return;
  }

  const rows = users.map(u => {
    const pinStatus = (u.pin_set && u.pin_hash)
      ? '<span title="PIN impostato">✅</span>'
      : '<span title="PIN non impostato">⚠️</span>';

    return `
      <tr data-user-id="${escapeHtml(u.id)}">
        <td>${escapeHtml(u.nome || '')}</td>
        <td>${escapeHtml(u.cognome || '')}</td>
        <td>${escapeHtml(u.email || '')}</td>
        <td>${escapeHtml(u.ruolo || '')}</td>
        <td class="col-pin">${pinStatus}</td>
        <td>
          <button class="btn-reset-pin" data-user-id="${escapeHtml(u.id)}">
            🔐 Reset PIN
          </button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="admin-users-table" style="width:100%;">
      <thead>
        <tr>
          <th>Nome</th>
          <th>Cognome</th>
          <th>Email</th>
          <th>Ruolo</th>
          <th>PIN</th>
          <th>Azioni</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  container.querySelectorAll('.btn-reset-pin').forEach(btn => {
    btn.addEventListener('click', () => handleResetPin(btn.dataset.userId));
  });
}

async function handleResetPin(userId) {
  const user = currentUsers.find(u => String(u.id) === String(userId));
  const label = user ? `${user.nome || ''} ${user.cognome || ''}`.trim() : userId;

  if (!confirm(`Vuoi resettare il PIN di ${label}?\n\nL'utente dovrà scegliere un nuovo PIN al prossimo login.`)) {
    return;
  }

  try {
    const token = state.loggedUser && state.loggedUser.accessToken;
    if (!token) throw new Error('Sessione non valida.');

    const tableName = currentTipo === 'tesserato' ? 'Tesserati' : 'Ospiti';
    const ok = await resetUserPin(tableName, userId, token);
    if (!ok) throw new Error('Reset fallito');

    showToast('✅ PIN resettato con successo.');
    await caricaEmostra();
  } catch (err) {
    console.error('Errore reset PIN:', err);
    showToast('❌ Errore reset PIN: ' + err.message);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
