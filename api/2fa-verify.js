// ============================================================
// API Route Vercel — Verifica 2FA (attiva 2FA dopo setup)
// ============================================================
// Riservato agli admin (is_admin = TRUE in Tesserati).
// POST body: { userId, tipo, code }
// Risposta: { authenticated: true, message }
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const { authenticator } = require('otplib');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

authenticator.options = {
  window: 1,
  step: 30,
};

// ---------- AUTH ADMIN ----------
async function checkAdmin(req) {
  const authHeader = req.headers['authorization'] || '';
  const userToken = authHeader.replace(/^Bearer\s+/i, '');

  if (!userToken) {
    return { ok: false, status: 401, error: 'Devi essere autenticato.' };
  }

  const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + userToken
    }
  });

  if (!userRes.ok) {
    return { ok: false, status: 401, error: 'Sessione non valida. Rifai il login.' };
  }

  const authUser = await userRes.json();

  const adminCheckRes = await fetch(
    SUPABASE_URL + '/rest/v1/Tesserati?select=is_admin&auth_id=eq.' + encodeURIComponent(authUser.id),
    {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY
      }
    }
  );
  const adminCheckData = await adminCheckRes.json();

  if (!adminCheckRes.ok || !adminCheckData.length || adminCheckData[0].is_admin !== true) {
    return { ok: false, status: 403, error: 'Non hai i permessi di amministratore.' };
  }

  return { ok: true, authId: authUser.id };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Configurazione server incompleta.' });
  }

  try {
    // 1) Verifica che chi chiama sia admin
    const admin = await checkAdmin(req);
    if (!admin.ok) {
      return res.status(admin.status).json({ error: admin.error });
    }

    // 2) Leggi input
    const { userId, tipo, code } = req.body || {};
    if (!userId || !tipo || !code) {
      return res.status(400).json({ error: 'Dati mancanti: userId, tipo o code' });
    }

    // 3) Recupera il segreto TOTP dell'utente
    const tableName = tipo === 'tesserato' ? 'Tesserati' : 'Ospiti';
    const { data: userData, error: userError } = await supabase
      .from(tableName)
      .select('totp_secret')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('Errore nel recupero del segreto TOTP:', userError);
      return res.status(500).json({ error: 'Errore nel recupero dei dati utente' });
    }

    if (!userData || !userData.totp_secret) {
      return res.status(400).json({ error: 'Segreto TOTP non trovato per questo utente' });
    }

    // 4) Verifica codice
    const isValid = authenticator.check(code, userData.totp_secret);

    if (!isValid) {
      return res.status(401).json({ error: 'Codice 2FA non valido' });
    }

    // 5) Attiva 2FA
    const { error: updateError } = await supabase
      .from(tableName)
      .update({ totp_enabled: true })
      .eq('id', userId);

    if (updateError) {
      console.error('Errore attivazione 2FA:', updateError);
      return res.status(500).json({ error: 'Verifica riuscita ma attivazione fallita' });
    }

    return res.status(200).json({
      authenticated: true,
      message: 'Codice 2FA valido'
    });

  } catch (err) {
    console.error('Errore in /api/2fa-verify:', err);
    return res.status(500).json({
      error: err.message || 'Errore interno del server'
    });
  }
};
