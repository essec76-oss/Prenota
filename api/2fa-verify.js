// /api/2fa-verify.js
import { createClient } from '@supabase/supabase-js';
import { authenticator } from 'otplib';

// Inizializza Supabase con le variabili d'ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configura otplib per generare/verificare codici TOTP
authenticator.options = {
  window: 1, // Finestra di tolleranza per la verifica (es. ±30 secondi)
  step: 30,  // Intervallo di tempo in secondi (default: 30)
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, tipo, code } = req.body;

    // Validazione dei dati in input
    if (!userId || !tipo || !code) {
      return res.status(400).json({ error: 'Dati mancanti: userId, tipo o code' });
    }

    // Recupera il segreto TOTP dell'utente da Supabase
    const tableName = tipo === 'tesserato' ? 'Tesserati' : 'Ospiti';
    const { data: userData, error: userError } = await supabase
      .from(tableName)
      .select('totp_secret')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('Errore nel recupero del segreto TOTP:', userError);
      return res.status(500).json({ error: 'Errore nel recupero dei dati utente' });
    }

    if (!userData || !userData.totp_secret) {
      return res.status(400).json({ error: 'Segreto TOTP non trovato per questo utente' });
    }

    // Verifica il codice 2FA con il segreto TOTP
    const isValid = authenticator.check(code, userData.totp_secret);

    if (!isValid) {
      return res.status(401).json({ error: 'Codice 2FA non valido' });
    }

    // Se il codice è valido, restituisci una risposta di successo
    return res.status(200).json({
      authenticated: true,
      message: 'Codice 2FA valido'
    });

  } catch (err) {
    console.error('Errore in /api/2fa-verify:', err);
    return res.status(500).json({
      error: err.message || 'Errore interno del server'
    });
  }
}
