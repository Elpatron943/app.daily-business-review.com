# Cahier des charges — Powermap (SaaS)

> Spécification produit **et** architecture pour Cursor.  
> Objectif : un **SaaS multi-tenant commercialisable en production**, centré sur le **pouvoir** (influence, coalitions, hiérarchie multi-entités) et la **readiness de phase** — pas un CRM d’activités, pas un prototype jetable.

**Statut cible :** GA (General Availability) — clients payants, SLA, conformité RGPD, isolation tenant testée.

---

## 0. Vision SaaS

| Dimension | Décision |
|---|---|
| Modèle | B2B SaaS subscription (mensuel / annuel) |
| Tenancy | Multi-tenant **shared DB + `organizationId` + Postgres RLS** (hybrid schema-per-tenant possible en Enterprise) |
| Go-to-market | Self-serve (trial) + sales-assisted (Enterprise) |
| Différenciateur | Couche pouvoir & readiness sur le CRM, versionnée par opportunité |
| Non-but | Remplacer Salesforce/HubSpot (activités, billing client final, forecast officiel) |

**Definition of Done produit commercial :** un prospect peut s’inscrire, payer (ou démarrer un trial), inviter son équipe, cartographier un deal multi-filiales, et un admin peut exporter / supprimer les données (RGPD) sans intervention engineering.

---

## 1. Contexte & problème

### 1.1 Constat marché

| Famille d’outils | Ce qu’ils font bien | Ce qu’ils ne font pas |
|---|---|---|
| CRM (Salesforce, HubSpot) | Compte, contacts, opportunités, activités, stages | Hiérarchie multi-filiales vivante liée au deal ; carte d’influence ; gating de phase |
| Sales enablement (Outreach, Salesloft) | Cadences, séquences | Modèle de pouvoir / comité d’achat |
| Conversation intelligence (Gong, Chorus) | Mentions, coaching | État durable du comité et scoring d’influence |
| Intent / ABM (6sense, Demandbase, Clari) | Scoring compte, forecast | Scoring **personne / relation** |
| Org chart / whiteboard (Sales Nav, Miro, Lucidchart) | Découverte ou dessin libre | Objets typés, versionnés au deal, exécutables (prérequis) |

**Écart produit :** les outils gèrent l’*activité* et le *pipeline* ; aucun ne gère nativement le *pouvoir* sur un compte multi-entités comme objet métier de premier plan.

### 1.2 Problème utilisateur

Sur un deal enterprise (multi-threading, > 6 mois, plusieurs filiales) :

1. Qui décide vraiment ? Où est le veto ?
2. Quelle filiale porte le budget vs quelle filiale subit le déploiement ?
3. Avons-nous le droit d’avancer de phase, ou le stage CRM est-il cosmétique ?
4. Quels gaps d’accès / d’influence bloquent la close ?

### 1.3 Positionnement produit

**Powermap = couche “pouvoir & readiness” sur le CRM.**

- Source de vérité sur : hiérarchie comptes, graphe d’influence, prérequis de phase.
- Lecture / sync (optionnelle) avec un CRM pour opportunités et stages.
- **Ne remplace pas** le CRM pour activités, facturation, forecast officiel.

### 1.4 Personas

| Persona | Besoin |
|---|---|
| AE (Account Executive) | Voir si le deal est “couvert”, où pousser, quoi bloquer |
| SE / Solutions | Savoir qui influence le critère technique |
| Sales Manager / CRO | Readiness réelle vs stage CRM ; gaps systémiques |
| CSM (post-vente) | Réutiliser la carte pour expansion / renew |
| Admin IT / Security | SSO, audit, export/suppression, DPA |
| Buyer économique (notre client) | ROI, sièges, conformité, intégrations |

---

## 2. Insights produit (non négociables)

1. **Le différenciateur n’est pas le CRM** — carte d’influence **versionnée par opportunité**.
2. **Hiérarchie compte = fondation** — sans parent / filiales / sites, le mapping enterprise est faux.
3. **Influence ≠ titre LinkedIn** — score composite multi-dimensions, justifié par des preuves.
4. **Buying committee = graphe** — rôles + arêtes (rapporte à, allié, bloque).
5. **Phases à prérequis** — readiness Powermap indépendante du stage CRM.
6. **Visuel d’abord, données typées ensuite** — UX canvas, objets structurés.
7. **Preuves** — chaque score / rôle peut s’appuyer sur une note, un import, une mention.
8. **KPI produit** — couverture comité, gaps d’accès, readiness phase — pas volume d’activités.
9. **SaaS-first** — isolation tenant, billing, auth, audit et RGPD sont des features produit, pas de la “dette technique plus tard”.
10. **Security by default** — jamais de tenant ID fourni par le client sans validation session ; RLS + checks applicatifs.

---

## 3. Périmètre

### 3.1 In scope — MVP Commercial (GA-ready)

**Produit métier**

