// ============================================================
// API Route Vercel — Posti rimasti oggi per auto-registrazione ospiti
// ============================================================
// Endpoint pubblico, sola lettura. Usa la SERVICE_ROLE_KEY solo
// lato server per contare le righe di oggi in daily_guest_profiles.
// ============================================================

const SUPABASE_URL = 'https://smwtbonxhvhrnyukrluw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIMITE_GIORNALIERO = 5;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  if (!SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configurazione server incompleta' });
  }

  try {
    const dataItalia = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());

    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_guest_profiles?created_at=gte.${dataItalia}T00:00:00&select=id`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          Prefer: 'count=exact'
        }
      }
    );

    const contentRange = countRes.headers.get('content-range');
    const totaleOggi = contentRange ? parseInt(contentRange.split('/')[1]) : 0;
    const rimasti = Math.max(0, LIMITE_GIORNALIERO - totaleOggi);

    return res.status(200).json({
      rimasti,
      totale: LIMITE_GIORNALIERO
    });

  } catch (e) {
    console.error('Errore guest-slots:', e);
    return res.status(500).json({ error: 'Errore imprevisto: ' + e.message });
  }
};
