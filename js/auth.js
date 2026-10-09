// ============================================================
// auth.js — Login, logout, ensureAuthUser, 2FA, admin toggle
// ============================================================

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { state } from './state.js';
import { dateKey, showToast, closeModal, escapeHtml, setLoginPinVisible } from './utils.js';
import { signInWithSupabaseAuth, ensureAuthUser, appLogin, verify2FA, setup2FA, verify2FASetup, disable2FA, getTotpStatus } from './api.js';
import { showLoggedInUI, showAuthUI, renderGuestExpiry, renderTesseratoExpiry, setAccent, renderFieldNote, renderUserBadge, updateCleanBtnVisibility } from './ui.js';
import { renderDow, renderCalendar, updateBookingDots } from './calendar.js';
import { renderSlots } from './slots.js';
import { mostraSceltaPin } from './pin.js';

// ---------- PREFILL ----------
export function prefillLastCodice() {
  let saved = '';
  try { saved = localStorage.getItem('lastLoginCodice') || ''; } catch (e) {}
  const el = document.getElementById('login-codice');
  if (el) el.value = saved;
}

// ---------- LOGIN ----------
export async function handleLogin() {
  const codice = document.getElementById('login-codice').value.trim().toLowerCase();
  const pinEl = document.getElementById('login-pin');
  const pin = pinEl ? pinEl.value.trim() : '';
  const errorEl = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');

  if (!codice) {
    errorEl.textContent = 'Inserisci il tuo codice ID.';
    return;
  }
  const isTesseratoCode = /^t[a-z0-9\-]{4,20}$/.test(codice);
  const isOspiteCode = /^o[a-z0-9]{7}$/.test(codice);
  if (!isTesseratoCode && !isOspiteCode) {
    errorEl.textContent = 'Codice non valido. Formato: tXXXX (tesserato) o oXXXXXXX (ospite).';
    return;
  }

  if (pin && !/^\d{6}$/.test(pin)) {
    errorEl.textContent = '⚠️ Il PIN deve essere di 6 cifre.';
    return;
  }

  errorEl.textContent = 'Verifica in corso...';
  loginBtn.disabled = true;

  try {
    const tipo = codice.startsWith('t') ? 'tesserato' : 'ospite';
    console.log('🔍 Cerco utente con codice [REDACTED]');

    const res = await appLogin(codice, pin);

    // ============ ORDINE CONTROLLI IMPORTANTE ============
    // 1. Rate limit (429) — priorità massima
    if (res.status === 429) {
      errorEl.textContent = 'Troppi tentativi. Riprova tra qualche minuto.';
      loginBtn.disabled = false;
      return;
    }

    // 2. 401: PIN richiesto o PIN sbagliato (DEVE venire PRIMA di !res.ok)
    if (res.status === 401) {
      const errResp = await res.json().catch(() => ({}));

      if (errResp.pin_required) {
        setLoginPinVisible(true);
        const pinInput = document.getElementById('login-pin');
        if (pinInput) pinInput.focus();
        errorEl.textContent = '⚠️ Inserisci il tuo PIN per accedere.';
        loginBtn.disabled = false;
        return;
      }

      if (errResp.error === 'PIN non corretto') {
        errorEl.textContent = '❌ PIN non corretto. Riprova.';
        const pinInput = document.getElementById('login-pin');
        if (pinInput) { pinInput.value = ''; pinInput.focus(); }
        loginBtn.disabled = false;
        return;
      }

      errorEl.textContent = errResp.error || 'Accesso negato.';
      loginBtn.disabled = false;
      return;
    }

    // 3. Ora è sicuro controllare !res.ok (401 e 429 già gestiti sopra)
    if (!res.ok) throw new Error('Errore di connessione');
    // ======================================================

    const loginResp = await res.json();
    const data = loginResp.utente ? [loginResp.utente] : [];
    console.log('📦 Dati ricevuti (struttura utente):', data.map(u => ({ id: u.id, nome: u.nome, tipo: u.tipo })));

    if (data.length === 0) {
      errorEl.textContent = '❌ Codice non valido. Controlla di averlo scritto bene.';
      loginBtn.disabled = false;
      return;
    }

    const utente = data[0];

    if (tipo === 'ospite') {
      const oggi = dateKey(new Date());
      const scaduto = utente.scadenza && utente.scadenza < oggi;
      const inattivo = utente.attivo === false;
      if (scaduto || inattivo) {
        errorEl.textContent = '';
        loginBtn.disabled = false;
        const { mostraFormRichiestaContatto } = await import('./richieste-contatto.js');
        mostraFormRichiestaContatto({
          nome: utente.nome,
          cognome: utente.cognome,
          sport: utente.is_tennis_member && utente.is_padel_member ? 'both'
               : utente.is_tennis_member ? 'tennis'
               : utente.is_padel_member ? 'padel' : 'both',
          codice: utente.codice
        });
        return;
      }
    }

    if (utente.is_admin && utente.totp_enabled) {
      console.log('🔐 Admin richiede 2FA');
      showLoggedInUI();
      state.loggedUser = {
        id: utente.id,
        nome: utente.nome,
        cognome: utente.cognome,
        codice: utente.codice,
        tipo: tipo,
        is_tennis_member: utente.is_tennis_member || false,
        is_padel_member: utente.is_padel_member || false,
        is_admin: utente.is_admin || false,
        is_direttivo: utente.is_direttivo || false,
        can_book_special: utente.can_book_special || false,
        scadenza: utente.scadenza || null,
        totp_enabled: utente.totp_enabled || false,
        pin_set: utente.pin_set === true,
        authenticated: !!(loginResp.session && loginResp.session.access_token),
        accessToken: loginResp.session ? loginResp.session.access_token : null
      };
      renderUserBadge();
      try { localStorage.setItem('lastLoginCodice', state.loggedUser.codice); } catch (e) {}
      renderGuestExpiry();
      setupAdminToggle();
      updateCleanBtnVisibility();
      renderTesseratoExpiry();
      setAccent(state.currentField);
      renderFieldNote();
      renderDow();
      renderCalendar();
      showToast('🔐 Accesso riuscito! Attiva la modalità admin per continuare.');
      errorEl.textContent = '';
      loginBtn.disabled = false;
      return;
    }

    await completeLogin(utente, tipo, pin, loginResp.session);
  } catch (e) {
    errorEl.textContent = 'Errore di connessione. Riprova.';
    loginBtn.disabled = false;
    console.error('❌ Errore:', e);
  }
}

