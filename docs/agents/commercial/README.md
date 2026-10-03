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
