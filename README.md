# MrBokou — Guide de mise en production

"Trouvez un artisan, réalisez vos projets." — plateforme de mise en relation entre clients et artisans BTP (électricité, plomberie, maçonnerie, peinture, climatisation, menuiserie) au Togo.

## Architecture

```
mrbokou/
├── index.html                    ← Page d'accueil publique
├── pages/
│   ├── inscription.html          ← Créer un compte (client ou artisan)
│   ├── connexion.html            ← Connexion
│   ├── client-dashboard.html     ← Espace client : nouvelle demande + suivi
│   ├── artisan-dashboard.html    ← Espace artisan : demandes proches + missions
│   └── admin.html                ← Validation des artisans + supervision
├── js/
│   ├── supabase-config.js        ← Configuration Supabase (URL + clé anon)
│   ├── auth.js                   ← Inscription / connexion / rôles
│   ├── requests.js               ← Demandes : création, matching, cycle de vie
│   ├── artisans.js               ← Profils artisans + validation admin
│   ├── security.js               ← Validation formulaires + anti-XSS
│   └── ui.js                     ← Toasts, géolocalisation, distance
├── css/
│   └── style.css                 ← Design system (vert/orange MrBokou)
└── sql/
    └── schema.sql                ← Tables, RLS, triggers anti-fraude, RPC
```

App **100% statique** (HTML/CSS/JS vanilla, aucun build). Le SDK Supabase est chargé via CDN. Toute la logique sensible (qui peut accepter une demande, qui peut s'auto-approuver, qui peut noter un artisan) est verrouillée **côté serveur** via Row Level Security + triggers PostgreSQL — jamais côté client.

---

## Comment fonctionne le matching (type Uber)

1. Le client choisit un service, décrit son besoin, indique son adresse (+ position GPS optionnelle) → une ligne est créée dans `requests` avec le statut `en_attente`.
2. Tous les artisans **approuvés**, dont une des catégories correspond, voient la demande apparaître **en temps réel** (Supabase Realtime) dans leur tableau de bord — avec la distance si la géolocalisation est activée.
3. Premier artisan qui clique sur "Accepter" → gagne la mission. La base de données empêche qu'un deuxième artisan accepte la même demande (mise à jour conditionnelle atomique).
4. L'artisan démarre puis termine la mission ; le client peut alors noter la prestation.

---

## Étape 1 — Créer le projet Supabase

MrBokou est une activité distincte de vos autres projets (CBK, ABEL, Mavahi...) : créez un **nouveau projet Supabase** dédié pour ne pas mélanger les données.

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Nom du projet : `mrbokou` — région proche du Togo (Europe)
3. **Settings → API** → copiez `Project URL` et la clé `anon public`

## Étape 2 — Configurer supabase-config.js

Dans `js/supabase-config.js`, remplacez :

```javascript
const SUPABASE_URL      = "https://xxxxxxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "votre-clé-anon-publique";
```

## Étape 3 — Appliquer le schéma SQL

Dashboard Supabase → **SQL Editor** → New query → collez tout `sql/schema.sql` → Run.

Cela crée les tables (`profiles`, `artisan_profiles`, `service_categories`, `requests`, `reviews`), les 6 catégories de service, les policies RLS, et les fonctions de sécurité (`get_user_role`, `admin_set_artisan_status`, triggers anti-fraude).

**Astuce** : si le SQL Editor tronque le collage (fichier long), collez-le en 2-3 blocs séparés plutôt qu'en un seul.

## Étape 4 — Créer votre compte administrateur

1. Inscrivez-vous normalement sur `/pages/inscription.html` (comme "client", avec votre propre email)
2. Dashboard Supabase → **Table Editor → profiles** → repérez votre ligne → changez `role` de `client` à `admin`
3. Reconnectez-vous : vous accédez désormais à `/pages/admin.html`

*(Le rôle admin ne peut pas être obtenu autrement — c'est une protection anti-piratage volontaire.)*

## Étape 5 — Déployer

Comme vos autres projets, sur [vercel.com](https://vercel.com) :
1. **Add New → Project** → importez ce dossier `mrbokou/` (via GitHub, ou glissez-le si vous utilisez Netlify Drop)
2. Aucune commande de build à définir (site statique)
3. Déployez → votre URL publique est prête

Pour toute mise à jour ultérieure : repoussez le dossier modifié (ou repush sur GitHub si connecté).

---

## Résumé des fonctionnalités du MVP

| # | Fonctionnalité                                          | Statut |
|---|-----------------------------------------------------------|--------|
| 1 | Inscription client / artisan avec choix des domaines      | ✅     |
| 2 | Création de demande géolocalisée                           | ✅     |
| 3 | Matching temps réel type Uber (Realtime)                   | ✅     |
| 4 | Acceptation atomique (premier arrivé, premier servi)        | ✅     |
| 5 | Cycle de vie mission : acceptée → en cours → terminée       | ✅     |
| 6 | Notation artisan après mission                              | ✅     |
| 7 | Validation des artisans par un admin                        | ✅     |
| 8 | Disponibilité artisan (on/off)                               | ✅     |
| 9 | RLS + triggers anti-fraude (auto-approbation, faux avis)    | ✅     |
|10 | Paiement intégré                                             | ⏳ pas encore (à ajouter avec AJV Pay plus tard) |

## Ce qui reste à décider avant de recruter plus largement

- Faut-il valider manuellement chaque artisan avant qu'il apparaisse (recommandé au démarrage pour la confiance), ou auto-approuver après vérification téléphonique par vos "apporteurs d'affaires" ?
- Le rayon de matching est actuellement illimité (tous les artisans de la catégorie voient la demande, triés par distance affichée) — un filtre par rayon (ex. 15 km) pourra être ajouté une fois qu'il y aura plusieurs dizaines d'artisans par ville.
