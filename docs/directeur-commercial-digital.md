# Directeur commercial digital — spécification

3 oct. 2026 · @Tony

## Objectif et principes

Le directeur commercial digital fait ce que fait un bon directeur commercial en revue de deal : il trouve pourquoi une opportunité bloque et oblige le commercial à le voir lui-même, par des questions. Il ne remplit pas la carte à sa place et ne donne pas de note sans preuve.

### Deux moteurs

| Moteur | Rôle |
|--------|------|
| **Code diagnostique** | Règles déterministes → constats datés et justifiés. Même opp → même diagnostic. |
| **IA challenge** | Reçoit le diagnostic comme seule vérité ; pose 2–3 questions ouvertes, relance si flou. |

### Interdits

- affirmer un fait absent des données / réponses ;
- modifier l’opportunité sans validation ;
- noter ou classer un commercial ;
- envoyer quoi que ce soit au client / tiers.

## Étapes livrées

1. **Code** — [`src/opportunities/dealDiagnosis.ts`](../src/opportunities/dealDiagnosis.ts) + tests (`npm test`)
2. **UI sans IA** — [`src/DealBlockersPanel.tsx`](../src/DealBlockersPanel.tsx) (fiche + onglet Revue)
3. **Serveur** — [`netlify/functions/deal-review.ts`](../netlify/functions/deal-review.ts) + proxy Vite [`scripts/dealReviewProxy.ts`](../scripts/dealReviewProxy.ts) — reload opp côté serveur, clé `OPENAI_API_KEY`
4. **Revue conversationnelle** — [`src/DealReviewPanel.tsx`](../src/DealReviewPanel.tsx) + boutons « Appliquer »
5. **Mémoire** — migration [`supabase/migrations/20261003140000_deal_reviews.sql`](../supabase/migrations/20261003140000_deal_reviews.sql) (`previous_answers`)

## Agents sectoriels

Personas IA par secteur : [`docs/agents/commercial/`](./agents/commercial/).

## Grille (rappel)

| Code | Famille | Sévérité typique |
|------|---------|------------------|
| C1–C6 | Comité d’achat | bloquant / risque / vigilance |
| P1–P3 | Process | bloquant / risque |
| U1–U3 | Urgence et valeur | bloquant / risque |
| T1–T3 | Calendrier | bloquant / risque / vigilance |
| A1–A2 | Plan d’action | risque / vigilance |
| M1–M3 | Cartographie | risque / vigilance |

Le score deal (`computeDealScore`) reste le résumé chiffré ; la grille explique pourquoi il est bas.

## Réglage comité (prévu Settings)

Indiquer quel `contactType` = acheteur économique / champion / décideur technique.  
Sans cela, les règles C* utilisent les ids d’usine `EconomicBuyer` et `Champion`.
