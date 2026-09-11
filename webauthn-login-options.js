const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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

  } catch (err) {
    console.error('❌ Errore generazione opzioni login WebAuthn:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
};
