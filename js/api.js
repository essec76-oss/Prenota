// ============================================================
// api.js — Tutte le chiamate a Supabase (REST, Auth, Edge Functions, RPC)
// ============================================================

import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_TABLE } from './config.js';
import { state } from './state.js';

// ---------- AUTH ----------
export async function signInWithSupabaseAuth(email, password) {
  const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error('auth_failed');
  return await res.json();
}

// Assicura che l'utente Auth esista, allinea password e auth_id.
// Se riceve un `pin`, la password diventa `codice:pin` invece di `codice`.
export async function ensureAuthUser(codice, pin) {
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/super-endpoint', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ codice, pin: pin || null })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('⚠️ ensure-auth-user:', data.error || res.status);
      return false;
    }
    console.log('🛠️ ensure-auth-user OK per [REDACTED]', { success: data.success });
    return true;
  } catch (e) {
    console.warn('⚠️ ensure-auth-user rete:', e);
    return false;
  }
}

export async function appLogin(codice, pin) {
  const res = await fetch(SUPABASE_URL + '/functions/v1/app-login', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ codice, pin: pin || '' })
  });
  return res;
}

// ---------- BOOKINGS ----------
export async function loadBookings(key, field) {
  try {
    const url = SUPABASE_URL + '/rest/v1/' + SUPABASE_TABLE
      + '?select=id,time,names,prenotato_da,tipo_prenotante,tesserato_id,ospite_id,modalita'
      + '&field=eq.' + encodeURIComponent(field)
      + '&date=eq.' + encodeURIComponent(key);
    const res = await fetch(url, { headers: { apikey: SUPABASE_KEY } });
    if (!res.ok) throw new Error('fetch failed');
    const rows = await res.json();
    const data = {};
    rows.forEach(r => {
      data[r.time] = {
        id: r.id,
        names: (r.names || '').split(',').map(s => s.trim()).filter(Boolean),
        prenotato_da: r.prenotato_da || '',
        tipo_prenotante: r.tipo_prenotante || 'ospite',
        tesserato_id: r.tesserato_id,
        ospite_id: r.ospite_id,
        modalita: r.modalita || null
      };
    });
    state.bookingsCache[key] = data;
    return data;
  } catch (e) {
    state.bookingsCache[key] = {};
    return {};
  }
}

export async function loadMonthDates(field, year, month, padFn) {
  const start = year + '-' + padFn(month + 1) + '-01';
  const nextMonth = new Date(year, month + 1, 1);
  const end = nextMonth.getFullYear() + '-' + padFn(nextMonth.getMonth() + 1) + '-01';
  try {
    const url = SUPABASE_URL + '/rest/v1/' + SUPABASE_TABLE
      + '?select=date,modalita&field=eq.' + encodeURIComponent(field)
      + '&date=gte.' + start + '&date=lt.' + end;
    const res = await fetch(url, { headers: { apikey: SUPABASE_KEY } });
    if (!res.ok) return new Map();
    const rows = await res.json();
    const countMap = new Map();
    rows.forEach(r => {
      const entry = countMap.get(r.date) || { count: 0, torneo: false, allenamento: false };
      entry.count += 1;
      if (r.modalita === 'torneo') entry.torneo = true;
      if (r.modalita === 'allenamento') entry.allenamento = true;
      countMap.set(r.date, entry);
    });
    return countMap;
  } catch (e) {
    return new Map();
  }
}

export async function createBooking(payload) {
  const res = await fetch(SUPABASE_URL + '/functions/v1/create-booking', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

export async function deleteBooking(bookingId, code) {
  const res = await fetch(SUPABASE_URL + '/functions/v1/delete-booking', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ bookingId, code })
  });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

export async function adminDeleteBooking(bookingId, accessToken) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + SUPABASE_TABLE
    + '?id=eq.' + encodeURIComponent(bookingId), {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_KEY,
      Prefer: 'return=minimal',
      Authorization: 'Bearer ' + (accessToken || SUPABASE_KEY)
    }
  });
  return res.ok;
}

export async function deleteOldBookings(cutoffDate, accessToken) {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + SUPABASE_TABLE
      + '?date=lt.' + cutoffDate, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {})
      }
    });
    return res.ok;
  } catch (e) {
    console.error('❌ Errore nella cancellazione:', e);
    return false;
  }
}

export async function fetchOwnCode(bookingId, codice, accessToken) {
  const res = await fetch(SUPABASE_URL + '/functions/v1/hyper-function', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + accessToken
    },
    body: JSON.stringify({ bookingId, codice })
  });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, data };
}

// ---------- KEYBOX ----------
export async function loadKeyboxCodes(accessToken) {
  try {
    const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
    if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_keybox_codes', {
      method: 'POST',
      headers: headers,
      body: '{}'
    });
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    return {
      tennis: (data && data.tennis) || null,
      padel: (data && data.padel) || null
    };
  } catch (e) {
    return { tennis: null, padel: null };
  }
}

// ---------- GIOCATORI ----------
export async function loadAllPlayers() {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_giocatori_attivi', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (!res.ok) throw new Error('fetch failed');
    const rows = await res.json();
    const oggi = new Date().toISOString().slice(0, 10);

    const tesserati = rows
      .filter(r => r.tipo === 'tesserato')
      .map(r => ({
        nome: r.nome,
        cognome: r.cognome,
        is_tennis_member: !!r.is_tennis_member,
        is_padel_member: !!r.is_padel_member
      }));

    const ospiti = rows
      .filter(r => r.tipo === 'ospite' && (!r.scadenza || r.scadenza >= oggi))
      .map(r => ({
        nome: r.nome,
        cognome: r.cognome,
        is_tennis_member: !!r.is_tennis_member,
        is_padel_member: !!r.is_padel_member
      }));

    return { tesserati, ospiti };
  } catch (e) {
    console.error('Errore caricamento giocatori:', e);
    return { tesserati: [], ospiti: [] };
  }
}

