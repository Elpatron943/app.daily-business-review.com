# Agents commerciaux digitaux — par sous-secteur

Personas de coaching pour le **directeur commercial digital**.
Le diagnostic code (`dealDiagnosis.ts`) reste commun ; **chaque sous-secteur a son agent complet** (prénom + avatar + posture).
La famille (Tech / SaaS, Industrie…) ne sert qu’au regroupement UI.

Source runtime : `src/opportunities/dealReviewSectors.ts` (ces fichiers MD sont le miroir doc).

| Fichier | Famille | Prénom | Agent |
|---------|---------|--------|-------|
| [industrie-manufacturing/auto-aeronautique.md](./industrie-manufacturing/auto-aeronautique.md) | Industrie / Manufacturing | Marc | Auto / Aéronautique |
| [industrie-manufacturing/process-chimie.md](./industrie-manufacturing/process-chimie.md) | Industrie / Manufacturing | Léa | Process / Chimie |
| [industrie-manufacturing/agroalimentaire.md](./industrie-manufacturing/agroalimentaire.md) | Industrie / Manufacturing | Julien | Agroalimentaire |
| [industrie-manufacturing/machining-equipements.md](./industrie-manufacturing/machining-equipements.md) | Industrie / Manufacturing | Nadia | Équipements / Machines |
| [saas-tech/crm-sales-revops.md](./saas-tech/crm-sales-revops.md) | Tech / SaaS | Camille | CRM / Sales / RevOps |
| [saas-tech/martech.md](./saas-tech/martech.md) | Tech / SaaS | Inès | Marketing / MarTech |
| [saas-tech/hr-people.md](./saas-tech/hr-people.md) | Tech / SaaS | Thomas | RH / People / Talent |
| [saas-tech/finance-finops.md](./saas-tech/finance-finops.md) | Tech / SaaS | Sophie | Finance / FinOps / Billing |
| [saas-tech/cyber-iam.md](./saas-tech/cyber-iam.md) | Tech / SaaS | Karim | Cybersécurité / IAM |
| [saas-tech/data-analytics.md](./saas-tech/data-analytics.md) | Tech / SaaS | Clara | Data / Analytics / BI |
| [saas-tech/collab-productivity.md](./saas-tech/collab-productivity.md) | Tech / SaaS | Antoine | Collaboration / Productivité |
| [saas-tech/devtools-infra.md](./saas-tech/devtools-infra.md) | Tech / SaaS | Hugo | DevTools / Infra / Cloud |
| [saas-tech/customer-support.md](./saas-tech/customer-support.md) | Tech / SaaS | Emma | Support / Customer Success |
| [saas-tech/vertical-saas.md](./saas-tech/vertical-saas.md) | Tech / SaaS | Chloé | SaaS vertical (métier) |
| [saas-tech/ai-ml-platform.md](./saas-tech/ai-ml-platform.md) | Tech / SaaS | Noah | IA / ML / Plateforme |
| [services-professionnels/conseil-strategie.md](./services-professionnels/conseil-strategie.md) | Services professionnels | Pauline | Conseil / Stratégie |
| [services-professionnels/integration-si.md](./services-professionnels/integration-si.md) | Services professionnels | Maxime | Intégration SI / ESN |
| [services-professionnels/audit-risk.md](./services-professionnels/audit-risk.md) | Services professionnels | Élodie | Audit / Risk / Compliance |
| [banque-assurance/banque-retail-corp.md](./banque-assurance/banque-retail-corp.md) | Banque / Assurance | Alexandre | Banque retail / corporate |
| [banque-assurance/assurance.md](./banque-assurance/assurance.md) | Banque / Assurance | Manon | Assurance |
| [banque-assurance/asset-management.md](./banque-assurance/asset-management.md) | Banque / Assurance | Vincent | Asset management |
| [sante-pharma/etablissement-sante.md](./sante-pharma/etablissement-sante.md) | Santé / Pharma | Isabelle | Établissement de santé / GHT |
| [sante-pharma/pharma-labs.md](./sante-pharma/pharma-labs.md) | Santé / Pharma | Romain | Pharma / Labs |
| [sante-pharma/medtech.md](./sante-pharma/medtech.md) | Santé / Pharma | Laura | Medtech / Devices |
| [retail-distribution/enseigne-magasin.md](./retail-distribution/enseigne-magasin.md) | Retail / Distribution | David | Enseigne / Magasin |
| [retail-distribution/ecommerce.md](./retail-distribution/ecommerce.md) | Retail / Distribution | Sarah | E-commerce / Marketplace |
| [retail-distribution/wholesale-logistique.md](./retail-distribution/wholesale-logistique.md) | Retail / Distribution | Nicolas | Wholesale / Logistique |
| [energie-utilities/producteur-reseau.md](./energie-utilities/producteur-reseau.md) | Énergie / Utilities | Philippe | Producteur / Réseau |
| [energie-utilities/utilities-services.md](./energie-utilities/utilities-services.md) | Énergie / Utilities | Amélie | Utilities / Services énergétiques |
| [secteur-public/etat-operateurs.md](./secteur-public/etat-operateurs.md) | Secteur public | Olivier | État / Opérateurs |
| [secteur-public/collectivites.md](./secteur-public/collectivites.md) | Secteur public | Céline | Collectivités |

