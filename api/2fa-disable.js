// ============================================================
// API Route Vercel — Disattivazione 2FA
// ============================================================
// Riservato agli admin (is_admin = TRUE in Tesserati).
// POST body: { userId, tipo, code }
// Richiede Bearer token valido nel header Authorization.
// Risposta: { success: true, message }
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
      return res.status(400).json({ error: 'Parametri obbligatori' });
    }

    // 3) Recupera il segreto TOTP
    const table = tipo === 'tesserato' ? 'Tesserati' : 'Ospiti';
    const { data: user, error: fetchErr } = await supabase
      .from(table)
      .select('totp_secret, totp_enabled')
      .eq('id', userId)
      .single();

    if (fetchErr || !user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    if (!user.totp_enabled || !user.totp_secret) {
      return res.status(400).json({ error: 'Il 2FA non è attivo per questo utente.' });
    }

    // 4) Verifica codice TOTP (con window ±30s gestita da otplib)
    const isValid = authenticator.check(String(code), user.totp_secret);

    if (!isValid) {
      return res.status(401).json({ error: 'Codice 2FA non valido' });
    }

    // 5) Disattiva 2FA e cancella segreto + backup codes
    const { error: updateErr } = await supabase
      .from(table)
      .update({
        totp_enabled: false,
        totp_secret: null,
        totp_backup_codes: null
      })
      .eq('id', userId);

    if (updateErr) {
      console.error('Errore disattivazione 2FA:', updateErr);
      return res.status(500).json({ error: 'Errore disattivazione 2FA' });
    }

    return res.json({ success: true, message: '2FA disabilitato' });

  } catch (e) {
    console.error('❌ Errore disabilitazione 2FA:', e);
    return res.status(500).json({ error: e.message });
  }
};