// ---------- ADMIN ----------
export async function loadAdminUsers(tipo, accessToken) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_admin_users', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + accessToken
    },
    body: JSON.stringify({ tipo })
  });
  if (!res.ok) throw new Error('Errore caricamento utenti');
  return await res.json();
}

export async function generateUniqueCode(tipo, accessToken, tentativi = 0) {
  if (tentativi >= 20) throw new Error('Impossibile generare un codice univoco dopo 20 tentativi');
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let codice;
  if (tipo === 'tesserato') {
    let suffix = '';
    for (let i = 0; i < 11; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    codice = 't' + suffix;
  } else {
    let suffix = '';
    for (let i = 0; i < 7; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    codice = 'o' + suffix;
  }
  const checkRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/codice_libero', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (accessToken || SUPABASE_KEY)
    },
    body: JSON.stringify({ p_codice: codice })
  });
  if (!checkRes.ok) throw new Error('Errore verifica codice');
  const isFree = await checkRes.json();
  if (isFree !== true) {
    console.log('🔄 Codice già esistente, ritento...');
    return generateUniqueCode(tipo, accessToken, tentativi + 1);
  }
  return codice;
}

// ---------- RICHIESTE ----------
export async function loadRichieste(filtroStato, accessToken) {
  const url = '/api/richieste' + (filtroStato ? '?stato=' + encodeURIComponent(filtroStato) : '');
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + accessToken }
  });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, data };
}

export async function inviaRichiesta(payload) {
  const res = await fetch('/api/richieste', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, data };
}

export async function aggiornaRichiesta(id, azione, accessToken, nota) {
  const res = await fetch('/api/richieste', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + accessToken
    },
    body: JSON.stringify({ id, azione, note_direttivo: nota || null })
  });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, data };
}

// ---------- 2FA ----------
export async function verify2FA(userId, tipo, code) {
  const res = await fetch('/api/2fa-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, tipo, code })
  });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, data };
}

export async function setup2FA(userId, tipo, accessToken) {
  const res = await fetch('/api/2fa-setup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + accessToken
    },
    body: JSON.stringify({ userId, tipo })
  });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, data };
}

export async function verify2FASetup(userId, tipo, code, accessToken) {
  const res = await fetch('/api/2fa-verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + accessToken
    },
    body: JSON.stringify({ userId, tipo, code })
  });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, data };
}

export async function disable2FA(userId, tipo, code, accessToken) {
  const res = await fetch('/api/2fa-disable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + accessToken
    },
    body: JSON.stringify({ userId, tipo, code })
  });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, data };
}

export async function getTotpStatus(accessToken) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_totp_status', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + accessToken
    },
    body: '{}'
  });
  if (!res.ok) throw new Error('Errore caricamento status');
  return await res.json();
}

// ---------- KEYBOX UPDATE ----------
export async function updateKeybox(codiceTennis, codicePadel, accessToken) {
  const res = await fetch('/api/update-keybox', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + accessToken
    },
    body: JSON.stringify({
      codice_keybox_tennis: codiceTennis,
      codice_keybox_padel: codicePadel
    })
  });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, data };
}

// ---------- GUEST ----------
export async function createGuest(nome, cognome, sport, telefono, pin) {
  const res = await fetch('/api/create-guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, cognome, sport, telefono, pin: pin || null })
  });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, data };
}

export async function loadGuestSlots() {
  const res = await fetch('/api/guest-slots');
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return data;
}

// ---------- USER UPDATE (admin) ----------
export async function updateUser(tableName, id, payload, accessToken) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + tableName + '?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      Authorization: 'Bearer ' + accessToken
    },
    body: JSON.stringify(payload)
  });
  return res.ok;
}

export async function createUser(tableName, payload, accessToken) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + tableName, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      Authorization: 'Bearer ' + accessToken
    },
    body: JSON.stringify(payload)
  });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

export async function deleteUserRecord(tableName, id, accessToken) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + tableName + '?id=eq.' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      Authorization: 'Bearer ' + accessToken
    }
  });
  return res.ok;
}

export async function deleteUserBookings(id, tableName, accessToken) {
  const fkColumn = tableName === 'Tesserati' ? 'tesserato_id' : 'ospite_id';
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + SUPABASE_TABLE
    + '?' + fkColumn + '=eq.' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      Authorization: 'Bearer ' + accessToken
    }
  });
  return res.ok;
}

export async function checkFutureBookings(id, tableName) {
  const fkColumn = tableName === 'Tesserati' ? 'tesserato_id' : 'ospite_id';
  const todayKey = new Date().toISOString().slice(0, 10);
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + SUPABASE_TABLE
    + '?select=date,time,field'
    + '&' + fkColumn + '=eq.' + encodeURIComponent(id)
    + '&date=gte.' + encodeURIComponent(todayKey)
    + '&order=date.asc,time.asc', {
    headers: { apikey: SUPABASE_KEY }
  });
  if (!res.ok) return [];
  return await res.json();
}

export async function loadPrenotazioniAdmin(tipo) {
  const url = SUPABASE_URL + '/rest/v1/' + SUPABASE_TABLE
    + '?select=id,date,time,field,names,prenotato_da,modalita'
    + '&tipo_prenotante=eq.' + encodeURIComponent(tipo)
    + '&date=gte.' + new Date().toISOString().slice(0, 10)
    + '&order=date.asc,time.asc';
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY } });
  if (!res.ok) throw new Error('Errore caricamento prenotazioni');
  return await res.json();
}