export async function completeLogin(utente, tipo, pin, sessionFromAppLogin) {
  let accessToken = null;

  if (sessionFromAppLogin && sessionFromAppLogin.access_token) {
    accessToken = sessionFromAppLogin.access_token;
    console.log('🔐 Sessione ottenuta da app-login');
  } else {
    const authEmail = utente.codice + '@circolo.local';
    const authPassword = (utente.pin_set && pin) ? (utente.codice + ':' + pin) : utente.codice;
    try {
      const authData = await signInWithSupabaseAuth(authEmail, authPassword);
      accessToken = authData.access_token;
      console.log('🔐 Login Supabase Auth riuscito (fallback)');
    } catch (e) {
      console.warn('⚠️ Nessuna sessione disponibile:', e);
    }
  }

  state.loggedUser = {
    id: utente.id,
    nome: utente.nome,
    cognome: utente.cognome,
    codice: utente.codice,
    tipo: tipo,
    is_tennis_member: utente.is_tennis_member || false,
    is_padel_member: utente.is_padel_member || false,
    is_admin: utente.is_admin || false,
    is_direttivo: utente.is_direttivo || false,
    can_book_special: utente.can_book_special || false,
    scadenza: utente.scadenza || null,
    totp_enabled: utente.totp_enabled || false,
    pin_set: utente.pin_set === true,
    authenticated: !!accessToken,
    accessToken: accessToken
  };

  console.log('✅ Utente loggato:', state.loggedUser.nome, state.loggedUser.cognome);
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-btn').disabled = false;
  try { localStorage.setItem('lastLoginCodice', state.loggedUser.codice); } catch (e) {}

  showLoggedInUI();
  renderUserBadge();
  renderGuestExpiry();
  setupAdminToggle();
  updateCleanBtnVisibility();
  renderTesseratoExpiry();
  renderFieldNote();
  updateBookingDots();
  if (state.selectedDate) { renderSlots(); }

  if (accessToken) {
    setTimeout(function () { showToast('🔐 Login sicuro attivo'); }, 400);
  }

  // ===== STEP 3a: se il tesserato non ha ancora il PIN, chiediglielo =====
  if (!state.loggedUser.pin_set && state.loggedUser.tipo === 'tesserato') {
    setTimeout(function () {
      mostraSceltaPin(true, function (ok) {
        if (ok) {
          showToast('🎉 Benvenuto! Ora puoi prenotare.');
        }
      });
    }, 600);
  }
}

