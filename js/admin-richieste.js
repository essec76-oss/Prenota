// ============================================================
// admin-richieste.js — Pannello richieste di contatto (admin/direttivo)
// ============================================================

import { state } from './state.js';
import { dateKey, showToast, closeModal, escapeHtml } from './utils.js';
import { loadRichieste, aggiornaRichiesta } from './api.js';

export async function openRichiestePanel() {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" style="max-width:820px;">
        <h2>📩 Richieste di contatto</h2>
        <p class="modal-subtitle">Tocca una richiesta per aprirla, contatta la persona e poi archiviala. Puoi anche stampare o esportare in CSV.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
          <label style="font-size:13px;color:var(--ink-soft);">Filtro stato:</label>
          <select id="richieste-filtro" style="padding:8px 10px;border:1px solid var(--line);border-radius:6px;font-family:inherit;">
            <option value="nuova">🆕 Da lavorare (nuove)</option>
            <option value="lavorata">✅ Già lavorate (archiviate)</option>
            <option value="respinta">🚫 Respinte</option>
            <option value="">📋 Tutte</option>
          </select>
          <button class="clean-btn" id="richieste-stampa" style="padding:8px 14px;">🖨️ Stampa elenco</button>
          <button class="clean-btn" id="richieste-csv" style="padding:8px 14px;">📋 Esporta CSV</button>
        </div>
        <div id="richieste-list-container">
          <div class="user-list-empty">⏳ Caricamento...</div>
        </div>
        <div class="modal-actions" style="margin-top:12px;">
          <button class="btn-cancel" id="richieste-close" style="flex:none;width:100%;">Chiudi</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('richieste-close').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.getElementById('richieste-filtro').addEventListener('change', function () {
    state.filtroStatoRichieste = this.value;
    caricaRichieste();
  });
  document.getElementById('richieste-stampa').addEventListener('click', stampaRichieste);
  document.getElementById('richieste-csv').addEventListener('click', esportaCSVRichieste);
  document.getElementById('richieste-filtro').value = state.filtroStatoRichieste;
  await caricaRichieste();
}