- Modèle : comptes hiérarchiques, contacts, opportunités, powermap, influence, prérequis.
- Saisie manuelle + import CSV.
- Canvas relationnel (entreprises + contacts).
- Scoring d’influence + pipeline phases + readiness.
- Versions / snapshots + export PNG/SVG + JSON/CSV.

**Plateforme SaaS (obligatoire pour commercialiser)**

- Auth email/password + OAuth (Google/Microsoft) + invitations d’équipe.
- Multi-tenant (`Organization`) + RBAC (Owner, Admin, Manager, Member, Viewer).
- Billing Stripe (trial, plans, webhooks, portail client).
- Quotas par plan (sièges, opportunités actives, exports).
- Landing marketing + pricing + signup + onboarding.
- Audit log (actions sensibles).
- Pages légales : CGU, Privacy, DPA template, cookies.
- Observabilité (logs, metrics, errors), backups, staging + prod.
- RGPD : export données org, suppression compte / soft-delete + purge job.
- Sécurité : HTTPS, headers, rate limit, CSRF, secrets, RLS Postgres.

### 3.2 Out of scope (MVP Commercial)

- Remplacement CRM (activités, emails natifs).
- Enrichissement ZoomInfo / Sales Nav (interfaces stubs OK).
- Sync CRM bidirectionnelle complète (lecture HubSpot/Salesforce = V1.1).
- SSO SAML / SCIM (Enterprise = V1.1).
- Collab temps réel multi-curseurs (V2).
- Mobile natif.
- IA “remplir la carte seule” sans validation humaine.
- BYOK / VPC dédié (Enterprise+).

### 3.3 Hypothèses

- Un utilisateur appartient à ≥1 `Organization` ; le contexte actif est choisi (session).
- Une opportunité a **une carte active** + historique de versions.
- Un contact appartient à **une entité légale précise** (filiale).
- Scores / rôles **scopés à l’opportunité**.
- Devise billing : EUR (et USD en V1.1). Région données primaire : **EU (RGPD)**.

---

## 4. Offre commerciale & packaging

### 4.1 Plans

| Plan | Sièges | Opp. actives | Features | Prix indicatif |
|---|---|---|---|---|
| **Trial** | 5 | 10 | Full features, 14 jours | 0 € |
| **Team** | 10 | 50 | Core + export + audit basique | ~79 € / siège / mois |
| **Business** | 50 | Illimité soft | Templates pipeline, SSO prep, API keys | ~129 € / siège / mois |
| **Enterprise** | Custom | Custom | SAML, DPA signé, SLA, support dédié, RLS audit | Sur devis |

*Les prix sont des placeholders marketing — stockés en config Stripe Products, pas hardcodés.*

### 4.2 Entités billing

```
Organization
  ├─ stripeCustomerId
  ├─ subscription → Subscription
  │     status: trialing | active | past_due | canceled | incomplete
  │     planId, currentPeriodEnd, seatQuantity
  └─ usage counters (seats used, active opps, storage)
```

### 4.3 Parcours commercial (PF SaaS)

1. Landing → CTA “Start free trial”.
2. Signup → création User + Organization + Subscription trial.
3. Onboarding : inviter 1 collègue, créer 1 compte Groupe, importer ou seed demo.
4. Conversion : upgrade Stripe Checkout / Customer Portal.
5. Dunning : emails `past_due` ; soft-lock écriture après N jours, lecture seule.
6. Churn : cancel → rétention données X jours → purge.

---

## 5. Modèle de données

### 5.1 Plateforme (SaaS)

```
User
  id (UUID), email (unique), name, passwordHash?, emailVerifiedAt
  mfaEnabled, lastLoginAt, createdAt

Organization
  id (UUID), name, slug (unique), region (eu)
  stripeCustomerId?, settings (json), createdAt
  dataRetentionDays, deletedAt?

Membership (User ↔ Organization)
  role: Owner | Admin | Manager | Member | Viewer
  status: invited | active | suspended
  invitedBy, invitedAt, acceptedAt

Invitation
  email, organizationId, role, tokenHash, expiresAt

Subscription
  organizationId, stripeSubscriptionId, plan, status
  seatQuantity, currentPeriodEnd

ApiKey (Business+)
  organizationId, name, keyPrefix, keyHash, scopes[], lastUsedAt, revokedAt

AuditLog
  organizationId, actorUserId, action, resourceType, resourceId
  ip, userAgent, metadata (json), createdAt
  IMMUTABLE

IdempotencyKey / WebhookEvent (Stripe)
  provider, eventId unique, processedAt
```

### 5.2 Domaine métier (toujours scopé `organizationId`)

