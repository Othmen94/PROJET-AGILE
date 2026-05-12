-- ════════════════════════════════════════════════════════════════
--   PostOp Suivi — Schéma Supabase (idempotent)
--   À exécuter dans : Supabase → SQL Editor → Run
--
--   Le script peut être relancé sans risque (IF NOT EXISTS).
--   Toutes les tables vivent dans le schéma `public`.
-- ════════════════════════════════════════════════════════════════

-- ── 1. UTILISATEURS ──────────────────────────────────────────────
create table if not exists public.users (
  id          bigserial primary key,
  email       text unique not null,
  password    text not null,                 -- hash bcrypt
  nom         text not null,
  prenom      text not null,
  role        text not null default 'patient',
  date        timestamptz not null default now()
);

create index if not exists idx_users_email on public.users (email);

-- ── 2. QUESTIONNAIRES ────────────────────────────────────────────
create table if not exists public.questionnaires (
  id           bigserial primary key,
  patient_nom  text not null,
  email        text not null,
  douleur      int  not null,                -- 1..5
  temperature  text not null,                -- 'normale' | 'elevee' | 'inconnue'
  fatigue      int  not null,                -- 1..5
  plaie        text not null,                -- 'normale' | 'rougeur' | 'ecoulement'
  est_risque   boolean not null default false,
  date         timestamptz not null default now()
);

create index if not exists idx_questionnaires_email on public.questionnaires (email);
create index if not exists idx_questionnaires_date  on public.questionnaires (date desc);

-- ── 3. PHOTOS ─────────────────────────────────────────────────────
create table if not exists public.photos (
  id           bigserial primary key,
  patient_nom  text not null,
  email        text not null,
  fichier      text not null,
  message      text default '',
  date         timestamptz not null default now()
);

create index if not exists idx_photos_email on public.photos (email);
create index if not exists idx_photos_date  on public.photos (date desc);

-- ── 4. ALERTES ────────────────────────────────────────────────────
create table if not exists public.alertes (
  id           bigserial primary key,
  patient_nom  text not null,
  email        text not null,
  niveau       text not null default 'danger',
  message      text not null,
  lu           boolean not null default false,
  date         timestamptz not null default now()
);

create index if not exists idx_alertes_email on public.alertes (email);
create index if not exists idx_alertes_lu    on public.alertes (lu);
create index if not exists idx_alertes_date  on public.alertes (date desc);

-- ── 5. MESSAGES ───────────────────────────────────────────────────
create table if not exists public.messages (
  id           bigserial primary key,
  patient_nom  text not null,
  email        text not null,
  contenu      text not null,
  date         timestamptz not null default now()
);

create index if not exists idx_messages_email on public.messages (email);
create index if not exists idx_messages_date  on public.messages (date desc);

-- ── 6. PLANNING ───────────────────────────────────────────────────
create table if not exists public.planning (
  id           bigserial primary key,
  email        text not null,
  patient_nom  text not null,
  date         date not null default current_date,
  heure        text not null,                -- format "HH:MM"
  nom          text not null,
  icone        text default '📌',
  fait         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists idx_planning_email on public.planning (email);
create index if not exists idx_planning_date  on public.planning (date);

-- ════════════════════════════════════════════════════════════════
--   RLS (Row Level Security)
--
--   On désactive RLS sur ces tables : l'application est
--   exclusivement accédée via le backend (server.js) qui utilise
--   la clé SERVICE_ROLE — il n'y a pas de client navigateur qui
--   appelle Supabase directement. Désactiver RLS évite des
--   erreurs "permission denied" silencieuses.
--
--   Si tu veux durcir plus tard : réactive RLS et ajoute des
--   policies appropriées.
-- ════════════════════════════════════════════════════════════════
alter table public.users          disable row level security;
alter table public.questionnaires disable row level security;
alter table public.photos         disable row level security;
alter table public.alertes        disable row level security;
alter table public.messages       disable row level security;
alter table public.planning       disable row level security;
