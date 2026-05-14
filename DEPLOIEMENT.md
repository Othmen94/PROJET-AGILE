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

## Uploads photos — Supabase Storage

Les photos sont stockées dans un bucket **Supabase Storage** (persistant,
contrairement au disque Render qui est effacé à chaque redéploiement).

### Création du bucket (une seule fois)

1. Supabase Dashboard → **Storage** (icône dossier dans le menu de gauche)
2. **New bucket**
   - **Name** : `photos`
   - **Public bucket** : ✅ activé (les URLs sont publiques, sans token)
   - **File size limit** : `10 MB` (ou plus)
   - **Allowed MIME types** : `image/jpeg, image/png, image/heic, image/webp`
3. **Create bucket**

### Politique RLS (Storage)

Par défaut le bucket public laisse n'importe qui **lire** les fichiers
(via leur URL exacte). Pour autoriser l'**upload** depuis le backend
(qui utilise la clé `service_role`), aucune policy n'est nécessaire :
la service_role contourne RLS.

Si tu veux un jour activer RLS strict, ajoute une policy d'upload :

```sql
create policy "service can upload to photos"
on storage.objects for insert
to service_role
with check (bucket_id = 'photos');
```

### Anciennes photos (avant migration)

Les photos uploadées avant cette migration étaient sur le disque Render
et sont définitivement perdues si Render a redémarré entre-temps. Les
entrées correspondantes dans la table `photos` afficheront un placeholder.