```
Account (entité légale)
  organizationId ★
  type: Holding | Entreprise
  commercialStatus: Client | Prospect | Partner | Other
  holdingId → Account (obligatoire si type = Entreprise ; null si Holding)
  hasDirection → Direction[]
  owns → Opportunity[]

CompanyRelation (lien business entre Accounts, indépendant de la holding)
  organizationId ★
  fromAccountId → Account
  toAccountId → Account
  type: PartnerOf | SupplierOf | CustomerOf | InvestorIn
  note?, strength?

Direction (département — **catalogue global org** dans Personnaliser ; pas par compte client)
  organizationId ★
  name (Finance, IT, Procurement, Sales Ops… — libre)
  active, order
  // contacts.directionId → Direction ; canvas : nœud direction sous chaque Holding concerné

Solution (catalogue produit — **personnalisable par org**)
  organizationId ★
  name, code?, active, order

ContactType (catalogue rôles — **personnalisable par org**)
  organizationId ★
  label, color, active, order
  // remplace l’enum figé EconomicBuyer | Champion | …

SoldSolution (vente rattachée — CRUD utilisateur)
  organizationId ★
  solutionId → Solution (catalogue)
  accountId → Account (obligatoire)
  directionId → Direction | null
  currency: EUR
  billedAmount          // CA facturé
  targetAmount          // montant cible (€) pour la solution dans le scope
  // dérivé :
  //   potentialAmount = targetAmount - billedAmount  ← whitespace à chasser
  status: Active | Churned | Pilot

Contact
  organizationId ★
  employedBy → Account
  directionId → Direction (obligatoire)
  contactTypeId → ContactType (personnalisable)
  memberships → BuyingCommitteeMembership[]

BuyingCommitteeMembership (opp-scoped)
  contactTypeId → ContactType (personnalisable)
  status: Unknown | Identified | Engaged | Aligned | Opposed
  influence → InfluenceScore

KPI (rollup, pas stockés — calculés)
  scope: Holding | Entreprise | Direction
  billedAmount, targetAmount, potentialAmount
  bySolution[] (triés par potentiel décroissant)

Opportunity
  name, amount, currency, closeDate, primaryAccountId, phase
  businessOutcomes → BusinessOutcomeInputs (calculateur valeur client)
  processAnswers → Record<questionId, { status: None|Yes|InProgress|No, note?, updatedAt? }>
  // Process Enterprise : domaines (Target Selected… Verbal Order) + questions
  // 1 calculateur par opportunité ; résultats dérivés (non stockés)

BusinessOutcomeInputs (valeurs par opportunité)
  Record<fieldId, number> — clés = OrgConfig.boFields[].id

BoCategoryDef / BoFieldDef (OrgConfig — Personnaliser → Business outcomes)
  Catégories standard : Réduction des coûts, risques, Croissance, Efficacité,
  Conformité, Expérience utilisateur, Paramètres de calcul
  Outcomes (€ / an, kind=annual_benefit) + investissement + horizon
  Admin peut ajouter / retirer / renommer catégories et champs

AccountPlan (1 plan actif max par Opportunité)
  opportunityId → Opportunity (obligatoire)
  holdingId → Account (type=Holding) — dérivé du compte principal de l’opp
  startDate, dueDate (échéance)
  status: Todo | Doing | Done (Kanban dashboard)
  owner?, revenueTarget?
  vision: string
  objectives[] : { id, label, status: NotStarted|InProgress|Achieved|Cancelled|Deferred }
  actions[] : { id, title, dueDate?, owner?, status: Todo|Doing|Done }
  // UI détail : onglets Vue d’ensemble | Objectifs & Actions
  // Overview : plan details, opp liée, progression, synthèse objectifs par statut
  // health dérivée : CA/cible + contacts + progression plan − white space
  // statut Weak / Fair / Strong
  // white space = solutions catalogue absentes du CA holding
  // alertes = actions dueDate < today et status ≠ Done
  // vue 360 = CA / cible / contacts / white space / couverture
  // timeline = actions ordonnées par échéance
  // health dérivée : CA/cible + contacts + progression plan − white space
  // statut Weak / Fair / Strong
  // white space = solutions catalogue absentes du CA holding
  // alertes = actions dueDate < today et status ≠ Done
  // vue 360 = CA / cible / contacts / white space / couverture
  // timeline = actions ordonnées par échéance

Account (segmentation Holding — Account Planning v2)
  sector?: string
  size?: SMB | MidMarket | Enterprise
  potential?: Low | Medium | High | Strategic

InfluenceScore (opp-scoped)
  dimensions: access, budget, veto, expertise, relationship
  total: 0–100 (pondéré)
  evidence[] → Evidence

ContactRelation (Contact → Contact — y compris cross-entreprises)
  organizationId ★
  fromContactId → Contact
  toContactId → Contact
  type: ReportsTo | AlliesWith | Blocks | Influences | Mentors | FormerColleague | Knows
  strength: 1–5
  // Pas de contrainte “même accountId” : un lien Nova ↔ Acme est valide

PipelinePhase / PhasePrerequisite / Evidence / PowerMapVersion
  (CDC cible — moteur typé hors scope prototype ; remplacé temporairement par SignalCatalog + signalChecks)
```

### 5.3 Règles métier clés

