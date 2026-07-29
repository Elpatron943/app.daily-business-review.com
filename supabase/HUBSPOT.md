# Intégrations CRM (HubSpot, Salesforce…)

Chaque **organisation cliente** connecte **son** CRM depuis **Settings → CRM**.  
Org A peut être sur HubSpot, org B sur Salesforce — isolation via `organization_id`.

## Secrets plateforme vs connexion client

| Emplacement | Contenu | Qui le configure |
|-------------|---------|------------------|
| **Netlify / `.env` serveur** | Client ID + Secret de **l’app OAuth DBR** (HubSpot Developer App, plus tard Salesforce Connected App) | L’équipe produit DBR (une fois) |
| **Table `crm_connections`** | Tokens OAuth du **portail / org CRM du client** après « Connecter » | Automatique à l’OAuth |
| **Settings → CRM (UI)** | Boutons Connecter / Sync / Déconnecter | Admin de l’organisation cliente |

Le client **ne colle jamais** de clé API dans un fichier `.env`. Il autorise DBR via OAuth, comme Slack ou Notion.

## HubSpot — créer l’app plateforme (une fois)

1. [HubSpot Developer](https://developers.hubspot.com/) → Create app (privée)
2. Redirect URLs :
   - Local : `http://localhost:5173/api/hubspot/oauth/callback`
   - Prod : `https://app.daily-business-review.com/api/hubspot/oauth/callback`
3. Scopes CRM read/write : companies, contacts, deals + `oauth`
4. Copier Client ID / Secret dans l’env **serveur** (pas le navigateur)

```env
# Secrets plateforme (Netlify / .env.local) — PAS saisis par le client
HUBSPOT_CLIENT_ID=
HUBSPOT_CLIENT_SECRET=
HUBSPOT_TOKEN_SECRET=   # aléatoire long, chiffrement tokens en base
HUBSPOT_REDIRECT_URI=http://localhost:5173/api/hubspot/oauth/callback
```

Aussi : `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Migrations SQL

Ordre recommandé :

1. `20260727220000_dbr_domain.sql`
2. `20260727223000_commercial_plans.sql` (si besoin)
3. `20260728170000_drop_profiles_manager_id.sql` (si besoin)
4. `20260728200000_hubspot_connector.sql` (colonnes hubspot_* + curseurs)
5. `20260728210000_crm_connections.sql` (**multi-provider** `crm_connections`)

## Endpoints HubSpot

| Route | Auth | Rôle |
|-------|------|------|
| `GET /api/hubspot/oauth/start` | Bearer admin | `{ url }` authorize |
| `GET /api/hubspot/oauth/callback` | state OAuth | Tokens → `crm_connections` |
| `GET /api/hubspot/status` | Bearer admin | Statut sans secrets |
| `POST /api/hubspot/disconnect` | Bearer admin | Déconnecte |
| `POST /api/hubspot/sync/pull` | Bearer admin | HS → DBR |
| `POST /api/hubspot/sync/push` | Bearer admin | Dirty DBR → HS |
| `GET /api/hubspot/mapping` | Bearer admin | Mapping org + phases DBR |
| `PUT /api/hubspot/mapping` | Bearer admin | Sauve mapping org |
| `GET /api/hubspot/schema` | Bearer admin | Propriétés + stages HS |
| `POST /api/hubspot/webhook` | Signature HS | Ingest |

## Mapping admin (CRM → DBR)

Dans **Settings → CRM**, l’admin configure :

1. **Champs** : prénom, nom, entreprise, montant, dates, stages, propriétés owner
2. **Gestionnaires** : chaque owner HubSpot → un utilisateur de l’équipe DBR (suggestion auto par e-mail)
3. **Stages** → phases DBR

Puis **Synchroniser (pull)** importe les données selon ce mapping.

## Salesforce (prévu)

Même modèle : secrets Connected App en env plateforme + ligne `crm_connections` avec `provider = salesforce` + UI Settings. Placeholder déjà visible dans Settings → CRM.

## Code

- Table : `public.crm_connections` (`organization_id`, `provider`)
- Serveur HubSpot : `scripts/hubspot/`
- UI : Settings → onglet **CRM** (`CrmIntegrationsPanel`)
