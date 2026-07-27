# Supabase — DBR

## Fichiers

| Fichier | Rôle |
|---------|------|
| `schema.sql` | Auth / `profiles` (bootstrap initial) |
| `migrations/20260727220000_dbr_domain.sql` | Tables métier + `organizations` + RLS |
| `migrations/20260727223000_commercial_plans.sql` | Formules commerciales + liaison orgs |
| `EMAIL_RESEND.md` | SMTP Resend pour les e-mails Auth |

## E-mails Auth (Resend)

Configurer le SMTP custom Resend dans le dashboard Supabase — voir **[EMAIL_RESEND.md](./EMAIL_RESEND.md)**.

## Appliquer la migration

### Option A — SQL Editor (rapide)

1. Exécuter d’abord `schema.sql` si `profiles` n’existe pas encore.
2. Exécuter ensuite tout le contenu de  
   `migrations/20260727220000_dbr_domain.sql`.

### Option B — CLI Supabase

```bash
supabase db push
```

## Tables créées

- `organizations` — tenant (équipe / forfait)
- `commercial_plans` — catalogue formules (Trial / Team / Business / Enterprise)
- `organizations.commercial_plan_id`, `seat_quantity`, `subscription_status`
- `profiles.organization_id` — rattachement user → org
- `org_configs` — catalogue OrgConfig (`jsonb`)
- `domain_ui_state` — positions carte
- `accounts`, `contacts`
- `company_relations`, `contact_relations`
- `opportunities`, `opportunity_stakeholders`
- `sold_solutions`
- `account_plans`, `account_plan_opportunities`
- `plan_objectives`, `plan_actions`

Les ids métier restent en `text` (compatibles localStorage : `hold-*`, `opp-*`, …).  
Le partage des données se fait via `organization_id` (RLS).

## Création d’utilisateurs (console admin)

Passer en `raw_user_meta_data` :

```json
{
  "full_name": "Alice Martin",
  "organization_id": "<uuid org>",
  "role": "user"
}
```