- **Toute** table métier porte `organizationId` NOT NULL + index composite `(organizationId, id)`.
- IDs publics = **UUID v7** (ou ULID) — jamais d’IDs séquentiels exposés.
- Une **Entreprise doit avoir un `holdingId`** pointant vers un Account `type=Holding` (pas d’entreprise orpheline hors groupe).
- Un Holding a `holdingId = null` ; il ne peut pas être enfant d’une entreprise.
- `commercialStatus` est saisi **au niveau Entreprise et Direction** (indépendants : une entreprise Client peut avoir une direction Prospect).
- Les **Directions** sont un **catalogue global** du compte utilisateur (Personnaliser), pas rattachées à un Holding.
- Un `Contact` **doit** avoir un `directionId` catalogue ; `employedBy` / `accountId` reste l’**entreprise** (entité légale).
- Hiérarchie contacts : relation `ReportsTo` (enfant → parent / N+1) ; **au plus un parent** par contact ; cycles interdits ; cross-entreprise autorisé.
- `ContactRelation` **autorise** des contacts d’entreprises / holdings différentes.
- `CompanyRelation` ne remplace pas la hiérarchie holding→entreprise (structure capitalistique ≠ relation business).
- Un `Contact` sans Direction n’apparaît pas sur le canvas.
- **Account health** (prototype) : score dérivé CA/cible holding + contacts + progression du plan − white space ; statut `Weak` / `Fair` / `Strong`.
- Opportunités / SignalCatalog / readiness deal : hors prototype actuel (retirés de l’UI).
- Soft-delete org → jobs de purge ; versions de carte immuables jusqu’à purge.
- Le `organizationId` actif vient **uniquement** de la session authentifiée (jamais d’header client non vérifié).

---

## 6. Données d’entrée

### 6.1 Entrées utilisateur (UI métier)

| Entrée | Description | Contraintes |
|---|---|---|
| Holding | Nom, commercialStatus, sector?, size?, potential? | type=Holding ; holdingId null ; segmentation account planning |
| Entreprise | Nom, holdingId, commercialStatus | holdingId obligatoire → Holding (lien capitalistique) |
| Direction | Nom (catalogue org) | Global au compte utilisateur ; pas de accountId |
| Solution | Nom catalogue | — |
| SoldSolution | solutionId, accountId, directionId?, CA, montant cible | directionId null = entreprise ; sinon = direction |
| KPI scope | Agrégats CA / cible / potentiel | Holding rollup = somme entreprises |
| Contact | Nom, titre, email, directionId | directionId obligatoire |
| CompanyRelation | from/to Account + type (partenaire, fournisseur…) | from ≠ to |
| ContactRelation | from/to Contact + type | from ≠ to ; cross-entreprise OK |
| Opportunité | Nom, montant, phase, compte, businessOutcomes | Calculateur BO rattaché |
| AccountPlan | Vision, objectifs, actions/jalons par Opportunité | 1 plan actif / Opp ; holding dérivé ; health dérivée |
| Membership / Phase / Evidence / Snapshot | (voir CDC métier cible) | hors prototype actuel |

### 6.2 Entrées plateforme

| Entrée | Description |
|---|---|
| Signup | email, password ou OAuth, nom org |
| Invitation | email + rôle |
| Billing | plan, sièges (Stripe Checkout) |
| Import CSV | comptes, contacts, memberships, edges |
| API Key | nom + scopes (Business+) |

### 6.3 Import CSV (exemples)

**Comptes**

```csv
external_id,name,type,holding_external_id,commercial_status,country
HOLD-ACME,Acme Holding,Holding,,Client,FR
ENT-010,Acme France,Entreprise,HOLD-ACME,Client,FR
ENT-020,Acme Germany,Entreprise,HOLD-ACME,Prospect,DE
HOLD-NOVA,Nova Group,Holding,,Other,FR
ENT-NOVA,Nova France,Entreprise,HOLD-NOVA,Other,FR
```

**Directions**

```csv
external_id,name,account_external_id,commercial_status
DIR-FR-FIN,Finance,HOLD-ACME,Client
DIR-FR-IT,IT,HOLD-ACME,Prospect
DIR-DE-TECH,Technology,HOLD-ACME,Prospect
```

**Contacts**

```csv
external_id,first_name,last_name,title,email,direction_external_id
C-1,Marie,Dupont,CFO,marie@acme.fr,DIR-FR-FIN
C-6,Julie,Renard,Enterprise AE,julie@nova.fr,DIR-NOVA-SALES
```

**Relations entreprises**

```csv
from_account_external_id,to_account_external_id,type
HOLD-ORBIT,HOLD-ACME,PartnerOf
```

**Relations contacts (cross-entreprise OK)**

```csv
from_contact_external_id,to_contact_external_id,type,strength
C-6,C-2,Knows,3
C-6,C-3,FormerColleague,4
C-2,C-1,Influences,4
```

**Memberships / Edges** — inchangés (voir versions antérieures du CDC).

### 6.4 Bootstrap JSON opportunité

