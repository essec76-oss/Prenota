// ============================================================
// slots.js — Slot orari, prenotazione, modale booking
// ============================================================
// Modifiche:
//  - Menu unico misto (tesserati + ospiti) con etichetta a fianco
//  - Filtro stretto per sport (padel → solo is_padel_member, tennis → solo is_tennis_member)
//  - Esclusione del prenotante dal menu giocatori
//  - Esclusione dinamica dei giocatori già scelti negli altri campi
//  - Confronto case-insensitive + trim spazi
// ============================================================

import { FIELDS } from './config.js';
import { state } from './state.js';
import { dateKey, fmtTime, escapeHtml, showToast, closeModal, scrollToAuth } from './utils.js';
import { loadBookings, loadKeyboxCodes, loadAllPlayers, createBooking } from './api.js';
import { canBookField, isOwnBooking } from './ui.js';
import { updateBookingDots } from './calendar.js';

// ---------- NORMALIZZAZIONE NOMI (case-insensitive + trim) ----------
function normName(s) {
  return String(s || '').trim().toLowerCase();
}

export function buildSlots(field) {
  const f = FIELDS[field];
  const slots = [];
  const stepHours = f.slotMinutes / 60;
  for (let h = f.start; h + stepHours <= f.end + 0.001; h += stepHours) {
    slots.push({
      start: h,
      end: h + stepHours,
      label: fmtTime(h) + ' – ' + fmtTime(h + stepHours)
    });
  }
  return slots;
}

export function formatNamesDisplay(names, field, modalita) {
  const n = names.map(escapeHtml);
  if (modalita === 'torneo' || modalita === 'allenamento') {
    const label = modalita === 'torneo' ? 'Torneo' : 'Allenamento';
    return n.join(', ') + '<span class="special-mode-badge ' + modalita + '">' + label + '</span>';
  }
  if (field === 'tennis' && n.length === 1) return n[0] + '<span class="match-type">Allenamento</span>';
  if (field === 'tennis' && n.length === 2) return n[0] + ' vs ' + n[1] + '<span class="match-type">Singolo</span>';
  if (n.length === 4) return n[0] + ', ' + n[1] + ' vs ' + n[2] + ', ' + n[3] + (field === 'tennis' ? '<span class="match-type">Doppio</span>' : '');
  return n.join(', ');
}

function isSlotPassed(dateStr, slotStartHour) {
  const now = new Date();
  const todayStr = dateKey(now);
  if (dateStr !== todayStr) return false;
  const slotMinutes = Math.floor(slotStartHour * 60);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return slotMinutes <= nowMinutes + 10;
}

