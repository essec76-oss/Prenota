// ============================================================
// API Route Vercel — Richieste di contatto con il direttivo
// ============================================================
// GET  -> elenco richieste (solo admin/direttivo autenticato)
// POST -> azione: 'crea' (PUBBLICA, da ospite scaduto)
//                 'lavorata' | 'archiviata' | 'nota' (admin/direttivo)
// ============================================================

const SUPABASE_URL = 'https://smwtbonxhvhrnyukrluw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------- AUTH ADMIN/DIRETTIVO ----------
async function verificaDirettivoOAdmin(req) {
  const authHeader = req.headers['authorization'] || '';
  const userToken = authHeader.replace(/^Bearer\s+/i, '');

  if (!userToken) {
    return { ok: false, status: 401, error: 'Devi essere autenticato.' };
  }

  const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + userToken
    }
  });
  if (!userRes.ok) {
    return { ok: false, status: 401, error: 'Sessione non valida.' };
  }

  const authUser = await userRes.json();

  const checkRes = await fetch(
    SUPABASE_URL + '/rest/v1/Tesserati?select=id,nome,cognome,is_admin,is_direttivo&auth_id=eq.' + encodeURIComponent(authUser.id),
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + SERVICE_ROLE_KEY
      }
    }
  );
  const checkData = await checkRes.json();

  if (!checkRes.ok || !checkData.length || (checkData[0].is_admin !== true && checkData[0].is_direttivo !== true)) {
    return { ok: false, status: 403, error: 'Non hai i permessi.' };
  }
  return { ok: true, richiedente: checkData[0] };
}

// ---------- GET: elenco richieste ----------
async function listaRichieste(req, res) {
  const stato = (req.query && req.query.stato) ? req.query.stato : null;
  let url = SUPABASE_URL + '/rest/v1/richieste_direttivo'
    + '?select=id,created_at,nome,cognome,telefono,sport,messaggio,privacy_ok,codice_ospite_originale,stato,note_direttivo,gestita_da,gestita_il'
    + '&order=created_at.desc';
  if (stato) url += '&stato=eq.' + encodeURIComponent(stato);

  const r = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY
    }
  });
  if (!r.ok) return res.status(500).json({ error: 'Errore caricamento richieste.' });
  const data = await r.json();
  return res.status(200).json({ success: true, richieste: data });
}

// ---------- POST: crea richiesta (PUBBLICA) ----------
async function creaRichiesta(req, res) {
  const body = req.body || {};
  const nome = (body.nome || '').trim();
  const cognome = (body.cognome || '').trim();
  const telefono = (body.telefono || '').trim();
  const sport = (body.sport || '').trim() || null;
  const messaggio = (body.messaggio || '').trim() || null;
  const privacy_ok = body.privacy_ok === true;
  const codice_ospite_originale = (body.codice_ospite_originale || '').trim() || null;

  // Validazione
  if (!nome || !cognome || !telefono) {
    return res.status(400).json({ error: 'Nome, cognome e telefono sono obbligatori.' });
  }
  if (!privacy_ok) {
    return res.status(400).json({ error: 'Devi accettare il trattamento dei dati.' });
  }
  if (!['tennis', 'padel', 'both'].includes(sport)) {
    return res.status(400).json({ error: 'Sport non valido.' });
  }
  if (telefono.length < 6 || telefono.length > 25) {
    return res.status(400).json({ error: 'Numero di telefono non valido.' });
  }

  // Anti-spam: se arriva un codice_ospite_originale, deve esistere
  // ed essere SCADUTO (o inattivo). Altrimenti rifiuto.
  if (codice_ospite_originale) {
    const checkRes = await fetch(
      SUPABASE_URL + '/rest/v1/Ospiti?select=id,scadenza,attivo&codice=eq.' + encodeURIComponent(codice_ospite_originale),
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: 'Bearer ' + SERVICE_ROLE_KEY
        }
      }
    );
    const rows = await checkRes.json();
    if (!checkRes.ok || !rows.length) {
      return res.status(400).json({ error: 'Codice ospite non valido.' });
    }
    const ospite = rows[0];
    const oggi = new Date().toISOString().slice(0, 10);
    const scaduto = ospite.scadenza && ospite.scadenza < oggi;
    const inattivo = ospite.attivo === false;
    if (!scaduto && !inattivo) {
      return res.status(400).json({ error: 'Il codice ospite non è scaduto: puoi ancora prenotare.' });
    }
  }

  const insertPayload = {
    nome, cognome, telefono, sport, messaggio, privacy_ok,
    codice_ospite_originale,
    stato: 'nuova'
  };

  const insRes = await fetch(SUPABASE_URL + '/rest/v1/richieste_direttivo', {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(insertPayload)
  });

  if (!insRes.ok) {
    const t = await insRes.text();
    return res.status(500).json({ error: 'Errore salvataggio richiesta: ' + t });
  }
  return res.status(200).json({ success: true });
}

// ---------- POST: azioni admin ----------
async function azioneAdmin(req, res, richiedente) {
  const { id, azione, note_direttivo } = req.body || {};
  if (!id || !['lavorata', 'archiviata', 'nota'].includes(azione)) {
    return res.status(400).json({ error: 'Parametri non validi.' });
  }

  const payload = {
    gestita_da: (richiedente.nome || '') + ' ' + (richiedente.cognome || ''),
    gestita_il: new Date().toISOString()
  };
  if (azione === 'lavorata')   payload.stato = 'lavorata';
  if (azione === 'archiviata') payload.stato = 'archiviata';
  if (azione === 'nota')       payload.note_direttivo = note_direttivo || null;

  const upd = await fetch(SUPABASE_URL + '/rest/v1/richieste_direttivo?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(payload)
  });
  if (!upd.ok) return res.status(500).json({ error: 'Errore aggiornamento richiesta.' });
  return res.status(200).json({ success: true });
}

// ---------- HANDLER ----------
module.exports = async function handler(req, res) {
  if (!SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configurazione server incompleta.' });
  }

  try {
    // POST crea: PUBBLICA, salta auth
    if (req.method === 'POST' && req.body && req.body.azione === 'crea') {
      return await creaRichiesta(req, res);
    }

    // Tutto il resto richiede admin/direttivo
    const auth = await verificaDirettivoOAdmin(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    if (req.method === 'GET') {
      return await listaRichieste(req, res);
    }
    if (req.method === 'POST') {
      return await azioneAdmin(req, res, auth.richiedente);
    }
    return res.status(405).json({ error: 'Metodo non consentito' });

  } catch (e) {
    return res.status(500).json({ error: 'Errore imprevisto: ' + e.message });
  }
};
