-- Align freemium quotas with marketing site (3 days, 1 opportunity)
update public.commercial_plans
set
  max_active_opportunities = 1,
  description = 'Même périmètre que Sales Solo — 1 opportunité, 3 jours.',
  tagline = 'Essayer DBR gratuitement',
  features = '["nav.saisie","nav.settings","1 utilisateur","1 opportunité","3 jours"]'::jsonb,
  updated_at = now()
where code = 'freemium';