```json
{
  "opportunity": {
    "name": "Acme — Platform Renewal EU",
    "amount": 480000,
    "currency": "EUR",
    "closeDate": "2026-12-15",
    "primaryAccountExternalId": "GRP-001",
    "relatedAccountExternalIds": ["FIL-010", "FIL-020"]
  },
  "pipeline": {
    "phases": [
      {
        "name": "Discovery",
        "order": 1,
        "prerequisites": [
          { "type": "RolePresent", "params": { "role": "Champion" }, "blocking": true }
        ]
      },
      {
        "name": "Solution Validation",
        "order": 2,
        "prerequisites": [
          { "type": "RolePresent", "params": { "role": "EconomicBuyer" }, "blocking": true },
          { "type": "MinInfluenceOnRole", "params": { "role": "Champion", "minTotal": 60 }, "blocking": true }
        ]
      }
    ],
    "currentPhaseOrder": 1
  }
}
```

### 6.5 Entrée minimale canvas utile

1. ≥ 1 Account parent + ≥ 1 filiale (ou 1 compte SMB).
2. ≥ 2 Contacts rattachés.
3. ≥ 1 Opportunity.
4. ≥ 2 Memberships avec rôle.
5. ≥ 1 InfluenceEdge (recommandé).

---

## 7. Données de sortie

### 7.1 Readiness Report (JSON)

```json
{
  "opportunityId": "opp_…",
  "organizationId": "org_…",
  "currentPhase": "Solution Validation",
  "readiness": {
    "status": "Blocked",
    "score": 42,
    "blockingFailures": [
      { "prerequisiteId": "pr_9", "type": "RolePresent", "message": "Economic Buyer non identifié" }
    ],
    "warnings": []
  },
  "coverage": {
    "rolesPresent": ["Champion"],
    "rolesMissing": ["EconomicBuyer", "Procurement"],
    "committeeSize": 4,
    "avgInfluence": 58
  },
  "accountHierarchy": {},
  "graph": { "nodes": [], "edges": [] }
}
```

### 7.2 Exports

| Format | Contenu | Contrôle |
|---|---|---|
| JSON / CSV | Carte + readiness | RBAC + audit |
| PNG / SVG | Canvas | RBAC + audit |
| Org data export (RGPD) | Dump structuré org | Owner/Admin only |
| Facturation | Invoices Stripe Portal | Customer Portal |

### 7.3 Sorties visuelles (MVP)

**A. Arbre entreprises** — Groupe → Filiales → Sites ; badge “touché par l’opp”.  
**B. Canvas contacts & influence** — clusters par filiale ; taille = influence ; couleur = rôle ; arêtes typées.  
**C. Vue combinée** — bandeau opp + readiness live + canvas + rail **Signaux** (checklist éditable).  
**D. Checklist signaux** — 4 familles ; obstacles cochés = adressés ; CTA corriger via coche.

### 7.4 Indicateurs dérivés

| Indicateur | Règle |
|---|---|
| `readiness.status` | Blocked / AtRisk / Ready |
| `coverage.rolesMissing` | Rôles critiques absents |
| `multiThreadingScore` | Filiales avec contact Engaged/Aligned |
| `usage.seats` / `usage.activeOpps` | Pour gating plan |

---

## 8. Parcours fonctionnels

### Métier

- **PF1** Structurer le compte (hiérarchie + contacts).
- **PF1b** Account plan Holding (vision, objectifs, actions, health).
- **PF1c** Vue 360° compte + timeline + white space + filtres segmentation.
- **PF2** Ouvrir opportunité & carte.
- **PF3** Mapper le pouvoir (rôles, scores, edges).
- **PF4** Gater la phase (readiness).
- **PF5** Review & export (snapshot, PNG, JSON).

### Plateforme

- **PF6** Signup / login / logout / reset password / verify email.
- **PF7** Inviter membres + changer rôles + révoquer.
- **PF8** Trial → paid (Stripe) + Customer Portal + dunning.
- **PF9** Switch d’organisation (si multi-org).
- **PF10** Export RGPD / delete organization (double confirmation).
- **PF11** Consulter audit log (Admin+).

---

## 9. Exigences UX / UI

- Canvas = héros ; objets typés ; readiness live.
- Desktop-first (≥1280px) ; mobile lecture seule OK.
- Surfaces marketing : landing, pricing, login, signup, legal — brand fort, pas layout “dashboard générique” sur le hero marketing.
- App : densité enterprise, légende canvas, mode présentation.
- États billing visibles : badge Trial / Past due / Read-only.
- WCAG AA sur statuts ; canvas fluide ~200 nœuds / ~400 edges.
- Sauvegarde auto (debounce) + indicateur sync.

---

## 10. Architecture technique (production)

### 10.1 Principes

1. **Defense in depth** — isolation à chaque couche (auth → app → RLS → storage → cache → jobs).
2. **Zero trust tenant** — contexte org dérivé de la session serveur uniquement.
3. **Fail closed** — quota / billing / auth en erreur = refus d’écriture.
4. **Immutable audit** pour actions sensibles.
5. **EU data residency** par défaut (région primaire `eu-west` / équivalent).

