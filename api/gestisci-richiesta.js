// ============================================================
// API Route Vercel — Lettura e gestione sicura delle richieste
// di pagamento (tab "Richieste" del pannello direttivo/admin)
// ============================================================
// Gira sul SERVER di Vercel. Usa la SUPABASE_SERVICE_ROLE_KEY
// per leggere/scrivere richieste_pagamento e per creare/aggiornare
// Tesserati in approvazione, DOPO aver verificato che chi chiama
// sia davvero un utente autenticato con is_admin o is_direttivo.
//
// GET  -> restituisce l'elenco delle richieste di pagamento
// POST -> { id, azione: 'approvata' | 'rifiutata' } gestisce una richiesta
// ============================================================

const SUPABASE_URL = 'https://smwtbonxhvhrnyukrluw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function verificaDirettivoOAdmin(req) {
  const authHeader = req.headers['authorization'] || '';
  const userToken = authHeader.replace(/^Bearer\s+/i, '');

  if (!userToken) {
    return { ok: false, status: 401, error: 'Devi essere autenticato per accedere alle richieste.' };
  }

  const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + userToken
    }
  });

  if (!userRes.ok) {
    return { ok: false, status: 401, error: 'Sessione non valida. Rifai il login.' };
  }

  const authUser = await userRes.json();
  const requesterAuthId = authUser.id;

  const checkRes = await fetch(
    SUPABASE_URL + '/rest/v1/Tesserati?select=id,nome,cognome,is_admin,is_direttivo&auth_id=eq.' + encodeURIComponent(requesterAuthId),
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + SERVICE_ROLE_KEY
      }
    }
  );
  const checkData = await checkRes.json();

  if (!checkRes.ok || !checkData.length || (checkData[0].is_admin !== true && checkData[0].is_direttivo !== true)) {
    return { ok: false, status: 403, error: 'Non hai i permessi di direttivo/admin.' };
  }

  return { ok: true, richiedente: checkData[0] };
}

async function listaRichieste(res) {
  const url = SUPABASE_URL + '/rest/v1/richieste_pagamento'
    + '?select=id,created_at,nome,cognome,telefono,sport,tipo_richiesta,numero_crediti,stato,importo_calcolato,codice_generato,scadenza_impostata,note_direttivo,gestita_da,gestita_il'
    + '&order=created_at.desc';

  const richiesteRes = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY
    }
  });

  if (!richiesteRes.ok) {
    return res.status(500).json({ error: 'Errore caricamento richieste.' });
  }

  const data = await richiesteRes.json();
  return res.status(200).json({ success: true, richieste: data });
}

async function gestisciRichiesta(req, res, richiedente) {
  const { id, azione } = req.body || {};

  if (!id || (azione !== 'approvata' && azione !== 'rifiutata')) {
    return res.status(400).json({ error: 'Dati mancanti: id e azione (approvata/rifiutata) sono obbligatori.' });
  }

  const authHeaders = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SERVICE_ROLE_KEY
  };

  // 1. Carica i dettagli della richiesta
  const getRes = await fetch(SUPABASE_URL + '/rest/v1/richieste_pagamento?id=eq.' + id + '&select=*', {
    headers: authHeaders
  });
  if (!getRes.ok) return res.status(500).json({ error: 'Impossibile caricare la richiesta.' });
  const richieste = await getRes.json();
  if (!richieste.length) return res.status(404).json({ error: 'Richiesta non trovata.' });
  const richiestaReq = richieste[0];

  if (richiestaReq.stato && richiestaReq.stato !== 'in_attesa') {
    return res.status(409).json({ error: 'Questa richiesta è già stata gestita.' });
  }
}

module.exports = async function handler(req, res) {
  if (!SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configurazione server incompleta (manca SUPABASE_SERVICE_ROLE_KEY)' });
  }

  try {
    const auth = await verificaDirettivoOAdmin(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }

    if (req.method === 'GET') {
      return await listaRichieste(res);
    }
    if (req.method === 'POST') {
      return await gestisciRichiesta(req, res, auth.richiedente);
    }
    return res.status(405).json({ error: 'Metodo non consentito' });

  } catch (e) {
    return res.status(500).json({ error: 'Errore imprevisto: ' + e.message });
  }
};
