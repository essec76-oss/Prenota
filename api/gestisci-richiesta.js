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

  let codiceGenerato = null;
  let scadenzaImpostata = null;

  if (azione === 'approvata') {
    // 2. Cerca se esiste già un utente con lo stesso telefono
    let existingUser = null;
    let existingTable = null;
    const tel = (richiestaReq.telefono || '').trim();

    if (tel) {
      const tRes = await fetch(
        SUPABASE_URL + '/rest/v1/Tesserati?telefono=eq.' + encodeURIComponent(tel) + '&select=id,codice,nome,cognome,scadenza,is_tennis_member,is_padel_member',
        { headers: authHeaders }
      );
      if (tRes.ok) {
        const tData = await tRes.json();
        if (tData.length) { existingUser = tData[0]; existingTable = 'Tesserati'; }
      }

      if (!existingUser) {
        const oRes = await fetch(
          SUPABASE_URL + '/rest/v1/Ospiti?telefono=eq.' + encodeURIComponent(tel) + '&select=id,codice,nome,cognome,scadenza,is_tennis_member,is_padel_member',
          { headers: authHeaders }
        );
        if (oRes.ok) {
          const oData = await oRes.json();
          if (oData.length) { existingUser = oData[0]; existingTable = 'Ospiti'; }
        }
      }
    }

    // 3. Calcola scadenza in base al tipo
    const oggi = new Date();
    let scadenzaDate = new Date(oggi);

    if (richiestaReq.tipo_richiesta === 'tessera_annuale' || richiestaReq.tipo_richiesta === 'abbonamento_annuale') {
      scadenzaDate = new Date(oggi.getFullYear(), 11, 31);
    } else if (richiestaReq.tipo_richiesta === 'abbonamento_mensile') {
      scadenzaDate.setMonth(scadenzaDate.getMonth() + 1);
    } else if (richiestaReq.tipo_richiesta === 'abbonamento_trimestrale') {
      scadenzaDate.setMonth(scadenzaDate.getMonth() + 3);
    } else if (richiestaReq.tipo_richiesta === 'abbonamento_semestrale') {
      scadenzaDate.setMonth(scadenzaDate.getMonth() + 6);
    } else {
      scadenzaDate.setDate(scadenzaDate.getDate() + 14);
    }

    const yyyy = scadenzaDate.getFullYear();
    const mm = String(scadenzaDate.getMonth() + 1).padStart(2, '0');
    const dd = String(scadenzaDate.getDate()).padStart(2, '0');
    scadenzaImpostata = yyyy + '-' + mm + '-' + dd;

    const isTennis = richiestaReq.sport === 'tennis' || richiestaReq.sport === 'both';
    const isPadel = richiestaReq.sport === 'padel' || richiestaReq.sport === 'both';

    if (existingUser) {
      codiceGenerato = existingUser.codice;
      const updatePayload = {
        is_tennis_member: isTennis || existingUser.is_tennis_member,
        is_padel_member: isPadel || existingUser.is_padel_member,
        scadenza: scadenzaImpostata
      };

      const updRes = await fetch(SUPABASE_URL + '/rest/v1/' + existingTable + '?id=eq.' + existingUser.id, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(updatePayload)
      });
      if (!updRes.ok) return res.status(500).json({ error: 'Errore aggiornamento utente esistente.' });
    } else {
      let codice = null;
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      for (let tentativo = 0; tentativo < 20; tentativo++) {
        // Standard a 12 caratteri: 't' + 11 alfanumerici (usato anche come password Auth)
        let suffix = '';
        for (let i = 0; i < 11; i++) {
          suffix += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const candidato = 't' + suffix;
        const checkRes = await fetch(SUPABASE_URL + '/rest/v1/Tesserati?codice=eq.' + candidato + '&select=id', { headers: authHeaders });
        if (checkRes.ok) {
          const existing = await checkRes.json();
          if (!existing.length) { codice = candidato; break; }
        }
      }
      if (!codice) return res.status(500).json({ error: 'Impossibile generare codice univoco.' });

      const insertPayload = {
        nome: richiestaReq.nome,
        cognome: richiestaReq.cognome,
        codice: codice,
        telefono: tel || null,
        is_tennis_member: isTennis,
        is_padel_member: isPadel,
        is_admin: false,
        scadenza: scadenzaImpostata
      };

      const insRes = await fetch(SUPABASE_URL + '/rest/v1/Tesserati', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(insertPayload)
      });
      if (!insRes.ok) {
        const errBody = await insRes.json().catch(() => ({}));
        return res.status(500).json({ error: 'Errore creazione tesserato: ' + (errBody.message || insRes.statusText) });
      }
      codiceGenerato = codice;
    }
  }

  // 4. Aggiorna la richiesta
  const payload = {
    stato: azione,
    gestita_da: (richiedente.nome || '') + ' ' + (richiedente.cognome || ''),
    gestita_il: new Date().toISOString()
  };
  if (codiceGenerato) payload.codice_generato = codiceGenerato;
  if (scadenzaImpostata) payload.scadenza_impostata = scadenzaImpostata;

  const updRichiestaRes = await fetch(SUPABASE_URL + '/rest/v1/richieste_pagamento?id=eq.' + id, {
    method: 'PATCH',
    headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(payload)
  });

  if (!updRichiestaRes.ok) {
    const errBody = await updRichiestaRes.json().catch(() => ({}));
    return res.status(500).json({ error: errBody.message || 'Errore aggiornamento richiesta.' });
  }

  return res.status(200).json({ success: true, codiceGenerato, scadenzaImpostata });
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
