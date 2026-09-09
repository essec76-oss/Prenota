// ============================================================
// API Route Vercel — Creazione pubblica profilo Ospite (self-register)
// ============================================================
// Endpoint pubblico (nessun token richiesto).
// Usa la SERVICE_ROLE_KEY solo lato server per bypassare le RLS
// in modo sicuro. Genera codice univoco oXXXX e scadenza +7 giorni.
// ============================================================

const SUPABASE_URL = 'https://smwtbonxhvhrnyukrluw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function generateUniqueCode(tentativi = 0) {
  if (tentativi >= 20) {
    throw new Error('Impossibile generare un codice univoco dopo 20 tentativi');
  }

  const numero = String(Math.floor(1000 + Math.random() * 9000));
  const codice = 'o' + numero;

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
    const { nome, cognome, sport } = req.body || {};

    if (!nome || typeof nome !== 'string' || !nome.trim()) {
      return res.status(400).json({ error: 'Il nome è obbligatorio.' });
    }
    if (!cognome || typeof cognome !== 'string' || !cognome.trim()) {
      return res.status(400).json({ error: 'Il cognome è obbligatorio.' });
    }
    if (!sport || !['tennis', 'padel', 'both'].includes(sport)) {
      return res.status(400).json({ error: 'Seleziona uno sport valido (tennis, padel o both).' });
    }

    const nomeClean = nome.trim();
    const cognomeClean = cognome.trim();

    // ------------------------------------------------------------
    // 2) Genera codice univoco
    // ------------------------------------------------------------
    const codice = await generateUniqueCode();

    // ------------------------------------------------------------
    // 3) Calcola scadenza (+7 giorni)
    // ------------------------------------------------------------
    const scadenzaDate = new Date();
    scadenzaDate.setDate(scadenzaDate.getDate() + 7);
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
