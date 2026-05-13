# PostOp Suivi — Guide de déploiement

## 1. Schéma Supabase

Ouvre **Supabase → SQL Editor → New query**, colle le contenu de
`supabase_schema.sql` puis clique **Run**. Le script est idempotent :
tu peux le relancer sans casser les données existantes.

## 2. Configurer l'email OTP dans Supabase

Les codes de vérification sont envoyés par **Supabase Auth** —
gratuit, fonctionne avec n'importe quelle adresse email,
sans domaine à vérifier.

Par défaut Supabase envoie un **magic link**. Pour envoyer un
**code à 6 chiffres** à la place :

1. Va dans **Supabase → Authentication → Email Templates**
2. Sélectionne le template **"Magic Link"**
3. Remplace le body HTML par :

```html
<h2>PostOp Suivi</h2>
<p>Bonjour,</p>
<p>Voici votre code de vérification :</p>
<h1 style="font-size:2.5rem;letter-spacing:.3em">{{ .Token }}</h1>
<p>Ce code expire dans 10 minutes.</p>
```

> Le `{{ .Token }}` est la variable Supabase qui contient le code
> à 6 chiffres. **C'est important de l'utiliser à la place de
> `{{ .ConfirmationURL }}`.**

4. Va dans **Authentication → Providers → Email** et assure-toi que
   **"Enable Email provider"** est activé et que **"Confirm email"**
   est coché.

### Limite du plan gratuit Supabase

L'envoi d'emails via Supabase Auth est limité à **environ 3 à 4
emails par heure et par adresse** sur le plan gratuit. Pour la
prod tu peux configurer un SMTP custom (Brevo, SendGrid, Gmail
SMTP…) dans **Authentication → SMTP Settings** — ça reste gratuit
et lève la limite.

## 3. Variables d'environnement sur Render

Dans le dashboard Render → ton service → **Environment**, ajoute :

| Variable | Valeur | Obligatoire |
|---|---|---|
| `SUPABASE_URL` | `https://nprtusmjdenvrqllfvgw.supabase.co` | ✅ |
| `SUPABASE_KEY` | clé `anon` (Supabase → Settings → API) | ✅ |
| `SUPABASE_SERVICE_KEY` | clé `service_role` (Supabase → Settings → API) | ✅ recommandé |
| `JWT_SECRET` | une chaîne aléatoire longue (≥ 32 caractères) | ✅ |
| ~~`RESEND_API_KEY`~~ | — peut être supprimée | ❌ plus utilisée |
| ~~`RESEND_TEST_EMAIL`~~ | — peut être supprimée | ❌ plus utilisée |

> ⚠️ La clé `service_role` est **secrète** : ne la commit jamais
> dans Git, configure-la uniquement comme variable d'environnement
> sur Render.

## 4. Build & start commands sur Render

- **Build Command** : `npm install`
- **Start Command** : `npm start`
- **Health Check Path** : `/health`

## 5. Vérification

Une fois redéployé, teste :

1. `https://projet-agile-yb8w.onrender.com/health` → doit renvoyer
   `{"ok":true,"ts":...}`
2. Inscription d'un patient avec une vraie adresse email → tu dois
   recevoir un code à 6 chiffres.
3. Vérification du code → création du compte + redirection app.

## Note sur les uploads

Les photos uploadées par les patients sont stockées dans le
dossier `uploads/` du conteneur Render. **Render efface ce dossier
à chaque redéploiement.** Pour de la prod il faudrait migrer
vers **Supabase Storage** (un bucket public ou signé) — c'est une
amélioration future, hors scope de ce changement.