async function caricaRichieste() {
  const container = document.getElementById('richieste-list-container');
  container.innerHTML = '<div class="user-list-empty">⏳ Caricamento...</div>';

  if (!state.loggedUser || !state.loggedUser.accessToken) {
    container.innerHTML = '<div class="user-list-empty">❌ Sessione sicura non attiva. Esci e rifai il login, poi riprova.</div>';
    return;
  }
  try {
    const { ok, data } = await loadRichieste(state.filtroStatoRichieste, state.loggedUser.accessToken);
    if (!ok || !data.success) throw new Error(data.error || 'Errore caricamento');
    state.richiesteCache = data.richieste || [];

    if (!state.richiesteCache.length) {
      container.innerHTML = '<div class="user-list-empty">📭 Nessuna richiesta in questo stato.</div>';
      return;
    }

    let html = '<div style="font-size:13px;color:var(--ink-soft);margin-bottom:10px;">👆 Tocca una richiesta per aprirla</div>';
    state.richiesteCache.forEach(r => {
      const dataFmt = r.created_at ? new Date(r.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      const sportLabel = r.sport === 'tennis' ? '🎾' : r.sport === 'padel' ? '🏸' : '🎾🏸';
      let st;
      if (r.stato === 'nuova') st = { t: '🆕 Nuova', bg: '#fde8c8', c: '#8a4b00' };
      else if (r.stato === 'respinta') st = { t: '🚫 Respinta', bg: '#f8d7da', c: '#7a1f2b' };
      else st = { t: '✅ Lavorata', bg: '#d9f0df', c: '#1f6b3a' };
      const msg = r.messaggio ? escapeHtml(r.messaggio).slice(0, 60) : '—';
      html += `<div data-apri="${escapeHtml(r.id)}" style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px;cursor:pointer;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <strong style="font-size:16px;">${sportLabel} ${escapeHtml(r.nome + ' ' + r.cognome)}</strong>
          <span style="background:${st.bg};color:${st.c};padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;">${st.t}</span>
        </div>
        <div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">${dataFmt}</div>
        <div style="font-size:13px;margin-top:4px;">${msg}</div>
      </div>`;
    });
    container.innerHTML = html;
    container.querySelectorAll('[data-apri]').forEach(riga => {
      riga.addEventListener('click', function () {
        apriDettaglioRichiesta(riga.dataset.apri);
      });
    });
  } catch (e) {
    container.innerHTML = '<div class="user-list-empty">❌ ' + e.message + '</div>';
  }
}

export function apriDettaglioRichiesta(id) {
  const r = state.richiesteCache.find(x => String(x.id) === String(id));
  if (!r) return;
  const vecchia = document.getElementById('richiesta-dettaglio');
  if (vecchia) vecchia.remove();

  const dataFmt = r.created_at
    ? new Date(r.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  const sportLabel = r.sport === 'tennis' ? '🎾 Tennis'
                    : r.sport === 'padel' ? '🏸 Padel'
                    : '🎾🏸 Tennis e Padel';

  const nuova = r.stato === 'nuova';
  let stBg, stCol, stTxt;
  if (r.stato === 'nuova')      { stBg = '#fde8c8'; stCol = '#8a4b00'; stTxt = '🆕 Nuova'; }
  else if (r.stato === 'respinta') { stBg = '#f8d7da'; stCol = '#7a1f2b'; stTxt = '🚫 Respinta'; }
  else                          { stBg = '#d9f0df'; stCol = '#1f6b3a'; stTxt = '✅ Lavorata'; }

  const telPulito = String(r.telefono || '').replace(/[^\d+]/g, '');

  const box = document.createElement('div');
  box.id = 'richiesta-dettaglio';
  box.innerHTML = `
    <div class="rd-top">
      <button class="rd-back" id="rd-indietro">← Indietro</button>
      <div class="rd-top-title">Dettaglio richiesta</div>
    </div>
    <div class="rd-body">
      <span class="rd-status" style="background:${stBg};color:${stCol};">${stTxt}</span>
      <h2 class="rd-name">${escapeHtml(r.nome + ' ' + r.cognome)}</h2>
      <div class="rd-meta">Ricevuta il ${dataFmt}</div>

      <div class="rd-block">
        <div class="rd-label">Telefono</div>
        <div class="rd-value-phone">📱 ${escapeHtml(r.telefono || '—')}</div>
        <button class="rd-copy-btn" id="rd-contatta">📋 Copia numero di telefono</button>
      </div>

      <div class="rd-block">
        <div class="rd-label">Sport di interesse</div>
        <div class="rd-value-sport">${sportLabel}</div>
      </div>

      <div class="rd-block">
        <div class="rd-label">Messaggio</div>
        <div class="rd-value-msg">${r.messaggio ? escapeHtml(r.messaggio) : '—'}</div>
      </div>

      ${r.note_direttivo ? `
      <div class="rd-block">
        <div class="rd-label">Nota interna</div>
        <div class="rd-value-note">📝 ${escapeHtml(r.note_direttivo)}</div>
      </div>` : ''}
    </div>
    <div class="rd-actions">
      ${nuova
        ? `<button class="rd-btn-respingi" id="rd-respingi">🚫 Respingi richiesta</button>
           <button class="rd-btn-lavorata" id="rd-lavorata">✅ Richiesta lavorata</button>`
        : `<button class="rd-btn-lavorata" id="rd-chiudi" style="background:var(--surface);color:var(--accent);border:2px solid var(--accent);">Chiudi</button>`
      }
    </div>
  `;
  document.body.appendChild(box);
  const chiudi = () => box.remove();
  document.getElementById('rd-indietro').addEventListener('click', chiudi);

  const copiaBtn = document.getElementById('rd-contatta');
  copiaBtn.addEventListener('click', async function () {
    const b = this;
    let ok = false;
    try {
      await navigator.clipboard.writeText(telPulito);
      ok = true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = telPulito;
        ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (e2) { ok = false; }
    }
    const testoOrig = '📋 Copia numero di telefono';
    b.textContent = ok ? '✅ Numero copiato: ' + telPulito : '❌ Copia non riuscita: ' + telPulito;
    b.classList.add('copied');
    setTimeout(() => {
      b.textContent = testoOrig;
      b.classList.remove('copied');
    }, 2500);
  });

  const respingiBtn = document.getElementById('rd-respingi');
  if (respingiBtn) {
    respingiBtn.addEventListener('click', async function () {
      if (!confirm('Confermi di RESPINGERE la richiesta di ' + r.nome + ' ' + r.cognome + '?')) return;
      this.disabled = true;
      await azioneRichiesta(id, 'respinta');
      chiudi();
    });
  }

  const lavorataBtn = document.getElementById('rd-lavorata');
  if (lavorataBtn) {
    lavorataBtn.addEventListener('click', async function () {
      if (!confirm('Confermi di segnare come LAVORATA la richiesta di ' + r.nome + ' ' + r.cognome + '?')) return;
      this.disabled = true;
      await azioneRichiesta(id, 'lavorata');
      chiudi();
    });
  }

  const chiudiBtn = document.getElementById('rd-chiudi');
  if (chiudiBtn) chiudiBtn.addEventListener('click', chiudi);
}

async function azioneRichiesta(id, azione, nota) {
  if (!state.loggedUser || !state.loggedUser.accessToken) {
    showToast('❌ Devi essere loggato come admin.');
    return;
  }
  try {
    const { ok, data } = await aggiornaRichiesta(id, azione, state.loggedUser.accessToken, nota);
    if (!ok || !data.success) throw new Error(data.error || 'Errore');
    showToast('✅ Aggiornata');
    await caricaRichieste();
  } catch (e) {
    showToast('❌ ' + e.message);
  }
}

function stampaRichieste() {
  if (!state.richiesteCache.length) { showToast('Nessuna richiesta da stampare.'); return; }
  const area = document.getElementById('print-are-richieste');
  const dataOra = new Date().toLocaleString('it-IT');
  let html = '<h1>Richieste di contatto — Tennis Club Nulvi</h1>';
  html += '<div class="meta-stampa">Stampato il ' + dataOra + ' — Totale: ' + state.richiesteCache.length + '</div>';
  state.richiesteCache.forEach((r, i) => {
    const data = r.created_at ? new Date(r.created_at).toLocaleDateString('it-IT') : '';
    const sportLbl = r.sport === 'tennis' ? 'Tennis' : r.sport === 'padel' ? 'Padel' : 'Tennis + Padel';
    html += `<div class="rich-item">
      <strong>${i + 1}. ${escapeHtml(r.nome + ' ' + r.cognome)} — ${escapeHtml(r.telefono)}</strong>
      <div class="dett">📅 ${data} · Sport: ${sportLbl}</div>
      ${r.messaggio ? '<div class="dett">💬 ' + escapeHtml(r.messaggio) + '</div>' : ''}
      ${r.note_direttivo ? '<div class="dett">📝 Nota: ' + escapeHtml(r.note_direttivo) + '</div>' : ''}
    </div>`;
  });
  area.innerHTML = html;
  window.print();
  setTimeout(function () { area.innerHTML = ''; }, 500);
}

function esportaCSVRichieste() {
  if (!state.richiesteCache.length) { showToast('Nessuna richiesta da esportare.'); return; }
  const header = ['Data', 'Nome', 'Cognome', 'Telefono', 'Sport', 'Messaggio', 'Stato', 'Nota', 'Gestita da', 'Gestita il'];
  const rows = state.richiesteCache.map(r => [
    r.created_at ? new Date(r.created_at).toLocaleString('it-IT') : '',
    r.nome, r.cognome, r.telefono,
    r.sport || '',
    (r.messaggio || '').replace(/[\r\n]+/g, ' '),
    r.stato || '',
    (r.note_direttivo || '').replace(/[\r\n]+/g, ' '),
    r.gestita_da || '',
    r.gestita_il ? new Date(r.gestita_il).toLocaleString('it-IT') : ''
  ]);
  const csv = [header, ...rows].map(row =>
    row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')
  ).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'richieste_' + dateKey(new Date()) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('✅ CSV scaricato');
}