// ---------- LOGOUT ----------
export function handleLogout() {
  state.loggedUser = null;
  state.adminMode = false;
  showAuthUI();
  setLoginPinVisible(false);
  prefillLastCodice();
  const pinEl = document.getElementById('login-pin');
  if (pinEl) pinEl.value = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('guest-expiry').style.display = 'none';
  document.getElementById('tesserato-expiry').style.display = 'none';
  renderFieldNote();
  updateBookingDots();
  state.selectedDate = null;
  document.getElementById('slots-section').style.display = 'none';
}

// ---------- ADMIN TOGGLE ----------
export function setupAdminToggle() {
  const container = document.getElementById('admin-toggle-container');
  const toggle = document.getElementById('admin-toggle');
  const usersBtn = document.getElementById('admin-users-btn');
  const keyboxBtn = document.getElementById('admin-keybox-btn');
  const twoFABtn = document.getElementById('admin-2fa-btn');
  const statusEl = document.getElementById('admin-2fa-status');
  const loggedUser = state.loggedUser;

  if (loggedUser && loggedUser.is_admin === true) {
    container.style.display = 'flex';
    usersBtn.style.display = 'inline-block';
    keyboxBtn.style.display = 'inline-block';
    twoFABtn.style.display = 'inline-block';
    toggle.checked = false;
    state.adminMode = false;

    if (loggedUser.totp_enabled) {
      statusEl.innerHTML = '<span class="badge-2fa-enabled">🔐 2FA ON</span>';
    } else {
      statusEl.innerHTML = '<span class="badge-2fa-disabled">⚠️ 2FA OFF</span>';
    }

    toggle.onchange = function () {
      if (this.checked) {
        if (loggedUser.totp_enabled) {
          openAdmin2FAVerification(async function (success) {
            const toggleEl = document.getElementById('admin-toggle');
            if (success) {
              if (!loggedUser.accessToken) {
                try {
                  const authData = await signInWithSupabaseAuth(loggedUser.codice + '@circolo.local', loggedUser.codice);
                  loggedUser.accessToken = authData.access_token;
                  loggedUser.authenticated = true;
                } catch (authErr) {
                  console.warn('⚠️ Auth non disponibile dopo 2FA');
                }
              }
              state.adminMode = true;
              showToast('🔑 Modalità admin attivata (2FA verificato)');
              renderSlots();
              toggleEl.checked = true;
            } else {
              state.adminMode = false;
              toggleEl.checked = false;
            }
          });
        } else {
          (async function () {
            try {
              if (!loggedUser.accessToken) {
                const authData = await signInWithSupabaseAuth(loggedUser.codice + '@circolo.local', loggedUser.codice);
                loggedUser.accessToken = authData.access_token;
                loggedUser.authenticated = true;
              }
              state.adminMode = true;
              showToast('🔑 Modalità admin attivata');
              renderSlots();
              document.getElementById('admin-toggle').checked = true;
            } catch (authErr) {
              console.warn('⚠️ Auth non disponibile (admin senza 2FA):', authErr);
              showToast('🔒 Impossibile ottenere sessione sicura.');
              document.getElementById('admin-toggle').checked = false;
              state.adminMode = false;
            }
          })();
        }
      } else {
        state.adminMode = false;
        showToast('🔑 Modalità admin disattivata');
        renderSlots();
        this.checked = false;
      }
    };

    usersBtn.onclick = function () {
      if (!state.adminMode) { showToast('🔑 Attiva prima la modalità Admin'); return; }
      import('./admin-users.js').then(m => m.openUserManagement());
    };
    keyboxBtn.onclick = function () {
      if (!state.adminMode) { showToast('🔑 Attiva prima la modalità Admin'); return; }
      import('./admin-keybox.js').then(m => m.openKeyboxManagement());
    };
    twoFABtn.onclick = function () {
      if (!state.adminMode) { showToast('🔑 Attiva prima la modalità Admin'); return; }
      open2FAManagement();
    };

    const richiesteBtn = document.getElementById('admin-richieste-btn');
    if (richiesteBtn) {
      richiesteBtn.style.display = 'inline-block';
      richiesteBtn.onclick = function () {
        if (!state.adminMode) { showToast('🔑 Attiva prima la modalità Admin'); return; }
        import('./admin-richieste.js').then(m => m.openRichiestePanel());
      };
    }
  } else if (loggedUser && loggedUser.is_direttivo === true) {
    container.style.display = 'none';
    usersBtn.style.display = 'none';
    keyboxBtn.style.display = 'none';
    twoFABtn.style.display = 'none';
    statusEl.innerHTML = '';
    const richiesteBtn = document.getElementById('admin-richieste-btn');
    if (richiesteBtn) {
      richiesteBtn.style.display = 'inline-block';
      richiesteBtn.onclick = function () {
        import('./admin-richieste.js').then(m => m.openRichiestePanel());
      };
    }
  } else {
    container.style.display = 'none';
    usersBtn.style.display = 'none';
    keyboxBtn.style.display = 'none';
    twoFABtn.style.display = 'none';
    statusEl.innerHTML = '';
    const richiesteBtn = document.getElementById('admin-richieste-btn');
    if (richiesteBtn) richiesteBtn.style.display = 'none';
  }
}

