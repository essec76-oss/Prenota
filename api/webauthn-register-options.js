const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { codice } = req.body;

    if (!codice) {
      return res.status(400).json({ error: 'Codice utente obbligatorio' });
    }

    // Genera una sfida casuale (32 byte, in base64url) valida per questa registrazione
    const challenge = crypto.randomBytes(32).toString('base64url');

    // Dati che il telefono/browser userà per creare la chiave d'impronta
    const options = {
      challenge,
      rp: {
        name: 'Prenota Campo',
        id: req.headers.host.split(':')[0] // dominio senza porta
      },
      user: {
        id: Buffer.from(codice).toString('base64url'),
        name: codice,
        displayName: codice
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }  // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required'
      },
      timeout: 60000,
      attestation: 'none'
    };

    res.setHeader('Set-Cookie', `wa_challenge=${challenge}; HttpOnly; Secure; SameSite=Strict; Max-Age=60; Path=/api`);
    return res.status(200).json(options);

  } catch (err) {
    console.error('❌ Errore generazione opzioni WebAuthn:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
};
