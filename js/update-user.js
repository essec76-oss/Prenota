// ============================================================
// API Route Vercel — Modifica o eliminazione di tesserati/ospiti (solo admin)
// ============================================================
// azione: 'update' (default) oppure 'delete'.
// Il telefono è richiesto solo alla creazione: in modifica, se
// non viene inviato, resta quello già salvato.
// ============================================================

const SUPABASE_URL = 'https://smwtbonxhvhrnyukrluw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }
  if (!SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configurazione server incompleta (manca SUPABASE_SERVICE_ROLE_KEY)' });
  }

  try {
    // 1) Chi chiama?
    const authHeader = req.headers['authorization'] || '';
    const userToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!userToken) {
      return res.status(401).json({ error: 'Devi essere autenticato per modificare un utente.' });
    }
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + userToken }
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Sessione non valida. Rifai il login.' });
    }
    const authUser = await userRes.json();

    // 2) È un admin?
    const adminRes = await fetch(
      SUPABASE_URL + '/rest/v1/Tesserati?select=is_admin&auth_id=eq.' + encodeURIComponent(authUser.id),
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY } }
    );
    const adminData = await adminRes.json();
    if (!adminRes.ok || !adminData.length || adminData[0].is_admin !== true) {
      return res.status(403).json({ error: 'Non hai i permessi di amministratore.' });
    }

    // 3) Dati in ingresso
    const { azione, id, tipo, nome, cognome, sport, telefono, scadenza } = req.body || {};
    if (!id || !tipo) {
      return res.status(400).json({ error: 'Dati mancanti: id e tipo sono obbligatori.' });
    }
    if (tipo !== 'tesserato' && tipo !== 'ospite') {
      return res.status(400).json({ error: 'Tipo non valido.' });
    }
    const tabella = tipo === 'tesserato' ? 'Tesserati' : 'Ospiti';
    const filtro = '?id=eq.' + encodeURIComponent(id);
    const headers = {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    };

    // 4a) ELIMINAZIONE
    if (azione === 'delete') {
      const delRes = await fetch(SUPABASE_URL + '/rest/v1/' + tabella + filtro, { method: 'DELETE', headers });
      if (!delRes.ok) {
        const err = await delRes.json().catch(() => ({}));
        if (err.code === '23503') {
          return res.status(409).json({ error: 'Impossibile eliminare: l\'utente ha prenotazioni collegate.' });
        }
        return res.status(500).json({ error: 'Errore eliminazione: ' + (err.message || delRes.statusText) });
      }
      const rimossi = await delRes.json();
      if (!rimossi.length) {
        return res.status(404).json({ error: 'Utente non trovato.' });
      }
      return res.status(200).json({ success: true });
    }

    // 4b) MODIFICA
    if (!nome || !cognome) {
      return res.status(400).json({ error: 'Nome e Cognome sono obbligatori.' });
    }
    if (!['tennis', 'padel', 'both'].includes(sport)) {
      return res.status(400).json({ error: 'Seleziona uno sport valido.' });
    }
    if (scadenza && !DATA_RE.test(scadenza)) {
      return res.status(400).json({ error: 'Formato scadenza non valido (AAAA-MM-GG).' });
    }
    const updatePayload = {
      nome,
      cognome,
      is_tennis_member: sport === 'tennis' || sport === 'both',
      is_padel_member: sport === 'padel' || sport === 'both',
      scadenza: scadenza || null
    };
    if (tipo === 'ospite' && telefono) {
      updatePayload.telefono = telefono;
    }

    const updRes = await fetch(SUPABASE_URL + '/rest/v1/' + tabella + filtro, {
      method: 'PATCH', headers, body: JSON.stringify(updatePayload)
    });
    if (!updRes.ok) {
      const err = await updRes.json().catch(() => ({}));
      return res.status(500).json({ error: 'Errore modifica utente: ' + (err.message || updRes.statusText) });
    }
    const aggiornato = await updRes.json();
    if (!aggiornato.length) {
      return res.status(404).json({ error: 'Utente non trovato.' });
    }
    return res.status(200).json({ success: true, utente: aggiornato[0] });

  } catch (e) {
    return res.status(500).json({ error: 'Errore imprevisto: ' + e.message });
  }
};
