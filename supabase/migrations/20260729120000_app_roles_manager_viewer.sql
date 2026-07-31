-- Rôles étendus : manager (vue org + écriture), viewer (lecture seule).
-- 'user' reste le commercial (portefeuille owner).

alter type public.app_role add value if not exists 'manager';
alter type public.app_role add value if not exists 'viewer';
