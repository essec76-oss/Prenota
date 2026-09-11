const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { verifyAuthenticationResponse } = require('@simplewebauthn/server');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const match = cookies.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return match ? match.split('=')[1] : null;
}

async function handleOptions(req, res) {
  const { codice } = req.body;
  if (!codice) {
    return res.status(400).json({ error: 'Codice utente obbligatorio' });
  }

  const { data: passkeys, error } = await supabase
    .from('Passkeys')
    .select('credential_id')
    .eq('utente_codice', codice);

  if (error) {
    console.error('❌ Errore lettura passkeys:', error);
    return res.status(500).json({ error: 'Errore interno' });
  }

  if (!passkeys || passkeys.length === 0) {
    return res.status(404).json({ error: 'Nessuna impronta registrata per questo utente' });
  }

  const challenge = crypto.randomBytes(32).toString('base64url');

  const options = {
    challenge,
    allowCredentials: passkeys.map(p => ({
      id: p.credential_id,
      type: 'public-key'
    })),
    userVerification: 'required',
    timeout: 60000,
    rpId: req.headers.host.split(':')[0]
  };

  res.setHeader('Set-Cookie', `wa_challenge=${challenge}; HttpOnly; Secure; SameSite=Strict; Max-Age=60; Path=/api`);
  return res.status(200).json(options);
}

async function handleVerify(req, res) {
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
}

// Endpoint unico: se il body contiene "response" siamo nel passo di verifica
// (dopo che il dispositivo ha firmato la sfida), altrimenti nel passo iniziale
// di richiesta della sfida (options).
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (req.body && req.body.response) {
      return await handleVerify(req, res);
    }
    return await handleOptions(req, res);

  } catch (err) {
    console.error('❌ Errore login WebAuthn:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
};
