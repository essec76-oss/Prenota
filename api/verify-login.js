// ============================================================
// API Route Vercel — Verifica codice di login (server-side)
// ============================================================
// Sostituisce la query diretta a Supabase fatta dal browser con la
// chiave pubblica. Qui la verifica avviene lato server con la
// SERVICE_ROLE_KEY (mai esposta al client), e la risposta NON
// contiene mai il campo "codice" né dati non necessari al frontend.
// ============================================================

const SUPABASE_URL = 'https://smwtbonxhvhrnyukrluw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }
  if (!SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configurazione server incompleta (manca SUPABASE_SERVICE_ROLE_KEY)' });
  }

  try {
    const { codice } = req.body || {};
    if (!codice || typeof codice !== 'string') {
      return res.status(400).json({ error: 'Codice mancante.' });
    }
    const codiceClean = codice.trim().toLowerCase();

    const isTesserato = /^t[a-z0-9\-]{4,20}$/.test(codiceClean);
    const isOspite = /^o[a-z0-9]{7}$/.test(codiceClean);
    if (!isTesserato && !isOspite) {
      return res.status(400).json({ error: 'Codice non valido. Formato: tXXXX (tesserato) o oXXXXXXX (ospite).' });
    }

    const tipo = isTesserato ? 'tesserato' : 'ospite';
    const table = isTesserato ? 'Tesserati' : 'Ospiti';
    const selectFields = isTesserato
      ? 'id,nome,cognome,is_tennis_member,is_padel_member,is_admin,is_direttivo,scadenza,totp_enabled,can_book_special'
      : 'id,nome,cognome,is_tennis_member,is_padel_member,scadenza,attivo';

    const lookupRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=${selectFields}&codice=eq.${encodeURIComponent(codiceClean)}`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`
        }
      }
    );

    if (!lookupRes.ok) {
      return res.status(500).json({ error: 'Errore durante la verifica.' });
    }

    const rows = await lookupRes.json();
    if (!rows || rows.length === 0) {
      // Risposta generica: non riveliamo se il codice esiste o meno per un altro tipo
      return res.status(401).json({ error: 'Codice non valido. Controlla di averlo scritto bene.' });
    }

    const utente = rows[0];

    if (tipo === 'ospite') {
      const oggiItalia = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
      const scaduto = utente.scadenza && utente.scadenza < oggiItalia;
      const inattivo = utente.attivo === false;
      if (scaduto || inattivo) {
        return res.status(200).json({
          success: false,
          scaduto: true,
          utente: {
            nome: utente.nome,
            cognome: utente.cognome,
            sport: utente.is_tennis_member && utente.is_padel_member ? 'both'
                 : utente.is_tennis_member ? 'tennis'
                 : utente.is_padel_member ? 'padel' : 'both'
          }
        });
      }
    }

    // Il campo "codice" NON viene mai incluso nella risposta: il client
    // lo conosce già (l'ha appena digitato) e non deve tornare nel payload.
    return res.status(200).json({
      success: true,
      tipo,
      utente: {
        id: utente.id,
        nome: utente.nome,
        cognome: utente.cognome,
        is_tennis_member: utente.is_tennis_member || false,
        is_padel_member: utente.is_padel_member || false,
        is_admin: utente.is_admin || false,
        is_direttivo: utente.is_direttivo || false,
        can_book_special: utente.can_book_special || false,
        scadenza: utente.scadenza || null,
        totp_enabled: utente.totp_enabled || false
      }
    });

  } catch (e) {
    console.error('Errore verify-login:', e);
    return res.status(500).json({ error: 'Errore imprevisto: ' + e.message });
  }
};
