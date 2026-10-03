-- Libellés + features produits DBR Sales / DBR Pilotage (codes SQL inchangés).
update public.commercial_plans
set
  name = 'DBR Sales (essai)',
  tagline = 'Essayer DBR Sales gratuitement',
  description = 'Même périmètre que DBR Sales — 1 opportunité, 3 jours.',
  features = '["product.sales","nav.saisie","nav.settings","1 utilisateur","1 opportunité","3 jours"]'::jsonb,
  max_seats = 1,
  max_active_opportunities = 1,
  updated_at = now()
where code = 'freemium';

update public.commercial_plans
set
  name = 'DBR Sales',
  tagline = 'Exécution deal pour le commercial',
  description = 'Saisie, settings et méthode deal — 1 utilisateur, jusqu’à 20 opportunités.',
  features = '["product.sales","nav.saisie","nav.settings","1 utilisateur","20 opportunités"]'::jsonb,
  max_seats = 1,
  max_active_opportunities = 20,
  updated_at = now()
where code = 'sales_solo';

update public.commercial_plans
set
  name = 'DBR Pilotage',
  tagline = 'Cockpit direction commerciale',
  description = 'Équipe, vue, pilotage, process, mapping et plan d’actions — illimité.',
  features = '["product.pilotage","nav.view","nav.saisie","nav.pilotage","nav.settings","opp.process","opp.mapping","opp.action_plan","team.invite"]'::jsonb,
  updated_at = now()
where code = 'enterprise';
