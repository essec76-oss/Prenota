// ============================================================
// API Route Vercel — Aggiornamento sicuro del codice Key Box
// ============================================================
// Verifica lato server (non solo lato JavaScript nel browser)
// che chi fa la richiesta sia davvero un tesserato con is_admin
// = true, prima di aggiornare "Impostazioni.codice_keybox".
// ============================================================
const SUPABASE_URL = 'https://smwtbonxhvhrnyukrluw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }
  if (!SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configurazione server incompleta (manca SUPABASE_SERVICE_ROLE_KEY)' });
  }
  try {
    // ------------------------------------------------------------
    // 1) Verifica di chi sta facendo la richiesta (token utente)
    // ------------------------------------------------------------
    const authHeader = req.headers['authorization'] || '';
    const userToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!userToken) {
      return res.status(401).json({ error: 'Devi essere autenticato per modificare il codice key box.' });
    }
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + userToken
      }
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Sessione non valida. Rifai il login.' });
    }
    const authUser = await userRes.json();
    const requesterAuthId = authUser.id;
    // ------------------------------------------------------------
    // 2) Verifica che sia davvero un tesserato con is_admin = true
    // ------------------------------------------------------------
    const adminCheckRes = await fetch(
      SUPABASE_URL + '/rest/v1/Tesserati?select=is_admin&auth_id=eq.' + encodeURIComponent(requesterAuthId),
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: 'Bearer ' + SERVICE_ROLE_KEY
        }
      }
    );
    const adminCheckData = await adminCheckRes.json();
    if (!adminCheckRes.ok || !adminCheckData.length || adminCheckData[0].is_admin !== true) {
      return res.status(403).json({ error: 'Non hai i permessi di amministratore.' });
    }
    // ------------------------------------------------------------
    // 3) Leggi i nuovi codici dal corpo della richiesta
    // ------------------------------------------------------------
    const { codice_keybox_tennis, codice_keybox_padel } = req.body || {};
    if (!codice_keybox_tennis || typeof codice_keybox_tennis !== 'string' || !codice_keybox_tennis.trim()) {
      return res.status(400).json({ error: 'Il codice key box del tennis non può essere vuoto.' });
    }
    if (!codice_keybox_padel || typeof codice_keybox_padel !== 'string' || !codice_keybox_padel.trim()) {
      return res.status(400).json({ error: 'Il codice key box del padel non può essere vuoto.' });
    }
    // ------------------------------------------------------------
    // 4) Aggiorna Impostazioni (con service role, bypassa le RLS)
    // ------------------------------------------------------------
    const updateRes = await fetch(SUPABASE_URL + '/rest/v1/Impostazioni?id=eq.1', {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        codice_keybox_tennis: codice_keybox_tennis.trim(),
        codice_keybox_padel: codice_keybox_padel.trim(),
        aggiornato_il: new Date().toISOString()
      })
    });
    if (!updateRes.ok) {
      const errBody = await updateRes.json().catch(() => ({}));
      return res.status(500).json({ error: 'Errore aggiornamento: ' + (errBody.message || updateRes.statusText) });
    }
    return res.status(200).json({ success: true, codice_keybox_tennis: codice_keybox_tennis.trim(), codice_keybox_padel: codice_keybox_padel.trim() });
  } catch (e) {
    return res.status(500).json({ error: 'Errore imprevisto: ' + e.message });
  }
};
