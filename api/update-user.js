// ============================================================
// API Route Vercel — Modifica sicura di tesserati/ospiti
// ============================================================
// Gira sul SERVER di Vercel. Usa la SUPABASE_SERVICE_ROLE_KEY
// per verificare che chi chiede la modifica sia davvero un
// admin, poi aggiorna la riga in Tesserati/Ospiti.
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
    // ------------------------------------------------------------
    // 1) Verifica di chi sta facendo la richiesta (token utente)
    // ------------------------------------------------------------
    const authHeader = req.headers['authorization'] || '';
    const userToken = authHeader.replace(/^Bearer\s+/i, '');

    if (!userToken) {
      return res.status(401).json({ error: 'Devi essere autenticato per modificare un utente.' });
    }

    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + userToken
      }
    });

    if (!userRes.ok) {
      return res.status(401).json({ error: 'Sessione non valida. Rifai il login.' });
    }

    const authUser = await userRes.json();
    const requesterAuthId = authUser.id;

    // ------------------------------------------------------------
    // 2) Verifica che sia davvero un tesserato con is_admin = true
    // ------------------------------------------------------------
    const adminCheckRes = await fetch(
      SUPABASE_URL + '/rest/v1/Tesserati?select=is_admin&auth_id=eq.' + encodeURIComponent(requesterAuthId),
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: 'Bearer ' + SERVICE_ROLE_KEY
        }
      }
    );
    const adminCheckData = await adminCheckRes.json();

    if (!adminCheckRes.ok || !adminCheckData.length || adminCheckData[0].is_admin !== true) {
      return res.status(403).json({ error: 'Non hai i permessi di amministratore.' });
    }

    // ------------------------------------------------------------
    // 3) Leggi i dati da modificare dal corpo della richiesta
    // ------------------------------------------------------------
    const { id, tipo, nome, cognome, sport, telefono, scadenza } = req.body || {};

    if (!id || !tipo) {
      return res.status(400).json({ error: 'Dati mancanti: id e tipo sono obbligatori.' });
    }
    if (tipo !== 'tesserato' && tipo !== 'ospite') {
      return res.status(400).json({ error: 'Tipo non valido.' });
    }
    if (!nome || !cognome) {
      return res.status(400).json({ error: 'Nome e Cognome sono obbligatori.' });
    }

    // ------------------------------------------------------------
    // 4) Costruisci il payload di aggiornamento
    // ------------------------------------------------------------
    const tableName = tipo === 'tesserato' ? 'Tesserati' : 'Ospiti';

    const updatePayload = {
      nome,
      cognome,
      is_tennis_member: sport === 'tennis' || sport === 'both',
      is_padel_member: sport === 'padel' || sport === 'both',
      scadenza: scadenza || null
    };

    if (tipo === 'ospite') {
      if (!telefono) {
        return res.status(400).json({ error: 'Il telefono è obbligatorio per gli ospiti.' });
      }
      updatePayload.telefono = telefono;
    }

    // ------------------------------------------------------------
    // 5) Applica la modifica su Supabase (con service role)
    // ------------------------------------------------------------
    const updateRes = await fetch(SUPABASE_URL + '/rest/v1/' + tableName + '?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(updatePayload)
    });

    if (!updateRes.ok) {
      const errBody = await updateRes.json().catch(() => ({}));
      return res.status(500).json({ error: 'Errore modifica utente: ' + (errBody.message || updateRes.statusText) });
    }

    const updated = await updateRes.json();
    if (!updated.length) {
      return res.status(404).json({ error: 'Utente non trovato.' });
    }

    return res.status(200).json({ success: true, utente: updated[0] });

  } catch (e) {
    return res.status(500).json({ error: 'Errore imprevisto: ' + e.message });
  }
};