export async function renderSlots() {
  const section = document.getElementById('slots-section');
  const title = document.getElementById('slots-title');
  const list = document.getElementById('slot-list');
  if (!state.selectedDate) { section.style.display = 'none'; return; }

  section.style.display = 'block';
  const d = new Date(state.selectedDate + 'T00:00:00');
  title.textContent = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  list.innerHTML = '<div class="empty-msg">Carico gli orari…</div>';

  const [bookings, keybox] = await Promise.all([
    loadBookings(state.selectedDate, state.currentField),
    loadKeyboxCodes(state.loggedUser && state.loggedUser.accessToken)
  ]);
  state.keyboxCodeTennis = keybox.tennis;
  state.keyboxCodePadel = keybox.padel;

  const slots = buildSlots(state.currentField);
  list.innerHTML = '';

  slots.forEach(s => {
    const timeId = fmtTime(s.start);
    const booking = bookings[timeId];
    const row = document.createElement('div');
    const isPastSlot = isSlotPassed(state.selectedDate, s.start);

    if (isPastSlot) {
      row.className = 'slot past-slot';
      const left = document.createElement('div');
      left.innerHTML = `<div class="time">${s.label}</div><div class="status">⏰ Orario già passato</div>`;
      row.appendChild(left);
    } else if (booking) {
      const isTesserato = booking.tipo_prenotante === 'tesserato';
      row.className = 'slot booked ' + (isTesserato ? 'slot-tesserato' : 'slot-ospite');
      const left = document.createElement('div');
      const badge = isTesserato
        ? '<span class="badge-tesserato">⭐ Tesserato</span>'
        : '<span class="badge-ospite">Ospite</span>';
      const keyboxCode = state.currentField === 'tennis' ? state.keyboxCodeTennis : state.keyboxCodePadel;
      const keyboxHtml = (!state.loggedUser || booking.modalita === 'allenamento') ? '' : (keyboxCode
        ? '<div class="prenotato-da">🔑 Codice Key Box: <strong>' + keyboxCode + '</strong></div>'
        : '');

      left.innerHTML = `
        <div class="time">${s.label}</div>
        <div class="status">${formatNamesDisplay(booking.names, state.currentField, booking.modalita)}</div>
        <div class="prenotato-da">👤 Prenotato da: <strong>${escapeHtml(booking.prenotato_da)}</strong> ${badge}</div>
        ${keyboxHtml}
      `;
      row.appendChild(left);

      if (!state.loggedUser) {
        // niente
      } else if (state.adminMode && state.loggedUser.is_admin) {
        const adminBtn = document.createElement('button');
        adminBtn.className = 'book-btn admin-delete';
        adminBtn.textContent = '🗑️ Admin';
        adminBtn.title = 'Cancella come admin (senza codice)';
        adminBtn.addEventListener('click', () => import('./cancel.js').then(m => m.doAdminCancel(booking.id, s.label)));
        row.appendChild(adminBtn);

        const normalBtn = document.createElement('button');
        normalBtn.className = 'book-btn cancel-btn';
        normalBtn.textContent = 'Cancella';
        normalBtn.addEventListener('click', () => import('./cancel.js').then(m => m.openCancelModal(s, timeId, booking)));
        row.appendChild(normalBtn);
      } else {
        if (isOwnBooking(booking)) {
          const codeBtn = document.createElement('button');
          codeBtn.className = 'book-btn';
          codeBtn.style.background = 'var(--padel)';
          codeBtn.style.marginRight = '6px';
          codeBtn.textContent = '🔐 Mostra codice';
          codeBtn.title = 'Mostra il tuo codice di cancellazione';
          codeBtn.addEventListener('click', () => import('./cancel.js').then(m => m.fetchAndShowOwnCode(booking.id)));
          row.appendChild(codeBtn);
        }
        const btn = document.createElement('button');
        btn.className = 'book-btn cancel-btn';
        btn.textContent = 'Cancella';
        btn.addEventListener('click', () => import('./cancel.js').then(m => m.openCancelModal(s, timeId, booking)));
        row.appendChild(btn);
      }
    } else {
      row.className = 'slot available';
      const left = document.createElement('div');
      left.innerHTML = '<div class="time">' + s.label + '</div><div class="status">Libero</div>';
      row.appendChild(left);

      const btn = document.createElement('button');
      btn.className = 'book-btn';
      const allowed = canBookField(state.currentField);
      if (allowed) {
        btn.textContent = 'Prenota';
        btn.addEventListener('click', () => openBookingModal(s, timeId));
      } else if (!state.loggedUser) {
        btn.textContent = 'Accedi per prenotare';
        btn.addEventListener('click', () => scrollToAuth());
      } else {
        btn.textContent = 'Non abilitato';
        btn.disabled = true;
      }
      row.appendChild(btn);
    }
    list.appendChild(row);
  });
}

export function canUseSpecialModes() {
  return !!(state.loggedUser && state.loggedUser.tipo === 'tesserato' && state.loggedUser.can_book_special);
}

