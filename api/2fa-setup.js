// ============================================================
// API Route Vercel — Setup 2FA (genera segreto + QR + backup codes)
// ============================================================
// Riservato agli admin (is_admin = TRUE in Tesserati).
// POST body: { userId, tipo }
// Risposta: { success, qrCode, secret, backupCodes, otpauthUrl }
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const QRCode = require('qrcode');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

function generateBase32Secret(length = 32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
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
    const { userId, tipo } = req.body || {};
    if (!userId || !tipo) {
      return res.status(400).json({ error: 'userId e tipo obbligatori' });
    }

    // 3) Genera segreto + QR + backup codes
    const secret = generateBase32Secret();
    const otpauthUrl = `otpauth://totp/TennisClubNulvi:admin-${userId}?secret=${secret}&issuer=TennisClubNulvi&algorithm=SHA1&digits=6&period=30`;
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    const backupCodes = Array.from({ length: 5 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // 4) Salva nel DB (totp_enabled resta false finché non verifica)
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

    return res.json({
      success: true,
      qrCode: qrCodeDataUrl,
      secret: secret,
      backupCodes: backupCodes,
      otpauthUrl: otpauthUrl
    });

  } catch (e) {
    console.error('❌ Errore 2FA setup:', e);
    return res.status(500).json({ error: e.message });
  }
};
