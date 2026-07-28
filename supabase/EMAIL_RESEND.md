# E-mails Auth via Resend (SMTP)

Les e-mails Supabase Auth (invite, reset mot de passe, confirmation) passent par **Resend** en SMTP custom.

Réf. : [Resend × Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)

## Prérequis

1. Compte [Resend](https://resend.com) + clé API (`re_…`)
2. Domaine `daily-business-review.com` **vérifié** dans Resend (DNS SPF / DKIM)
3. Projet Supabase DBR

## Configuration Supabase (une fois)

1. Ouvre le projet → **Authentication** → **Email** (Notifications) → **SMTP Settings**
2. Active **Enable custom SMTP**
3. Remplis :

| Champ | Valeur |
|-------|--------|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | ta clé API Resend (`re_…`) |
| Sender email | `noreply@daily-business-review.com` |
| Sender name | `Daily Business Review` |

4. **Save**
5. **Authentication → Rate Limits** : remonte la limite d’e-mails / heure (défaut ~30 après activation SMTP)

## Variables locales (référence)

Dans `.env.local` (non commitées) :

```env
RESEND_API_KEY=re_…
RESEND_FROM_EMAIL=noreply@daily-business-review.com
RESEND_FROM_NAME=Daily Business Review
```

Ces variables documentent l’expéditeur ; **l’envoi Auth** est piloté par le SMTP du dashboard Supabase (pas par le front Vite).

## Vérification

1. Écran de connexion DBR → **Mot de passe oublié**
2. L’e-mail apparaît dans le [dashboard Resend](https://resend.com/emails)
3. Le lien ouvre l’app → écran **Nouveau mot de passe** → enregistrement via `updateUser`

### Redirect URLs (Auth → URL Configuration)

Ajoute au minimum :

- Site URL : `http://localhost:5173` (dev) ou ton domaine prod
- Redirect URLs : `http://localhost:5173/**` et l’URL de prod

## Invitation d’utilisateurs (admin DBR)

Les admins invitent depuis **Équipe → Ajouter un utilisateur**.

- Local : proxy Vite `/api/invite-user` (nécessite `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local`)
- Prod : Netlify function `invite-user` (même variable d’environnement Netlify)

L’invitation part via Supabase Auth → SMTP Resend.

Les e-mails transactionnels envoyés via l’API Resend (scripts) utilisent le logo
`src/assets/logos/logo.png` (fallback `public/logos/logo.png`) en image inline (CID).

```bash
npx tsx scripts/email/sendTest.ts viraphong@daily-business-review.com
```

Pour les templates Auth Supabase (SMTP), ajoute le logo via une URL publique
hébergée, ou copie le HTML de `scripts/email/brandedEmail.ts` dans
**Authentication → Email → Templates** (sans CID SMTP natif).