// ---------- 2FA VERIFY (toggle admin) ----------
export function openAdmin2FAVerification(callback) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" style="max-width:480px;">
        <h2>🔐 Verifica Admin</h2>
        <p class="modal-subtitle">Inserisci il codice 2FA da Proton Authenticator per abilitare la modalità admin.</p>
        <div class="name-field">
          <label for="admin-verify-code">Codice 2FA (6 cifre)</label>
          <input id="admin-verify-code" type="text" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="off" />
        </div>
        <div class="form-error" id="admin-verify-error"></div>
        <div class="modal-actions">
          <button class="btn-cancel" id="admin-verify-cancel">Annulla</button>
          <button class="btn-confirm" id="admin-verify-confirm">🔓 Verifica</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('admin-verify-cancel').addEventListener('click', function () {
    closeModal();
    showToast('❌ Verifica 2FA annullata');
    if (typeof callback === 'function') callback(false);
  });
  document.getElementById('overlay').addEventListener('click', function (e) {
    if (e.target.id === 'overlay') {
      closeModal();
      showToast('❌ Verifica 2FA annullata');
      if (typeof callback === 'function') callback(false);
    }
  });
  document.getElementById('admin-verify-confirm').addEventListener('click', async function () {
    const code = document.getElementById('admin-verify-code').value.trim();
    const errorEl = document.getElementById('admin-verify-error');
    const confirmBtn = document.getElementById('admin-verify-confirm');
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      errorEl.textContent = 'Inserisci un codice valido a 6 cifre';
      return;
    }
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Verifico...';
    errorEl.textContent = '';

    const { ok, data } = await verify2FA(state.loggedUser.id, state.loggedUser.tipo, code);
    if (!ok || !data.authenticated) {
      errorEl.textContent = data.error || '❌ Codice 2FA non valido';
      confirmBtn.disabled = false;
      confirmBtn.textContent = '🔓 Verifica';
      return;
    }
    closeModal();
    showToast('✅ Verifica 2FA riuscita!' + (data.warning ? ' ' + data.warning : ''));
    if (typeof callback === 'function') callback(true);
  });
}