### 10.2 Diagramme logique

```
                    ┌─────────────────┐
   Browser ────────▶│ CDN + WAF       │
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
                    │ App (Next.js)   │  ← Edge/Node, SSR + Route Handlers
                    │ Auth middleware │
                    │ Tenant context  │
                    └────────┬────────┘
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
     ┌────────────┐   ┌────────────┐   ┌────────────┐
     │ PostgreSQL │   │ Redis      │   │ Object     │
     │ + RLS      │   │ cache/rate │   │ Storage    │
     └────────────┘   │ /sessions  │   │ (exports)  │
                      └────────────┘   └────────────┘
            ▲                ▲
            │         ┌──────┴──────┐
            │         │ Workers     │  (queues: import, purge, webhooks)
            │         └──────┬──────┘
            │                ▼
     ┌──────┴──────┐  ┌────────────┐  ┌────────────┐
     │ Stripe      │  │ Email      │  │ Observab.  │
     │ Billing     │  │ (Resend…)  │  │ OTel/Sentry│
     └─────────────┘  └────────────┘  └────────────┘
```

### 10.3 Stack recommandée (GA)

| Couche | Choix | Pourquoi |
|---|---|---|
| App | **Next.js** (App Router) + TypeScript | SSR, route handlers, un seul repo shippable |
| UI | Tailwind + composants locaux | Contrôle design, pas de dépendance UI SaaS générique |
| Canvas | **React Flow** | Graphes typés production-ready |
| API | Route Handlers REST versionnés `/api/v1` (+ tRPC interne optionnel) | Clarté pour API keys externes |
| Validation | **Zod** partagé | Contrats I/O stricts |
| ORM | **Prisma** ou Drizzle | Migrations ; préférer client qui compose bien avec RLS |
| DB | **PostgreSQL 16** (managed) | RLS, JSONB, fiabilité |
| Cache / rate limit | **Redis** (managed) | Sessions optionnelles, rate limit, queues légères |
| Queue | Redis + worker (BullMQ) ou Cloud Tasks | Imports, purge, webhooks Stripe |
| Auth | **Auth.js** (Credentials + OAuth) *ou* Clerk/WorkOS | MVP : Auth.js self-hosted EU ; Enterprise : WorkOS SAML en V1.1 |
| Billing | **Stripe** Checkout + Portal + Webhooks | Standard SaaS |
| Storage | S3-compatible EU (R2 / S3 eu) | Exports PNG/JSON chiffrés at rest |
| Email | Resend / Postmark | Transactionnel (invite, dunning, verify) |
| Hosting app | Vercel / Fly / Render / Cloud Run | Choisir **une** cible ; staging + prod séparés |
| Secrets | Provider secrets (Doppler / Infisical / cloud SM) | Jamais dans le repo |
| Observability | OpenTelemetry + Sentry + logs structurés JSON | Trace_id + org_id sur chaque log |
| CI/CD | GitHub Actions | lint, test, security scan, migrate, deploy |

### 10.4 Isolation multi-tenant (critique)

| Couche | Mesure |
|---|---|
| Identité | Session / JWT signé serveur ; claim `userId` ; memberships chargées serveur |
| Contexte | `activeOrganizationId` stocké serveur (cookie httpOnly signé) après vérif membership |
| App | Middleware : refuse si pas membre actif ; RBAC sur chaque mutation |
| DB | Colonne `organizationId` + **Postgres RLS** policies `current_setting('app.organization_id')` |
| Cache | Clés préfixées `org:{id}:…` |
| Storage | Préfixe `org/{organizationId}/…` ; URLs signées TTL court |
| Jobs | Payload toujours avec `organizationId` ; worker re-valide |
| Logs | Champ obligatoire `organizationId` (sauf auth pré-org) |

**Tests anti-IDOR (bloquants CI) :** deux orgs seedées ; chaque endpoint sensible tenté cross-tenant → 404/403.

### 10.5 RBAC

| Action | Owner | Admin | Manager | Member | Viewer |
|---|---|---|---|---|---|
| Billing / delete org | ✓ | | | | |
| Invites / rôles | ✓ | ✓ | | | |
| Audit log | ✓ | ✓ | | | |
| CRUD comptes / contacts | ✓ | ✓ | ✓ | ✓ | |
| CRUD opp / powermap | ✓ | ✓ | ✓ | ✓ | lecture |
| Override phase (V1.1) | ✓ | ✓ | ✓ | | |
| Export RGPD | ✓ | ✓ | | | |
| API keys | ✓ | ✓ | | | |

### 10.6 API publique minimale (`/api/v1`)

**Auth session (cookie)** + **API Key** (Business+).