export function openBookingModal(slot, timeId) {
  if (!state.loggedUser) {
    showToast('Devi effettuare il login per prenotare.');
    return;
  }
  if (!canBookField(state.currentField)) {
    showToast('Non sei abilitato per ' + (state.currentField === 'tennis' ? 'il tennis' : 'il padel') + '.');
    return;
  }

  state.selectedModalita = null;
  const f = FIELDS[state.currentField];
  const root = document.getElementById('modal-root');
  const nameCount = f.maxNames;
  const requiredCount = f.minNames;
  const prenotanteName = state.loggedUser.nome + ' ' + state.loggedUser.cognome;
  const prenotanteNameEscaped = escapeHtml(prenotanteName);

  let fieldsHtml = '<div class="name-field">\n        <label for="name-0">Prenotante</label>\n        <input id="name-0" type="text" autocomplete="off" value="' + prenotanteNameEscaped + '" readonly />\n      </div>';
  for (let i = 1; i < nameCount; i++) {
    const isRequired = i < requiredCount;
    fieldsHtml += '<div class="name-field" id="name-field-' + i + '">\n        <label for="name-' + i + '">Giocatore ' + (i + 1) + (isRequired ? ' (obbligatorio)' : ' (facoltativo)') + '</label>\n        <select id="name-' + i + '" class="player-select" placeholder="Cerca e seleziona..."></select>\n      </div>';
  }

  const modeSelectorHtml = canUseSpecialModes()
    ? `<div class="mode-selector" id="mode-selector">
        <button type="button" class="active" data-mode="">Normale</button>
        <button type="button" data-mode="torneo">🏆 Torneo</button>
        <button type="button" data-mode="allenamento">🎯 Allenamento</button>
      </div>`
    : '';

  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${f.label}</h2>
        <div class="meta">${new Date(state.selectedDate + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} · ${slot.label}</div>
        <div style="background:var(--accent-soft);border-radius:8px;padding:10px;margin-bottom:16px;font-size:13px;color:var(--ink-soft);">
          👤 Stai prenotando come: <strong>${prenotanteNameEscaped}</strong>
          ${state.loggedUser.tipo === 'tesserato' ? '⭐ (Tesserato)' : '(Ospite)'}
        </div>
        ${modeSelectorHtml}
        ${fieldsHtml}
        <div class="form-error" id="form-error"></div>
        <div class="modal-actions">
          <button class="btn-cancel" id="btn-cancel">Annulla</button>
          <button class="btn-confirm" id="btn-confirm">Conferma</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('btn-confirm').addEventListener('click', () => confirmBooking(timeId, requiredCount, nameCount));

  const modeSelectorEl = document.getElementById('mode-selector');
  if (modeSelectorEl) {
    modeSelectorEl.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', function () {
        modeSelectorEl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.selectedModalita = btn.dataset.mode || null;
        applyModalitaToNameFields(nameCount);
      });
    });
  }

  // Carica tutti i giocatori, filtra per sport, esclude prenotante, poi monta TomSelect
  loadAllPlayers().then(({ tesserati, ospiti }) => {
    // Costruisci lista mista con etichette
    const allOptions = [];

    const fieldKey = state.currentField; // 'tennis' o 'padel'
    const sportFlag = fieldKey === 'padel' ? 'is_padel_member' : 'is_tennis_member';

    tesserati.forEach(u => {
      if (!u[sportFlag]) return; // filtro stretto per sport
      const label = u.nome + ' ' + u.cognome;
      allOptions.push({
        value: label,
        text: label + '  ⭐ Tesserato',
        nameRaw: label
      });
    });
    ospiti.forEach(u => {
      if (!u[sportFlag]) return;
      const label = u.nome + ' ' + u.cognome;
      allOptions.push({
        value: label,
        text: label + '  👤 Ospite',
        nameRaw: label
      });
    });

    // Ordina alfabeticamente per nomeRaw
    allOptions.sort((a, b) => a.nameRaw.localeCompare(b.nameRaw, 'it'));

    // Crea i TomSelect con callback di esclusione dinamica
    const tomSelects = {}; // { 'name-1': tomSelectInstance, ... }
    const prenotanteNorm = normName(prenotanteName);

    function getAllSelectedNorm() {
      const selected = [prenotanteNorm]; // il prenotante è sempre "occupato"
      Object.keys(tomSelects).forEach(id => {
        const v = tomSelects[id].getValue();
        if (v) selected.push(normName(v));
      });
      return selected;
    }

    function refreshAllOptions() {
      const excluded = getAllSelectedNorm();
      Object.keys(tomSelects).forEach(id => {
        const ts = tomSelects[id];
        const currentValue = ts.getValue();
        const currentValueNorm = normName(currentValue);
        // Opzioni disponibili = tutte tranne quelle occupate (ma la propria selezione resta visibile)
        const available = allOptions.filter(opt => {
          const n = normName(opt.nameRaw);
          if (n === currentValueNorm) return true; // tieni visibile la propria selezione
          return !excluded.includes(n);
        });
        ts.clearOptions();
        ts.addOptions(available);
        ts.refreshOptions(false);
      });
    }

    for (let i = 1; i < nameCount; i++) {
      const el = document.getElementById('name-' + i);
      if (!el) continue;

      const ts = new TomSelect(el, {
        options: allOptions,
        labelField: 'text',
        valueField: 'value',
        searchField: ['text', 'nameRaw'],
        placeholder: 'Cerca per nome...',
        allowEmptyOption: true,
        maxOptions: 500,
        create: false,
        sortField: { field: 'nameRaw', direction: 'asc' },
        onChange: function () {
          refreshAllOptions();
        }
      });
      tomSelects['name-' + i] = ts;
    }

    // Applica subito l'esclusione del prenotante
    refreshAllOptions();
  });
}