## Usage prévu

Injecter l’agent du sous-secteur choisi en complément du prompt système générique, sans jamais inventer de faits hors `<diagnostic>`.

## Modèles sectoriels : entraînement à boutons et analyse (oct. 2026)

Architecture : **patterns communs à tous les secteurs** (`src/opportunities/meetingPatterns.ts` : problème, décideurs, budget, mode d'achat, cas concret, utilisateurs, critère de succès, exigences, clauses, signataire, date de décision…) **ajustés par des variables sectorielles** (`src/opportunities/sectorModels.ts` : qui peut dire non, quel budget, quelle procédure d'achat, quelle revue, quelles données, quel circuit de signature). Le profil vendeur (éditeur SaaS, ESN, conseil, fabricant, services récurrents) ajoute son objection ; la couche « grands groupes » ajoute ses étapes si le client est une filiale.

- **S'entraîner** (onglet du chatbot, Sales et Pilotage) : tout se fait par boutons. Le commercial choisit ce qu'il vend, le secteur de son client, l'organisation (entité seule ou filiale) et le rendez-vous (R1 à R4). À chaque étape, trois réponses : une bonne question, un argument, une question vague. Seule la bonne question révèle le signal de risque tiré pour la partie. Débrief : questions posées et oubliées, signaux repérés et manqués, prochaine étape à obtenir dans le vrai deal. Moteur déterministe (graine) : pas d'appel IA, rien n'est écrit dans la fiche.
- **Revue du deal** (Pilotage) : le prompt IA reçoit en plus les variables du secteur client (comité, veto, procédure, revue, règles sourcées).

Pour ajouter un secteur : renseigner ses variables dans `sectorModels.ts` (les tests vérifient qu'aucune n'est vide). Pour ajouter un moment de rendez-vous commun à tous : un pattern dans `meetingPatterns.ts`.

### Packs métier (couche 3)

`src/opportunities/metierPacks.ts` précise ce que le commercial vend exactement. Un pack ne réécrit pas le cadre commun : il reformule certains moments (`variants`, par id de pattern), ajoute ses questions propres (chacune rattachée à un des 11 facteurs de blocage), précise interlocuteurs, preuves et blocages fréquents. Des règles croisées métier × secteur client (`CROSS_RULES`) ajustent le rendez-vous là où ça change vraiment (ex. risque fournisseur vendu à une banque : registre DORA).

Premier pack : **Cybersécurité**, 7 domaines — infrastructure et réseau, identités et accès, détection et réponse (SOC), gestion du risque fournisseur, gouvernance et conformité (NIS2, ISO 27001), sécurité du cloud, sensibilisation. Pour ajouter un métier : un pack sur le même modèle ; les tests vérifient facteurs, variantes et jouabilité de toutes les combinaisons.
