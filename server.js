const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

const JWT_SECRET = process.env.JWT_SECRET || 'postop_secret_key_2026';

// ─────────────────────────────────────────────────────────────
//   SUPABASE
//   - SUPABASE_URL          : URL du projet
//   - SUPABASE_KEY          : clé "anon" (côté client) — suffit pour OTP
//   - SUPABASE_SERVICE_KEY  : clé "service_role" (optionnelle, contourne RLS)
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nprtusmjdenvrqllfvgw.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wcnR1c21qZGVudnJxbGxmdmd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTI5NDMsImV4cCI6MjA5NDE4ODk0M30.36EK2Agw6MsC-wlolFpNuAVVna6QC8lmenX_MgbnhqY';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON;

// Client "anon" : utilisé pour Auth (signInWithOtp / verifyOtp)
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Client "service" : utilisé pour les requêtes data (contourne RLS si activé)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ─────────────────────────────────────────────────────────────
//   STOCKAGE TEMPORAIRE DES PROFILS EN ATTENTE DE VÉRIFICATION
//   Le code OTP est géré par Supabase. On ne stocke ici que
//   les infos de profil (nom, prenom, password) à insérer
//   dans la table users après vérification du code.
// ─────────────────────────────────────────────────────────────
const pendingProfiles = {};

// ─────────────────────────────────────────────────────────────
//   MIDDLEWARE AUTH (JWT maison)
// ─────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
  }
}

function signSessionToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, nom: user.nom, prenom: user.prenom, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ════════════════════════════════
//   AUTH — INSCRIPTION + OTP
// ════════════════════════════════

// 1) /api/auth/register
//    Vérifie que l'email n'est pas déjà pris, stocke le profil
//    en attente puis demande à Supabase d'envoyer un code OTP.
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nom, prenom } = req.body || {};
  if (!email || !password || !nom || !prenom)
    return res.status(400).json({ error: 'Tous les champs sont requis' });

  const emailLc = email.toLowerCase().trim();

  // L'email existe-t-il déjà dans notre table users ?
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', emailLc)
    .maybeSingle();

  if (existing) return res.status(400).json({ error: 'Cet email est déjà utilisé' });

  // On stocke le profil en attente (15 min)
  pendingProfiles[emailLc] = {
    expires: Date.now() + 15 * 60 * 1000,
    userData: { email: emailLc, password, nom, prenom }
  };

  // Demande à Supabase d'envoyer un OTP à 6 chiffres
  //   - shouldCreateUser:true → permet l'envoi même si l'utilisateur
  //     auth n'existe pas encore (Supabase créera un user auth, qu'on ignore)
  const { error } = await supabaseAuth.auth.signInWithOtp({
    email: emailLc,
    options: { shouldCreateUser: true }
  });

  if (error) {
    console.error('Erreur Supabase OTP :', error.message);
    return res.status(500).json({
      error: "Impossible d'envoyer l'email : " + error.message
    });
  }

  res.json({ success: true, message: 'Code envoyé par email' });
});

// 2) /api/auth/verify
//    Valide l'OTP via Supabase. Si OK, crée le compte dans
//    notre table users (avec mot de passe hashé bcrypt) et
//    renvoie notre propre JWT.
app.post('/api/auth/verify', async (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'Email et code requis' });

  const emailLc = email.toLowerCase().trim();
  const pending = pendingProfiles[emailLc];

  if (!pending) {
    return res.status(400).json({ error: 'Aucune inscription en attente pour cet email' });
  }
  if (Date.now() > pending.expires) {
    delete pendingProfiles[emailLc];
    return res.status(400).json({ error: "Code expiré. Recommencez l'inscription." });
  }

  // Vérification de l'OTP côté Supabase
  const { error: otpError } = await supabaseAuth.auth.verifyOtp({
    email: emailLc,
    token: String(code).trim(),
    type: 'email'
  });

  if (otpError) {
    return res.status(400).json({ error: 'Code incorrect ou expiré' });
  }

  // OTP valide → on crée l'utilisateur dans notre table
  const hash = await bcrypt.hash(pending.userData.password, 10);

  const { data: user, error: insertError } = await supabase
    .from('users')
    .insert({
      email: pending.userData.email,
      password: hash,
      nom: pending.userData.nom,
      prenom: pending.userData.prenom,
      role: 'patient'
    })
    .select()
    .single();

  if (insertError) {
    console.error('Erreur insert users :', insertError);
    return res.status(500).json({ error: 'Erreur création compte : ' + insertError.message });
  }

  delete pendingProfiles[emailLc];

  const token = signSessionToken(user);
  res.json({
    success: true,
    token,
    user: { nom: user.nom, prenom: user.prenom, email: user.email, role: user.role }
  });
});

