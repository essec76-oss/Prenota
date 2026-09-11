const { createClient } = require('@supabase/supabase-js');
const { verifyRegistrationResponse } = require('@simplewebauthn/server');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const match = cookies.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return match ? match.split('=')[1] : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { codice, deviceName, response } = req.body;
    const expectedChallenge = getCookie(req, 'wa_challenge');

    if (!codice || !response) {
      return res.status(400).json({ error: 'Parametri obbligatori mancanti' });
    }

    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Sessione di registrazione scaduta, riprova.' });
    }

    const expectedOrigin = `https://${req.headers.host}`;
    const expectedRPID = req.headers.host.split(':')[0];

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Verifica impronta fallita' });
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

    const { error: insertErr } = await supabase.from('Passkeys').insert({
      utente_codice: codice,
      credential_id: Buffer.from(credentialID).toString('base64url'),
      public_key: Buffer.from(credentialPublicKey).toString('base64url'),
      counter,
      device_name: deviceName || null
    });

    if (insertErr) {
      console.error('❌ Errore salvataggio passkey:', insertErr);
      return res.status(500).json({ error: 'Errore salvataggio' });
    }

    res.setHeader('Set-Cookie', 'wa_challenge=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/api');
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('❌ Errore verifica registrazione WebAuthn:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
};