```
# Platform
POST   /auth/signup | /auth/login | /auth/logout | /auth/forgot
POST   /organizations
GET    /organizations/current
POST   /organizations/invitations
PATCH  /organizations/members/:id
GET    /billing/portal
POST   /billing/checkout
POST   /webhooks/stripe          # signature Stripe obligatoire

# Domain
POST   /accounts
GET    /accounts/tree
POST   /contacts
POST   /opportunities
GET    /opportunities/:id/powermap
PUT    /opportunities/:id/powermap
POST   /opportunities/:id/memberships
POST   /opportunities/:id/edges
GET    /opportunities/:id/readiness
POST   /opportunities/:id/versions
POST   /import/csv
GET    /opportunities/:id/export.json
POST   /organizations/export     # RGPD
DELETE /organizations            # soft-delete + schedule purge
GET    /audit-logs
```

Conventions : JSON only ; erreurs `{ code, message, requestId }` ; pagination cursor ; rate limit headers.

### 10.7 Moteur readiness

Module pur, zéro I/O :

```ts
evaluateReadiness(phase, memberships, scores, flags) → {
  status, score, blockingFailures, warnings
}
```

Couvert par ≥ 10 tests unitaires + property tests sur prérequis.

---

## 11. Sécurité (baseline prod)

### 11.1 Authentification & sessions

- Mots de passe : Argon2id (ou bcrypt cost ≥ 12) ; never log passwords.
- Sessions : cookie **httpOnly**, **Secure**, **SameSite=Lax** (Strict si possible) ; rotation au login.
- Email verification obligatoire avant écriture sensible (ou dès J+1 trial).
- Reset password : token one-time, TTL court, single-use.
- Protection brute-force : rate limit IP + email sur `/login`, `/signup`, `/forgot`.
- OAuth : state/PKCE ; lier comptes par email vérifié uniquement avec consentement.
- MFA TOTP : V1.1 (obligatoire Owner en Enterprise).

### 11.2 Application & API

- Validation Zod stricte de tous les inputs.
- Autorisation **sur la ressource** (org + RBAC + ownership), pas seulement “être loggé”.
- CSRF : SameSite + origin check sur mutations cookie-based.
- CORS : whitelist domaines exacts (app + marketing) — jamais `*`.
- Security headers : HSTS, CSP stricte, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame deny.
- Upload / import CSV : taille max, virus scan optionnel V1.1, parse streaming, reject binaries.
- Pas de SSRF via URLs evidence (allowlist schemes `https`).

### 11.3 Données & chiffrement

- TLS 1.2+ partout (edge → app → DB).
- DB et object storage **encrypted at rest** (provider).
- Secrets uniquement via secret manager ; rotation documentée.
- PII (email, téléphone contact) : minimisation ; pas dans logs ; masquage support.
- Backups chiffrés ; restore testé trimestriel.
- Field-level encryption : optionnel Enterprise (email contact) — design prêt, pas bloquant MVP.

### 11.4 Stripe & webhooks

- Vérifier signature `Stripe-Signature` ; rejeter sinon.
- Idempotency sur `event.id`.
- Ne jamais faire confiance au client pour `plan` / `price` — source = Stripe Products.
- Webhook endpoint dédié, timeout court, retry-safe.

### 11.5 Ops sécurité

- Dependabot / Renovate + `npm audit` en CI (fail high/critical).
- SAST (CodeQL ou Semgrep) sur PR.
- Secrets scanning (gitleaks) pré-commit + CI.
- Pentest externe avant GA public payant (ou beta fermée documentée).
- Responsible disclosure / security@ dans le legal.
- Runbook incident : rotate keys, force logout, notify tenants si breach.

### 11.6 Checklist OWASP multi-tenant (gate release)

- [ ] Tenant context jamais pris du body/query seul.
- [ ] RLS activé + tests CI cross-tenant.
- [ ] Cache / storage / jobs préfixés org.
- [ ] Rate limit per-IP et per-org.
- [ ] Audit des actions Admin (invite, rôle, export, delete, billing).
- [ ] Offboarding : purge complète planifiée et vérifiable.

---

## 12. Infrastructure, fiabilité & conformité

### 12.1 Environnements

| Env | Rôle | Données |
|---|---|---|
| `local` | Dev | Seed / Docker Compose |
| `staging` | Préprod | Anonymisées / fictives |
| `production` | Clients | Réelles EU |

Séparation comptes cloud, secrets, Stripe (test vs live), bases.

### 12.2 SLO / SLA cibles (GA)

| Métrique | Cible |
|---|---|
| Disponibilité mensuelle | 99.5 % (Team) / 99.9 % (Enterprise) |
| Latence API p95 lecture | < 300 ms |
| RPO | ≤ 24 h (backup quotidien) ; viser 1 h PITR |
| RTO | ≤ 4 h |
| Fenêtre maintenance | Annoncée ≥ 48 h |

### 12.3 Observabilité

- Logs JSON : `timestamp, level, requestId, userId?, organizationId?, route, durationMs`.
- Metrics : req/s, error rate, queue lag, webhook failures, signup funnel.
- Alertes : error rate, Stripe webhook fail, disk/DB, auth anomaly.
- Status page publique (Instatus / Better Stack).

### 12.4 Conformité & legal (commercialisation EU)

