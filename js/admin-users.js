// js/admin-users.js
// Gestione Utenti — pannello admin con colonna PIN e reset PIN

import { api } from './api.js';

let currentUsers = [];

export async function loadAdminUsers() {
  const container = document.getElementById('admin-users-container');
  if (!container) return;

  container.innerHTML = '<p>Caricamento utenti…</p>';

  try {
    const { data, error } = await api.rpc('get_admin_users');
    if (error) throw error;

    currentUsers = data || [];
    renderUsersTable(container, currentUsers);
  } catch (err) {
    console.error('Errore caricamento utenti:', err);
    container.innerHTML = `<p class="error">Errore: ${err.message}</p>`;
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
      <tr data-user-id="${u.id}">
        <td>${escapeHtml(u.nome || '')}</td>
        <td>${escapeHtml(u.cognome || '')}</td>
        <td>${escapeHtml(u.email || '')}</td>
        <td>${escapeHtml(u.ruolo || '')}</td>
        <td class="col-pin">${pinStatus}</td>
        <td>
          <button class="btn-reset-pin" data-user-id="${u.id}">
            🔐 Reset PIN
          </button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="admin-users-table">
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
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  // Collega i pulsanti Reset PIN
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
    const { error } = await api.resetUserPin(userId);
    if (error) throw error;

    alert('PIN resettato con successo.');
    await loadAdminUsers();
  } catch (err) {
    console.error('Errore reset PIN:', err);
    alert('Errore durante il reset del PIN: ' + err.message);
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