// ---------- 2FA MANAGEMENT ----------
export async function open2FAManagement() {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" style="max-width:520px;">
        <h2>🔐 Gestione 2FA</h2>
        <p class="modal-subtitle">Configura l'autenticazione a due fattori per proteggere il tuo account admin.</p>
        <div id="2fa-status-container"></div>
        <div class="modal-actions" style="margin-top:16px;">
          <button class="btn-cancel" id="2fa-close" style="flex:none;width:100%;">Chiudi</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('2fa-close').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', function (e) {
    if (e.target.id === 'overlay') closeModal();
  });
  await load2FAStatus();
}

export async function load2FAStatus() {
  try {
    const payload = await getTotpStatus(state.loggedUser.accessToken);
    const totp_enabled = !!(payload && payload.totp_enabled);
    const statusContainer = document.getElementById('2fa-status-container');

    if (totp_enabled) {
      statusContainer.innerHTML = `
        <div style="background:#D9E9E1;border:1px solid #2B6E5A;border-radius:8px;padding:14px;margin-bottom:16px;">
          <p style="margin:0;color:#2B6E5A;font-weight:600;">✅ 2FA Attivo</p>
          <p style="margin:4px 0 0;font-size:13px;color:#2B6E5A;">Il tuo account è protetto con autenticazione a due fattori.</p>
        </div>
        <button class="clean-btn" id="2fa-disable-btn" style="width:100%;background:#F4DFD2;color:#B84B1E;border:1px solid #D9A583;">🔓 Disabilita 2FA</button>
      `;
      document.getElementById('2fa-disable-btn').addEventListener('click', function () {
        open2FADisableModal();
      });
    } else {
      statusContainer.innerHTML = `
        <div style="background:#FFF4E0;border:1px solid #E8C989;border-radius:8px;padding:14px;margin-bottom:16px;">
          <p style="margin:0;color:#8a6a1a;font-weight:600;">⚠️ 2FA Non Attivo</p>
          <p style="margin:4px 0 0;font-size:13px;color:#8a6a1a;">Attiva l'autenticazione a due fattori per proteggere il tuo account admin.</p>
        </div>
        <button class="btn-confirm" id="2fa-setup-btn" style="width:100%;">🔐 Configura 2FA</button>
        <div id="2fa-setup-container" style="margin-top:16px;"></div>
      `;
      document.getElementById('2fa-setup-btn').addEventListener('click', function () {
        start2FASetup();
      });
    }
  } catch (e) {
    console.error('❌ Errore caricamento 2FA status:', e);
    document.getElementById('2fa-status-container').innerHTML = '<p style="color:var(--tennis);">❌ Errore nel caricamento</p>';
  }
}