| Élément | Exigence MVP |
|---|---|
| RGPD | Base légale, registre traitements, DPA, sous-traitants listés |
| Droits | Export org, suppression, rectification email support |
| Cookies | Bannière + consent analytics (si trackers) |
| CGU / Privacy | Publiés, versionnés |
| Hébergeur | DPA cloud signé ; région EU |
| Paiements | Stripe PCI — **ne jamais** stocker PAN |
| Mentions légales | Société éditrice, contact DPO (ou responsable) |

### 12.5 Support & admin interne

- Console **internal admin** (hors tenant) : lookup org, impersonation **avec motif + audit**, force logout — accès break-glass MFA.
- Pas d’accès DB prod “à la main” sans ticket / bastion.

---

## 13. Qualité & tests (gate GA)

| Type | Contenu |
|---|---|
| Unit | Moteur readiness, RBAC helpers, pricing/quota |
| Integration | API + DB + RLS (2 tenants) |
| E2E | Signup → invite → create map → readiness → export → checkout test mode |
| Security | Suite IDOR cross-tenant automatisée |
| Load | 100 users concurrents canvas save (smoke) |
| Chaos léger | Worker down / Redis down → fail closed gracieux |

Coverage minimal : readiness + authz + billing webhooks = **bloquant merge**.

---

## 14. Critères d’acceptation — MVP Commercial

### Métier

1. Hiérarchie Groupe → filiales visible en arbre.
2. Canvas opp clusterisé par filiale + rôles/scores/edges.
3. Readiness Blocked si prérequis blocking KO.
4. Import CSV + export JSON/PNG + snapshot restaurable.

### SaaS / sécu

5. Signup crée User + Org + trial Stripe (ou trial interne horodaté).
6. Invite membre ; RBAC empêche Viewer d’éditer.
7. Isolation : user Org A ne lit **aucune** donnée Org B (test automatisé vert).
8. Webhook Stripe met à jour subscription ; past_due → soft read-only.
9. Owner peut exporter données org et demander suppression.
10. Audit log enregistre invite, rôle, export, delete, billing events.
11. Headers sécu + rate limit auth actifs en prod.
12. Staging et prod séparés ; migrations versionnées ; backup restore prouvé une fois.
13. Pages CGU / Privacy / Pricing / Status accessibles.
14. Monitoring : erreur 5xx alerte l’équipe en < 5 min.

---

## 15. Roadmap

| Version | Contenu |
|---|---|
| **MVP Commercial (GA)** | Domaine powermap + auth + multi-tenant RLS + Stripe + audit + RGPD + landing + observabilité |
| **V1.1** | HubSpot/Salesforce lecture, SAML/SCIM (WorkOS), MFA, PDF deal review, diff versions, override manager |
| **V1.2** | API publique documentée, templates sectoriels, analytics multi-threading, permissions fines |
| **V2** | Collab temps réel, suggestions IA gaps, enrichissement, VPC/BYOK Enterprise |

---

## 16. Glossaire

| Terme | Définition |
|---|---|
| Tenant / Organization | Client SaaS isolé (entreprise acheteuse de Powermap) |
| Powermap | Carte d’influence versionnée d’une opportunité |
| Readiness | Aptitude phase N selon prérequis (≠ stage CRM) |
| RLS | Row-Level Security PostgreSQL |
| GA | General Availability — commercialisable |
| DPA | Data Processing Agreement |

---

## 17. Brief d’implémentation pour Cursor (ordre strict)

Construire **dans cet ordre** — ne pas commencer par le canvas seul.

### Phase A — Fondations SaaS (bloquant)

1. Monorepo / app Next.js + TypeScript + CI (lint, typecheck, test).
2. Docker Compose : Postgres + Redis ; migrations.
3. Schéma plateforme : User, Organization, Membership, Invitation, Subscription, AuditLog.
4. Auth (signup/login/session) + middleware tenant + RBAC.
5. **RLS Postgres** + tests cross-tenant.
6. Stripe trial/checkout/portal/webhooks + quotas.
7. Landing + signup + legal stubs + env staging/prod.

### Phase B — Domaine Powermap

8. Schéma métier (Account… Evidence) **avec `organizationId`**.
9. Moteur `evaluateReadiness` + tests.
10. API CRUD + import CSV Zod.
11. UI arbre comptes → canvas React Flow → rail readiness.
12. Snapshots + exports JSON/PNG.
13. Seed demo Acme **par org**.

### Phase C — Durcissement GA

14. Rate limit, security headers, audit sur actions sensibles.
15. Jobs : purge org, dunning emails.
16. Observabilité + status page + backup runbook.
17. Suite E2E signup→pay→map→export.
18. Pentest / checklist §11.6 verte.

**Hors scope permanent MVP :** module activités CRM, emailing commercial outbound, forecast.

**Definition of Done GA :** un inconnu peut payer (ou finir un trial), cartographier un deal multi-filiales en équipe, et l’éditeur peut opérer le service (billing, sécu, RGPD, monitoring) sans accès SSH improvisé.
