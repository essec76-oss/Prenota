// ============================================================
// API Route Vercel — Coda "richieste bloccate" (registrazioni ospite
// rifiutate per telefono duplicato)
// ============================================================
// Riservato agli admin (stesso controllo di update-user.js).
// GET  -> elenca le richieste non ancora risolte
// POST -> segna una richiesta come risolta (body: { id })
// ============================================================

const SUPABASE_URL = 'https://smwtbonxhvhrnyukrluw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkAdmin(req) {
  const authHeader = req.headers['authorization'] || '';
  const userToken = authHeader.replace(/^Bearer\s+/i, '');

  if (!userToken) {
    return { ok: false, status: 401, error: 'Devi essere autenticato.' };
  }

  const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: {
      apikey: SERVICE_ROLE_KEY,
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
        apikey: SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + SERVICE_ROLE_KEY
      }
    }
  );
  const adminCheckData = await adminCheckRes.json();

  if (!adminCheckRes.ok || !adminCheckData.length || adminCheckData[0].is_admin !== true) {
    return { ok: false, status: 403, error: 'Non hai i permessi di amministratore.' };
  }

  return { ok: true };
}

module.exports = async function handler(req, res) {
  if (!SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configurazione server incompleta (manca SUPABASE_SERVICE_ROLE_KEY)' });
  }

  const admin = await checkAdmin(req);
  if (!admin.ok) {
    return res.status(admin.status).json({ error: admin.error });
  }

  if (req.method === 'GET') {
    try {
      const listRes = await fetch(
        SUPABASE_URL + '/rest/v1/richieste_bloccate?risolta=eq.false&select=*&order=created_at.desc',
        {
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: 'Bearer ' + SERVICE_ROLE_KEY
          }
        }
      );
      if (!listRes.ok) throw new Error('Errore caricamento richieste bloccate');
      const richieste = await listRes.json();
      return res.status(200).json({ success: true, richieste });
    } catch (e) {
      return res.status(500).json({ error: 'Errore imprevisto: ' + e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { id } = req.body || {};
      if (!id) {
        return res.status(400).json({ error: 'id mancante.' });
      }

      const updateRes = await fetch(
        SUPABASE_URL + '/rest/v1/richieste_bloccate?id=eq.' + encodeURIComponent(id),
        {
          method: 'PATCH',
          headers: {
            apikey: SERVICE_ROLE_KEY,
            Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
          },
          body: JSON.stringify({ risolta: true, risolta_il: new Date().toISOString() })
        }
      );

      if (!updateRes.ok) {
        const errBody = await updateRes.json().catch(() => ({}));
        return res.status(500).json({ error: 'Errore aggiornamento: ' + (errBody.message || updateRes.statusText) });
      }

      const updated = await updateRes.json();
      if (!updated.length) {
        return res.status(404).json({ error: 'Richiesta non trovata.' });
      }

      return res.status(200).json({ success: true, richiesta: updated[0] });
    } catch (e) {
      return res.status(500).json({ error: 'Errore imprevisto: ' + e.message });
    }
  }

  return res.status(405).json({ error: 'Metodo non consentito' });
};
