const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const QRCode = require('qrcode');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function generateBase32Secret(length = 32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // Base32 standard (RFC 4648)
  const bytes = crypto.randomBytes(length);
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += alphabet[bytes[i] % 32];
  }
  return secret;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, tipo } = req.body;

    if (!userId || !tipo) {
      return res.status(400).json({ error: 'userId e tipo obbligatori' });
    }

    const secret = generateBase32Secret();

    const otpauthUrl = `otpauth://totp/TennisClubNulvi:admin-${userId}?secret=${secret}&issuer=TennisClubNulvi&algorithm=SHA1&digits=6&period=30`;
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    const backupCodes = Array.from({ length: 5 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    const table = tipo === 'tesserato' ? 'Tesserati' : 'Ospiti';
    const { error: updateErr } = await supabase
      .from(table)
      .update({
        totp_secret: secret,
        totp_backup_codes: backupCodes.join(','),
        totp_enabled: false
      })
      .eq('id', userId);

    if (updateErr) {
      console.error('❌ Errore salvataggio 2FA setup:', updateErr);
      return res.status(500).json({ error: updateErr.message });
    }

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
