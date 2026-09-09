const { createClient } = require('@supabase/supabase-js');
const totp = require('totp-generator');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function verifyTOTP(secret, code, window = 1) {
  try {
    const now = Math.floor(Date.now() / 1000);
    
    for (let i = -window; i <= window; i++) {
      const timeCounter = Math.floor((now + i * 30) / 30);
      const expectedCode = totp(secret);
      
      if (code === expectedCode) {
        return true;
      }
    }
    
    return false;
  } catch(e) {
    console.error('❌ Errore verifica TOTP:', e);
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, tipo, code } = req.body;

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

    if (!user.is_admin) {
      return res.json({ success: true, requires2fa: false });
    }

    if (!user.totp_enabled) {
      return res.json({ success: true, requires2fa: false });
    }

    const isValidTOTP = verifyTOTP(user.totp_secret, code);

    if (isValidTOTP) {
      return res.json({ success: true, authenticated: true });
    }

    const backupCodes = (user.totp_backup_codes || '').split(',').map(c => c.trim());
    const backupIndex = backupCodes.indexOf(code.toUpperCase());

    if (backupIndex !== -1) {
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

    res.status(401).json({ error: 'Codice 2FA non valido' });

  } catch(e) {
    console.error('❌ Errore login 2FA:', e);
    res.status(500).json({ error: e.message });
  }
};