export async function start2FASetup() {
  const setupContainer = document.getElementById('2fa-setup-container');
  setupContainer.innerHTML = '<p style="text-align:center;color:var(--ink-soft);">⏳ Preparo setup 2FA...</p>';

  const { ok, data } = await setup2FA(state.loggedUser.id, state.loggedUser.tipo, state.loggedUser.accessToken);
  if (!ok) {
    setupContainer.innerHTML = '<p style="color:var(--tennis);">❌ Errore: ' + (data.error || 'setup fallito') + '</p>';
    return;
  }

  setupContainer.innerHTML = `
    <div style="background:var(--accent-soft);border-radius:8px;padding:16px;margin-bottom:16px;text-align:center;">
      <p style="margin:0 0 12px;font-size:14px;color:var(--ink-soft);font-weight:600;">📱 Scansiona con Proton Authenticator</p>
      <img src="${data.qrCode}" style="width:200px;height:200px;border-radius:8px;border:2px solid var(--accent);" alt="QR Code 2FA" />
      <p style="margin:12px 0 0;font-size:12px;color:var(--ink-soft);">O inserisci manualmente:</p>
      <code style="display:block;background:var(--surface);padding:8px;border-radius:6px;margin:8px 0;font-family:monospace;font-size:12px;word-break:break-all;color:var(--ink);">${data.secret}</code>
    </div>
    <div style="background:#FFF4E0;border:1px solid #E8C989;border-radius:8px;padding:12px;margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#8a6a1a;">📋 Backup Codes (salva in un luogo sicuro)</p>
      <div style="background:var(--surface);padding:10px;border-radius:6px;font-family:monospace;font-size:12px;color:var(--ink);line-height:1.6;">
        ${data.backupCodes.map(code => '<div>' + code + '</div>').join('')}
      </div>
    </div>
    <div class="name-field">
      <label for="2fa-confirm-code">Inserisci il codice a 6 cifre da Proton Authenticator</label>
      <input id="2fa-confirm-code" type="text" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="off" />
    </div>
    <div class="form-error" id="2fa-setup-error"></div>
    <div style="display:flex;gap:10px;margin-top:12px;">
      <button class="btn-cancel" id="2fa-setup-cancel" style="flex:1;padding:12px;border-radius:8px;border:1px solid var(--line);background:var(--surface);cursor:pointer;font-family:inherit;font-weight:600;">Annulla</button>
      <button class="btn-confirm" id="2fa-setup-confirm" style="flex:1;padding:12px;border-radius:8px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-family:inherit;font-weight:600;">✅ Attiva 2FA</button>
    </div>
  `;
  document.getElementById('2fa-setup-cancel').addEventListener('click', function () {
    setupContainer.innerHTML = '';
  });
  document.getElementById('2fa-setup-confirm').addEventListener('click', async function () {
    const code = document.getElementById('2fa-confirm-code').value.trim();
    const errorEl = document.getElementById('2fa-setup-error');
    const confirmBtn = document.getElementById('2fa-setup-confirm');
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      errorEl.textContent = 'Inserisci un codice valido a 6 cifre';
      return;
    }
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Attivo...';
    errorEl.textContent = '';

    const { ok, data } = await verify2FASetup(state.loggedUser.id, state.loggedUser.tipo, code, state.loggedUser.accessToken);
    if (!ok) {
      errorEl.textContent = '❌ ' + (data.error || 'Verifica fallita');
      confirmBtn.disabled = false;
      confirmBtn.textContent = '✅ Attiva 2FA';
      return;
    }
    showToast('✅ 2FA attivato con successo!');
    state.loggedUser.totp_enabled = true;
    await load2FAStatus();
    const statusEl = document.getElementById('admin-2fa-status');
    if (statusEl) statusEl.innerHTML = '<span class="badge-2fa-enabled">🔐 2FA ON</span>';
  });
}

export async function open2FADisableModal() {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="modal" role="dialog" aria-modal="true" style="max-width:480px;">
        <h2>🔓 Disabilita 2FA</h2>
        <p class="modal-subtitle">Inserisci il codice da Proton Authenticator per confermare la disabilitazione.</p>
        <div class="name-field">
          <label for="2fa-disable-code">Codice 2FA (6 cifre)</label>
          <input id="2fa-disable-code" type="text" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="off" />
        </div>
        <div class="form-error" id="2fa-disable-error"></div>
        <div class="modal-actions">
          <button class="btn-cancel" id="2fa-disable-cancel">Annulla</button>
          <button class="btn-confirm" id="2fa-disable-confirm" style="background:#B84B1E;">🔓 Disabilita</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('2fa-disable-cancel').addEventListener('click', closeModal);
  document.getElementById('overlay').addEventListener('click', function (e) {
    if (e.target.id === 'overlay') closeModal();
  });
  document.getElementById('2fa-disable-confirm').addEventListener('click', async function () {
    const code = document.getElementById('2fa-disable-code').value.trim();
    const errorEl = document.getElementById('2fa-disable-error');
    const confirmBtn = document.getElementById('2fa-disable-confirm');
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      errorEl.textContent = 'Inserisci un codice valido a 6 cifre';
      return;
    }
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Disabilito...';
    errorEl.textContent = '';

    const { ok, data } = await disable2FA(state.loggedUser.id, state.loggedUser.tipo, code, state.loggedUser.accessToken);
    if (!ok) {
      errorEl.textContent = '❌ ' + (data.error || 'Disabilitazione fallita');
      confirmBtn.disabled = false;
      confirmBtn.textContent = '🔓 Disabilita';
      return;
    }
    showToast('✅ 2FA disabilitato');
    state.loggedUser.totp_enabled = false;
    closeModal();
    await open2FAManagement();
    const statusEl = document.getElementById('admin-2fa-status');
    if (statusEl) statusEl.innerHTML = '<span class="badge-2fa-disabled">⚠️ 2FA OFF</span>';
  });
}
