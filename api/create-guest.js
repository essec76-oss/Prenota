// ============================================================
// API Route Vercel — Creazione pubblica profilo Ospite (self-register)
// ============================================================
// Endpoint pubblico (nessun token richiesto).
// Usa la SERVICE_ROLE_KEY solo lato server per bypassare le RLS
// in modo sicuro. Genera codice univoco oXXXXXXX (o + 7 caratteri
// alfanumerici) e scadenza +14 giorni dalla registrazione.
// Applica un limite giornaliero di 10 auto-registrazioni (le creazioni
// fatte dall'admin tramite create-user.js NON sono conteggiate).
// Il numero di telefono viene usato per riconoscere e bloccare i
// duplicati: se già presente in Ospiti, la creazione viene rifiutata
// e l'utente è invitato a contattare il direttivo.
// ============================================================

const SUPABASE_URL = 'https://smwtbonxhvhrnyukrluw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hEooIlJGPblzlaUbdO_ssA_wKEz6I-B';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

async function generateUniqueCode(tentativi = 0) {
  if (tentativi >= 20) {
    throw new Error('Impossibile generare un codice univoco dopo 20 tentativi');
  }

  let suffisso = '';
  for (let i = 0; i < 7; i++) {
    suffisso += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  const codice = 'o' + suffisso;

  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/Ospiti?codice=eq.${codice}&select=id`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`
      }
    }
  );

  if (!checkRes.ok) {
    throw new Error('Errore verifica codice');
  }

  const existing = await checkRes.json();
  if (existing && existing.length > 0) {
    return generateUniqueCode(tentativi + 1);
  }

  return codice;
}

// Registra la creazione nella tabella daily_guest_profiles
// (usata solo per il conteggio del limite giornaliero)
async function trackGuestCreation(ospiteId) {
  await fetch(`${SUPABASE_URL}/rest/v1/daily_guest_profiles`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ profile_id: ospiteId })
  });
}

module.exports = async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  if (!SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: 'Configurazione server incompleta (manca SUPABASE_SERVICE_ROLE_KEY)'
    });
  }

  try {
    // ------------------------------------------------------------
    // 1) Validazione input
    // ------------------------------------------------------------
    const { nome, cognome, sport, telefono } = req.body || {};

    if (!nome || typeof nome !== 'string' || !nome.trim()) {
      return res.status(400).json({ error: 'Il nome è obbligatorio.' });
    }
    if (!cognome || typeof cognome !== 'string' || !cognome.trim()) {
      return res.status(400).json({ error: 'Il cognome è obbligatorio.' });
    }
    if (!sport || !['tennis', 'padel', 'both'].includes(sport)) {
      return res.status(400).json({ error: 'Seleziona uno sport valido (tennis, padel o both).' });
    }
    if (!telefono || typeof telefono !== 'string' || !/^(\+39)?\s?3\d{8,9}$/.test(telefono.trim().replace(/\s+/g, ''))) {
      return res.status(400).json({ error: 'Numero di telefono non valido. Inserisci un numero italiano valido.' });
    }

    const nomeClean = nome.trim();
    const cognomeClean = cognome.trim();
    const telefonoClean = telefono.trim().replace(/\s+/g, '');

    // ------------------------------------------------------------
    // 1.4) Controllo duplicati per numero di telefono
    // ------------------------------------------------------------
    const dupRes = await fetch(
      `${SUPABASE_URL}/rest/v1/Ospiti?telefono=eq.${encodeURIComponent(telefonoClean)}&select=id`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`
        }
      }
    );

    if (dupRes.ok) {
      const duplicati = await dupRes.json();
      if (duplicati && duplicati.length > 0) {
        return res.status(409).json({
          error: 'Risulti già registrato con questo numero di telefono. Contatta una persona del direttivo per assistenza.',
          duplicato: true
        });
      }
    }

    // ------------------------------------------------------------
    // 1.5) Controllo limite giornaliero (max 10 auto-registrazioni/giorno)
    // ------------------------------------------------------------
    const dataItalia = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());

    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_guest_profiles?created_at=gte.${dataItalia}T00:00:00&select=id`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          Prefer: 'count=exact'
        }
      }
    );

    const contentRange = countRes.headers.get('content-range');
    const totaleOggi = contentRange ? parseInt(contentRange.split('/')[1]) : 0;

    if (totaleOggi >= 10) {
      return res.status(429).json({
        error: 'Limite giornaliero di 10 registrazioni ospiti raggiunto. Riprova domani.',
        limiteRaggiunto: true
      });
    }

    // ------------------------------------------------------------
    // 2) Genera codice univoco
    // ------------------------------------------------------------
    const codice = await generateUniqueCode();

    // ------------------------------------------------------------
    // 3) Calcola scadenza (+14 giorni)
    // ------------------------------------------------------------
    const scadenzaDate = new Date();
    scadenzaDate.setDate(scadenzaDate.getDate() + 14);
    const yyyy = scadenzaDate.getFullYear();
    const mm = String(scadenzaDate.getMonth() + 1).padStart(2, '0');
    const dd = String(scadenzaDate.getDate()).padStart(2, '0');
    const scadenza = `${yyyy}-${mm}-${dd}`;

    // ------------------------------------------------------------
    // 4) Prepara payload
    // ------------------------------------------------------------
    const payload = {
      nome: nomeClean,
      cognome: cognomeClean,
      codice,
      telefono: telefonoClean,
      is_tennis_member: sport === 'tennis' || sport === 'both',
      is_padel_member: sport === 'padel' || sport === 'both',
      attivo: true,
      scadenza
    };

    // ------------------------------------------------------------
    // 5) Inserimento con SERVICE_ROLE (bypassa RLS in sicurezza)
    // ------------------------------------------------------------
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/Ospiti`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (!insertRes.ok) {
      let errorDetail = '';
      try {
        const errBody = await insertRes.json();
        errorDetail = errBody.message || errBody.details || JSON.stringify(errBody);
      } catch (_) {
        errorDetail = insertRes.status + ' ' + insertRes.statusText;
      }

      // Retry in caso di collisione sul codice
      if (errorDetail.includes('duplicate key') || errorDetail.includes('_codice_key')) {
        const newCodice = await generateUniqueCode();
        payload.codice = newCodice;

        const retryRes = await fetch(`${SUPABASE_URL}/rest/v1/Ospiti`, {
          method: 'POST',
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
          },
          body: JSON.stringify(payload)
        });

        if (!retryRes.ok) {
          return res.status(500).json({ error: 'Errore durante il ritentativo di creazione.' });
        }

        const created = await retryRes.json();
        await trackGuestCreation(created[0].id);

        return res.status(201).json({
          success: true,
          codice: newCodice,
          scadenza,
          user: created[0]
        });
      }

      return res.status(500).json({ error: errorDetail });
    }

    const created = await insertRes.json();
    await trackGuestCreation(created[0].id);

    return res.status(201).json({
      success: true,
      codice,
      scadenza,
      user: created[0]
    });

  } catch (e) {
    console.error('Errore create-guest:', e);
    return res.status(500).json({ error: 'Errore imprevisto: ' + e.message });
  }
};
