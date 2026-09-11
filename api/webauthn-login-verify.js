const { createClient } = require('@supabase/supabase-js');
const { verifyAuthenticationResponse } = require('@simplewebauthn/server');

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
    const { codice, response } = req.body;
    const expectedChallenge = getCookie(req, 'wa_challenge');

    if (!codice || !response) {
      return res.status(400).json({ error: 'Parametri obbligatori mancanti' });
    }
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Sessione scaduta, riprova.' });
    }

    const { data: passkey, error: fetchErr } = await supabase
      .from('Passkeys')
      .select('*')
      .eq('utente_codice', codice)
      .eq('credential_id', response.id)
      .single();

    if (fetchErr || !passkey) {
      return res.status(400).json({ error: 'Impronta non riconosciuta' });
    }

    const expectedOrigin = `https://${req.headers.host}`;
    const expectedRPID = req.headers.host.split(':')[0];

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID,
      authenticator: {
        credentialID: Buffer.from(passkey.credential_id, 'base64url'),
        credentialPublicKey: Buffer.from(passkey.public_key, 'base64url'),
        counter: passkey.counter
      }
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Verifica impronta fallita' });
    }

    await supabase
      .from('Passkeys')
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq('id', passkey.id);

    res.setHeader('Set-Cookie', 'wa_challenge=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/api');
    return res.status(200).json({ success: true, codice });

  } catch (err) {
    console.error('❌ Errore verifica login WebAuthn:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
};
