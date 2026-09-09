const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const QRCode = require('qrcode');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, tipo } = req.body;
    
    if (!userId || !tipo) {
      return res.status(400).json({ error: 'userId e tipo obbligatori' });
    }

    // Genera secret TOTP casuale (32 caratteri base32)
    const secret = crypto.randomBytes(20).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // Genera QR code per Proton Authenticator
    const otpauthUrl = `otpauth://totp/TennisClubNulvi:admin-${userId}?secret=${secret}&issuer=TennisClubNulvi&algorithm=SHA1&digits=6&period=30`;
    
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Genera 5 backup codes
    const backupCodes = Array.from({ length: 5 }, () => 
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Salva secret e backup codes (non ancora attivati)
    const table = tipo === 'tesserato' ? 'Tesserati' : 'Ospiti';
    await supabase
      .from(table)
      .update({
        totp_secret: secret,
        totp_backup_codes: backupCodes.join(','),
        totp_enabled: false
      })
      .eq('id', userId);

    res.json({
      success: true,
      qrCode: qrCodeDataUrl,
      secret: secret,
      backupCodes: backupCodes,
      otpauthUrl: otpauthUrl
    });

  } catch(e) {
    console.error('❌ Errore 2FA setup:', e);
    res.status(500).json({ error: e.message });
  }
};
