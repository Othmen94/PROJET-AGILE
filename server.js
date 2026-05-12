const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { Resend } = require('resend');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

const JWT_SECRET = 'postop_secret_key_2026';
const resend = new Resend(process.env.RESEND_API_KEY);

// ── EMAIL ──
async function sendCode(to, code) {
  const { error } = await resend.emails.send({
    from: 'PostOp Suivi <onboarding@resend.dev>',
    to,
    subject: 'Votre code de vérification PostOp Suivi',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem;background:#0A1628;color:#F8FAFF;border-radius:16px">
        <h2 style="color:#00C2C7;margin-bottom:1rem">PostOp Suivi</h2>
        <p>Voici votre code de vérification :</p>
        <div style="font-size:2.5rem;font-weight:700;letter-spacing:.3em;text-align:center;padding:1.5rem;background:#101E38;border-radius:12px;margin:1.5rem 0;color:#fff">${code}</div>
        <p style="color:#8A9BB5;font-size:.85rem">Ce code expire dans 10 minutes. Ne le partagez pas.</p>
      </div>
    `
  });
  if (error) throw new Error(error.message);
}

// ── BASE DE DONNÉES JSON ──
const DB_FILE = './database.json';
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      users: [], questionnaires: [], photos: [], alertes: [], messages: [], planning: [], nextId: 1
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function newId(db) { const id = db.nextId || 1; db.nextId = id + 1; return id; }

const pendingCodes = {};

// ── MIDDLEWARE AUTH ──
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) {
    res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
  }
}

// ════════════════════════════════
//   AUTH
// ════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  const { email, password, nom, prenom } = req.body;
  if (!email || !password || !nom || !prenom)
    return res.status(400).json({ error: 'Tous les champs sont requis' });

  const db = loadDB();
  if (db.users.find(u => u.email === email.toLowerCase()))
    return res.status(400).json({ error: 'Cet email est déjà utilisé' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  pendingCodes[email.toLowerCase()] = {
    code,
    expires: Date.now() + 10 * 60 * 1000,
    userData: { email: email.toLowerCase(), password, nom, prenom }
  };

  try {
    await sendCode(email, code);
    res.json({ success: true, message: 'Code envoyé par email' });
  } catch(e) {
    console.error('Erreur email:', e.message);
    res.status(500).json({ error: 'Impossible d\'envoyer l\'email : ' + e.message });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  const { email, code } = req.body;
  const pending = pendingCodes[email?.toLowerCase()];

  if (!pending) return res.status(400).json({ error: 'Aucune inscription en attente pour cet email' });
  if (Date.now() > pending.expires) {
    delete pendingCodes[email.toLowerCase()];
    return res.status(400).json({ error: 'Code expiré. Recommencez l\'inscription.' });
  }
  if (pending.code !== code.trim())
    return res.status(400).json({ error: 'Code incorrect' });

  const db = loadDB();
  const hash = await bcrypt.hash(pending.userData.password, 10);
  const user = {
    id: newId(db),
    email: pending.userData.email,
    password: hash,
    nom: pending.userData.nom,
    prenom: pending.userData.prenom,
    role: 'patient',
    date: new Date().toISOString()
  };
  db.users.push(user);
  saveDB(db);
  delete pendingCodes[email.toLowerCase()];

  const token = jwt.sign(
    { id: user.id, email: user.email, nom: user.nom, prenom: user.prenom, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ success: true, token, user: { nom: user.nom, prenom: user.prenom, email: user.email, role: user.role } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const db = loadDB();
  const user = db.users.find(u => u.email === email.toLowerCase());
  if (!user) return res.status(400).json({ error: 'Email ou mot de passe incorrect' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'Email ou mot de passe incorrect' });

  const token = jwt.sign(
    { id: user.id, email: user.email, nom: user.nom, prenom: user.prenom, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ success: true, token, user: { nom: user.nom, prenom: user.prenom, email: user.email, role: user.role } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ════════════════════════════════
//   ROUTES PATIENT
// ════════════════════════════════

app.post('/api/questionnaire', authMiddleware, (req, res) => {
  const { douleur, temperature, fatigue, plaie } = req.body;
  if (!douleur || !temperature || !fatigue || !plaie)
    return res.status(400).json({ error: 'Champs manquants' });

  const db = loadDB();
  const patient_nom = `${req.user.prenom} ${req.user.nom}`;
  const est_risque = douleur >= 4 || temperature === 'elevee' || fatigue >= 4 || plaie !== 'normale';

  db.questionnaires.unshift({
    id: newId(db), patient_nom, email: req.user.email,
    douleur, temperature, fatigue, plaie, est_risque,
    date: new Date().toISOString()
  });

  if (est_risque) {
    const details = [];
    if (douleur >= 4) details.push(`douleur ${douleur}/5`);
    if (temperature === 'elevee') details.push('température élevée');
    if (fatigue >= 4) details.push(`fatigue ${fatigue}/5`);
    if (plaie !== 'normale') details.push(`plaie : ${plaie}`);
    db.alertes.unshift({
      id: newId(db), patient_nom, email: req.user.email,
      niveau: 'danger', message: `Réponses à risque — ${details.join(', ')}`,
      lu: false, date: new Date().toISOString()
    });
  }

  saveDB(db);
  res.json({ success: true, est_risque });
});

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/photo', authMiddleware, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  const db = loadDB();
  const patient_nom = `${req.user.prenom} ${req.user.nom}`;
  db.photos.unshift({
    id: newId(db), patient_nom, email: req.user.email,
    fichier: req.file.filename, message: req.body.message || '',
    date: new Date().toISOString()
  });
  saveDB(db);
  res.json({ success: true, fichier: req.file.filename });
});

app.post('/api/message', authMiddleware, (req, res) => {
  const { contenu } = req.body;
  if (!contenu) return res.status(400).json({ error: 'Message vide' });
  const db = loadDB();
  const patient_nom = `${req.user.prenom} ${req.user.nom}`;
  db.messages.unshift({
    id: newId(db), patient_nom, email: req.user.email,
    contenu, date: new Date().toISOString()
  });
  saveDB(db);
  res.json({ success: true });
});

app.get('/api/planning/:email', authMiddleware, (req, res) => {
  const db = loadDB();
  const today = new Date().toISOString().slice(0, 10);
  res.json(
    db.planning
      .filter(p => p.email === req.params.email && p.date.startsWith(today))
      .sort((a, b) => a.heure.localeCompare(b.heure))
  );
});

app.post('/api/planning', authMiddleware, (req, res) => {
  const { heure, nom, icone } = req.body;
  if (!heure || !nom) return res.status(400).json({ error: 'Champs manquants' });
  const db = loadDB();
  db.planning.push({
    id: newId(db), email: req.user.email,
    patient_nom: `${req.user.prenom} ${req.user.nom}`,
    heure, nom, icone: icone || '📌', fait: false,
    date: new Date().toISOString()
  });
  saveDB(db);
  res.json({ success: true });
});

app.patch('/api/planning/:id', authMiddleware, (req, res) => {
  const db = loadDB();
  const item = db.planning.find(p => p.id === parseInt(req.params.id));
  if (item) item.fait = req.body.fait;
  saveDB(db);
  res.json({ success: true });
});

// ════════════════════════════════
//   ROUTES MÉDECIN
// ════════════════════════════════

app.get('/api/questionnaires', (req, res) => res.json(loadDB().questionnaires.slice(0, 100)));
app.get('/api/photos', (req, res) => res.json(loadDB().photos.slice(0, 100)));
app.get('/api/alertes', (req, res) => res.json(loadDB().alertes.slice(0, 100)));
app.get('/api/messages', (req, res) => res.json(loadDB().messages.slice(0, 100)));

app.patch('/api/alertes/:id/lu', (req, res) => {
  const db = loadDB();
  const a = db.alertes.find(a => a.id === parseInt(req.params.id));
  if (a) a.lu = true;
  saveDB(db);
  res.json({ success: true });
});
//




app.get('/api/stats', (req, res) => {
  const db = loadDB();
  res.json({
    total_questionnaires: db.questionnaires.length,
    alertes_non_lues: db.alertes.filter(a => !a.lu).length,
    photos_recues: db.photos.length,
    messages_recus: db.messages.length,
    total_patients: db.users.length
  });
});

// ── PAGE D'ACCUEIL ──
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── DÉMARRAGE ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('✅  Serveur PostOp Suivi démarré !');
  console.log('');
  console.log('   👤 Patient  → http://localhost:' + PORT + '/patient.html');
  console.log('   🩺 Médecin  → http://localhost:' + PORT + '/medecin.html');
  console.log('');
  console.log('   RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ défini' : '❌ manquant');
  console.log('');
});