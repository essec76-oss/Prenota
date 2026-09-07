// ============================================================
// GENERAZIONE CODICE UNIVOCO
// ============================================================
async function generateUniqueCode(tipo, tentativi = 0) {
  // Massimo 20 tentativi per evitare loop infiniti
  if (tentativi >= 20) {
    throw new Error('Impossibile generare un codice univoco dopo 20 tentativi');
  }
  
  // Genera numero casuale a 4 cifre (da 1000 a 9999)
  const numero = String(Math.floor(1000 + Math.random() * 9000));
  const codice = (tipo === 'tesserato' ? 't' : 'o') + numero;
  
  // Verifica se il codice esiste già nella tabella corrispondente
  const table = tipo === 'tesserato' ? 'Tesserati' : 'Ospiti';
  const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?codice=eq.${codice}&select=id`, {
    headers: { 
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json'
    }
  });
  
  if (!checkRes.ok) {
    throw new Error('Errore verifica codice');
  }
  
  const existing = await checkRes.json();
  
  // Se il codice esiste già, ritenta con un nuovo codice
  if (existing && existing.length > 0) {
    console.log(`🔄 Codice ${codice} già esistente, ritento... (tentativo ${tentativi + 1})`);
    return generateUniqueCode(tipo, tentativi + 1);
  }
  
  console.log(`✅ Codice univoco generato: ${codice}`);
  return codice;
}

// ============================================================
// ROTTA /api/create-user
// ============================================================
app.post('/api/create-user', async (req, res) => {
  try {
    // 1. VERIFICA AUTENTICAZIONE ADMIN
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Non autorizzato. Token mancante.' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verifica token con Supabase Auth
    try {
      const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!verifyRes.ok) {
        return res.status(401).json({ error: 'Token non valido o scaduto.' });
      }
      
      const userData = await verifyRes.json();
      
      // Verifica che l'utente sia admin (controlla nella tabella Tesserati)
      const adminCheck = await fetch(
        `${SUPABASE_URL}/rest/v1/Tesserati?auth_id=eq.${userData.id}&is_admin=eq.true&select=id`,
        { headers: { apikey: SUPABASE_KEY } }
      );
      const adminData = await adminCheck.json();
      
      if (!adminData || adminData.length === 0) {
        return res.status(403).json({ error: 'Non sei autorizzato a creare utenti.' });
      }
      
    } catch(authErr) {
      console.error('❌ Errore verifica token:', authErr);
      return res.status(401).json({ error: 'Errore autenticazione.' });
    }
    
    // 2. VALIDA INPUT
    const { tipo, nome, cognome, sport, telefono, scadenza } = req.body;
    
    if (!nome || !cognome) {
      return res.status(400).json({ error: 'Nome e Cognome sono obbligatori.' });
    }
    
    if (!sport) {
      return res.status(400).json({ error: 'Seleziona uno sport.' });
    }
    
    // 3. GENERA CODICE UNIVOCO
    let codice;
    try {
      codice = await generateUniqueCode(tipo);
    } catch(codeErr) {
      return res.status(500).json({ error: codeErr.message });
    }
    
    // 4. PREPARA PAYLOAD
    let insertPayload;
    if (tipo === 'tesserato') {
      insertPayload = {
        nome,
        cognome,
        codice,
        is_tennis_member: sport === 'tennis' || sport === 'both',
        is_padel_member: sport === 'padel' || sport === 'both',
        is_admin: false,
        scadenza: scadenza || null
      };
    } else {
      // OSPITE
      if (!telefono) {
        return res.status(400).json({ error: 'Il telefono è obbligatorio per gli ospiti.' });
      }
      insertPayload = {
        nome,
        cognome,
        codice,
        telefono,
        is_tennis_member: sport === 'tennis' || sport === 'both',
        is_padel_member: sport === 'padel' || sport === 'both',
        attivo: true,
        scadenza: scadenza || null
      };
    }
    
    console.log(`📝 Creazione ${tipo}:`, { nome, cognome, codice, sport });
    
    // 5. INSERISCI IN SUPABASE
    const table = tipo === 'tesserato' ? 'Tesserati' : 'Ospiti';
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(insertPayload)
    });
    
    if (!insertRes.ok) {
      let errorDetail = '';
      try {
        const errBody = await insertRes.json();
        errorDetail = errBody.message || errBody.details || JSON.stringify(errBody);
      } catch(_) {
        errorDetail = insertRes.status + ' ' + insertRes.statusText;
      }
      
      console.error('❌ Errore inserimento:', errorDetail);
      
      // Se il codice è duplicato (caso raro ma possibile), ritenta
      if (errorDetail.includes('duplicate key') || errorDetail.includes('_codice_key')) {
        console.log('⚠️ Duplicato rilevato, genero nuovo codice e ritento...');
        
        try {
          const newCodice = await generateUniqueCode(tipo);
          insertPayload.codice = newCodice;
          
          const retryRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_KEY,
              'Content-Type': 'application/json',
              Prefer: 'return=representation'
            },
            body: JSON.stringify(insertPayload)
          });
          
          if (retryRes.ok) {
            const created = await retryRes.json();
            return res.status(201).json({
              message: 'Utente creato con successo',
              codice: newCodice,
              user: created[0],
              retry: true
            });
          } else {
            throw new Error('Ritentativo fallito');
          }
        } catch(retryErr) {
          return res.status(500).json({ 
            error: 'Errore durante il ritentativo. Riprova più tardi.' 
          });
        }
      }
      
      throw new Error(errorDetail);
    }
    
    const created = await insertRes.json();
    console.log(`✅ Utente ${tipo} creato con codice: ${codice}`);
    
    res.status(201).json({
      message: 'Utente creato con successo',
      codice: codice,
      user: created[0] || { id: 'creato' }
    });
    
  } catch(e) {
    console.error('❌ Errore creazione utente:', e);
    res.status(500).json({ error: e.message || 'Errore interno del server' });
  }
});