function applyModalitaToNameFields(nameCount) {
  for (let i = 1; i < nameCount; i++) {
    const fieldEl = document.getElementById('name-field-' + i);
    if (!fieldEl) continue;
    fieldEl.style.display = (state.selectedModalita === 'allenamento') ? 'none' : '';
  }
}

export async function confirmBooking(timeId, requiredCount, nameCount) {
  if (!state.loggedUser) {
    showToast('Devi effettuare il login per prenotare.');
    return;
  }
  if (!canBookField(state.currentField)) {
    showToast('Non sei abilitato per ' + (state.currentField === 'tennis' ? 'il tennis' : 'il padel') + '.');
    closeModal();
    return;
  }

  const errorEl = document.getElementById('form-error');
  const isAllenamento = state.selectedModalita === 'allenamento';
  const names = [];

  if (isAllenamento) {
    names.push(document.getElementById('name-0').value.trim());
  } else {
    for (let i = 0; i < nameCount; i++) {
      const val = document.getElementById('name-' + i).value.trim();
      if (val) names.push(val);
    }
  }

  // Validazione doppioni (case-insensitive)
  if (!isAllenamento) {
    const seen = new Set();
    for (const n of names) {
      const key = normName(n);
      if (seen.has(key)) {
        errorEl.textContent = 'Non puoi selezionare la stessa persona due volte.';
        return;
      }
      seen.add(key);
    }
  }

  if (!isAllenamento && names.length < requiredCount) {
    errorEl.textContent = state.currentField === 'padel'
      ? 'Servono esattamente 4 nomi per prenotare il padel.'
      : 'Serve almeno il tuo nome per prenotare il tennis.';
    return;
  }

  const confirmBtn = document.getElementById('btn-confirm');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Salvo…';

  const { ok, data } = await createBooking({
    codice: state.loggedUser.codice,
    field: state.currentField,
    date: state.selectedDate,
    time: timeId,
    names: names,
    modalita: state.selectedModalita || null
  });

  if (!ok || !data.success) {
    errorEl.textContent = data.error || 'Errore di salvataggio';
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Conferma';
    return;
  }

  closeModal();
  showCodeModal(data.code);
  renderSlots();
  updateBookingDots();
}

export function showCodeModal(code) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="code-title">
        <h2 id="code-title">Prenotazione confermata</h2>
        <div class="meta">Il tuo codice di cancellazione a 4 cifre. Puoi recuperarlo quando vuoi col pulsante «Mostra codice» accanto alla tua prenotazione nel calendario.</div>
        <div class="booking-code">${code}</div>
        <div class="modal-actions">
          <button class="btn-confirm" id="btn-code-ok" style="flex:none;width:100%;">Ho capito</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('btn-code-ok').addEventListener('click', closeModal);
}
