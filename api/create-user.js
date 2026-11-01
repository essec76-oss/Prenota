// ============================================================
// API Route Vercel — Creazione di tesserati/ospiti (solo admin)
// ============================================================
// Verifica che chi chiama sia un tesserato con is_admin = true,
// genera un codice univoco e inserisce la riga in Tesserati/Ospiti.
// ============================================================

const { randomInt } = require('crypto');

const SUPABASE_URL = 'https://smwtbonxhvhrnyukrluw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function casuale(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += CHARS.charAt(randomInt(CHARS.length));
  return s;
}

// Tesserato: 't' + 11 caratteri (12 totali). Ospite: 'o' + 7 caratteri (8 totali).
async function generaCodiceUnivoco(tipo) {
  const tabella = tipo === 'tesserato' ? 'Tesserati' : 'Ospiti';
  for (let tentativo = 0; tentativo < 20; tentativo++) {
    const codice = (tipo === 'tesserato' ? 't' + casuale(11) : 'o' + casuale(7));
    const r = await fetch(
      SUPABASE_URL + '/rest/v1/' + tabella + '?select=id&codice=eq.' + encodeURIComponent(codice),
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY } }
    );
    if (!r.ok) throw new Error('Errore verifica codice');
    const esistenti = await r.json();
    if (!esistenti.length) return codice;
  }
  throw new Error('Impossibile generare un codice univoco dopo 20 tentativi');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }
  if (!SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configurazione server incompleta (manca SUPABASE_SERVICE_ROLE_KEY)' });
  }

  try {
    // 1) Chi chiama?
    const authHeader = req.headers['authorization'] || '';
    const userToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!userToken) {
      return res.status(401).json({ error: 'Devi essere autenticato.' });
    }
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + userToken }
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Sessione non valida. Rifai il login.' });
    }
    const authUser = await userRes.json();

    // 2) È un admin?
    const adminRes = await fetch(
      SUPABASE_URL + '/rest/v1/Tesserati?select=is_admin&auth_id=eq.' + encodeURIComponent(authUser.id),
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY } }
    );
    const adminData = await adminRes.json();
    if (!adminRes.ok || !adminData.length || adminData[0].is_admin !== true) {
      return res.status(403).json({ error: 'Non hai i permessi di amministratore.' });
    }

    // 3) Dati in ingresso
    const { tipo, nome, cognome, sport, telefono, scadenza } = req.body || {};
    if (tipo !== 'tesserato' && tipo !== 'ospite') {
      return res.status(400).json({ error: 'Tipo non valido.' });
    }
    if (!nome || !cognome) {
      return res.status(400).json({ error: 'Nome e Cognome sono obbligatori.' });
    }
    if (!['tennis', 'padel', 'both'].includes(sport)) {
      return res.status(400).json({ error: 'Seleziona uno sport valido.' });
    }
    if (tipo === 'ospite' && !telefono) {
      return res.status(400).json({ error: 'Il telefono è obbligatorio per gli ospiti.' });
    }
    if (scadenza && !DATA_RE.test(scadenza)) {
      return res.status(400).json({ error: 'Formato scadenza non valido (AAAA-MM-GG).' });
    }

    // 4) Payload
    const codice = await generaCodiceUnivoco(tipo);
    const base = {
      nome,
      cognome,
      codice,
      is_tennis_member: sport === 'tennis' || sport === 'both',
      is_padel_member: sport === 'padel' || sport === 'both',
      scadenza: scadenza || null
    };
    const payload = tipo === 'tesserato'
      ? { ...base, is_admin: false }
      : { ...base, telefono, attivo: true };
    const tabella = tipo === 'tesserato' ? 'Tesserati' : 'Ospiti';

    // 5) Inserimento con service role
    const insRes = await fetch(SUPABASE_URL + '/rest/v1/' + tabella, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    if (!insRes.ok) {
      const err = await insRes.json().catch(() => ({}));
      return res.status(500).json({ error: 'Errore creazione utente: ' + (err.message || insRes.statusText) });
    }
    const creato = await insRes.json();
    return res.status(201).json({ success: true, codice, utente: creato[0] || null });

  } catch (e) {
    return res.status(500).json({ error: 'Errore imprevisto: ' + e.message });
  }
};
