// ============================================================
// API Route Vercel — Login 2FA (verifica codice durante login admin)
// ============================================================
// Endpoint PUBBLICO (necessario durante il login, prima che
// l'utente abbia un Bearer token).
// Sicurezza: serve il codice TOTP corretto (o un backup code)
// per superare la verifica.
// POST body: { userId, tipo, code }
// Risposta: { success, authenticated?, requires2fa?, warning? }
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Configurazione server incompleta.' });
  }

  try {
    const { userId, tipo, code } = req.body || {};

    if (!userId || !tipo || !code) {
      return res.status(400).json({ error: 'Parametri obbligatori' });
    }

    const table = tipo === 'tesserato' ? 'Tesserati' : 'Ospiti';

    const { data: user, error: fetchErr } = await supabase
      .from(table)
      .select('totp_secret, totp_enabled, totp_backup_codes, is_admin')
      .eq('id', userId)
      .single();

    if (fetchErr || !user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    // Se non è admin, o non ha 2FA attivo, non c'è bisogno di 2FA
    if (!user.is_admin) {
      return res.json({ success: true, requires2fa: false });
    }
    if (!user.totp_enabled) {
      return res.json({ success: true, requires2fa: false });
    }

    // Verifica TOTP
    const isValidTOTP = authenticator.check(String(code), user.totp_secret);

    if (isValidTOTP) {
      return res.json({ success: true, authenticated: true });
    }

    // Fallback: backup code
    const backupCodes = (user.totp_backup_codes || '')
      .split(',')
      .map(c => c.trim())
      .filter(Boolean);
    const backupIndex = backupCodes.indexOf(String(code).toUpperCase());

    if (backupIndex !== -1) {
      // Consuma il backup code
      backupCodes.splice(backupIndex, 1);
      await supabase
        .from(table)
        .update({ totp_backup_codes: backupCodes.join(',') })
        .eq('id', userId);

      return res.json({
        success: true,
        authenticated: true,
        warning: 'Hai usato un backup code. Rimangono ' + backupCodes.length + ' codici.'
      });
    }

    return res.status(401).json({ error: 'Codice 2FA non valido' });

  } catch (e) {
    console.error('❌ Errore login 2FA:', e);
    return res.status(500).json({ error: e.message });
  }
};