// 3) /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (!user) return res.status(400).json({ error: 'Email ou mot de passe incorrect' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'Email ou mot de passe incorrect' });

  const token = signSessionToken(user);
  res.json({
    success: true,
    token,
    user: { nom: user.nom, prenom: user.prenom, email: user.email, role: user.role }
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ════════════════════════════════
//   ROUTES PATIENT
// ════════════════════════════════

app.post('/api/questionnaire', authMiddleware, async (req, res) => {
  const { douleur, temperature, fatigue, plaie } = req.body || {};
  if (!douleur || !temperature || !fatigue || !plaie)
    return res.status(400).json({ error: 'Champs manquants' });

  const patient_nom = `${req.user.prenom} ${req.user.nom}`;
  const est_risque = douleur >= 4 || temperature === 'elevee' || fatigue >= 4 || plaie !== 'normale';

  const { error: qErr } = await supabase.from('questionnaires').insert({
    patient_nom, email: req.user.email, douleur, temperature, fatigue, plaie, est_risque
  });
  if (qErr) return res.status(500).json({ error: qErr.message });

  if (est_risque) {
    const details = [];
    if (douleur >= 4) details.push(`douleur ${douleur}/5`);
    if (temperature === 'elevee') details.push('température élevée');
    if (fatigue >= 4) details.push(`fatigue ${fatigue}/5`);
    if (plaie !== 'normale') details.push(`plaie : ${plaie}`);
    await supabase.from('alertes').insert({
      patient_nom, email: req.user.email,
      niveau: 'danger',
      message: `Réponses à risque — ${details.join(', ')}`,
      lu: false
    });
  }

  res.json({ success: true, est_risque });
});

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/photo', authMiddleware, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  const patient_nom = `${req.user.prenom} ${req.user.nom}`;
  const { error } = await supabase.from('photos').insert({
    patient_nom, email: req.user.email,
    fichier: req.file.filename,
    message: req.body.message || ''
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, fichier: req.file.filename });
});

app.post('/api/message', authMiddleware, async (req, res) => {
  const { contenu } = req.body || {};
  if (!contenu) return res.status(400).json({ error: 'Message vide' });
  const patient_nom = `${req.user.prenom} ${req.user.nom}`;
  const { error } = await supabase.from('messages').insert({
    patient_nom, email: req.user.email, contenu
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.get('/api/planning/:email', authMiddleware, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('planning')
    .select('*')
    .eq('email', req.params.email)
    .gte('date', today)
    .order('heure', { ascending: true });
  res.json(data || []);
});

app.post('/api/planning', authMiddleware, async (req, res) => {
  const { heure, nom, icone } = req.body || {};
  if (!heure || !nom) return res.status(400).json({ error: 'Champs manquants' });
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('planning').insert({
    email: req.user.email,
    patient_nom: `${req.user.prenom} ${req.user.nom}`,
    date: today,
    heure, nom, icone: icone || '📌', fait: false
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.patch('/api/planning/:id', authMiddleware, async (req, res) => {
  const { error } = await supabase.from('planning').update({ fait: req.body.fait }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ════════════════════════════════
//   ROUTES MÉDECIN
// ════════════════════════════════

app.get('/api/questionnaires', async (req, res) => {
  const { data } = await supabase.from('questionnaires').select('*').order('date', { ascending: false }).limit(100);
  res.json(data || []);
});

app.get('/api/photos', async (req, res) => {
  const { data } = await supabase.from('photos').select('*').order('date', { ascending: false }).limit(100);
  res.json(data || []);
});

app.get('/api/alertes', async (req, res) => {
  const { data } = await supabase.from('alertes').select('*').order('date', { ascending: false }).limit(100);
  res.json(data || []);
});

app.get('/api/messages', async (req, res) => {
  const { data } = await supabase.from('messages').select('*').order('date', { ascending: false }).limit(100);
  res.json(data || []);
});

app.patch('/api/alertes/:id/lu', async (req, res) => {
  await supabase.from('alertes').update({ lu: true }).eq('id', req.params.id);
  res.json({ success: true });
});

app.get('/api/stats', async (req, res) => {
  const [q, a, p, m, u] = await Promise.all([
    supabase.from('questionnaires').select('id', { count: 'exact', head: true }),
    supabase.from('alertes').select('id', { count: 'exact', head: true }).eq('lu', false),
    supabase.from('photos').select('id', { count: 'exact', head: true }),
    supabase.from('messages').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true })
  ]);
  res.json({
    total_questionnaires: q.count || 0,
    alertes_non_lues: a.count || 0,
    photos_recues: p.count || 0,
    messages_recus: m.count || 0,
    total_patients: u.count || 0
  });
});

// ── PAGE D'ACCUEIL ──
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── HEALTHCHECK (utile pour Render) ──
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── DÉMARRAGE ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('✅  Serveur PostOp Suivi démarré sur le port', PORT);
  console.log('');
  console.log('   SUPABASE_URL          :', process.env.SUPABASE_URL ? '✅' : '⚠️  valeur par défaut');
  console.log('   SUPABASE_KEY (anon)   :', process.env.SUPABASE_KEY ? '✅' : '⚠️  valeur par défaut');
  console.log('   SUPABASE_SERVICE_KEY  :', process.env.SUPABASE_SERVICE_KEY ? '✅' : '⚠️  utilise la clé anon');
  console.log('   JWT_SECRET            :', process.env.JWT_SECRET ? '✅' : '⚠️  valeur par défaut');
  console.log('');
  console.log('   📧 Emails OTP envoyés via Supabase Auth (signInWithOtp)');
  console.log('');
});
