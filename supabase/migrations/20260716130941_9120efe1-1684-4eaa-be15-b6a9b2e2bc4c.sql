
-- =====================================================================
-- SMOKE CONTROL — Fase 1: fundação de dados de autorização
-- =====================================================================

-- ---------- Enums novos ----------
CREATE TYPE public.platform_role AS ENUM ('super_admin', 'support_admin', 'security_auditor');
CREATE TYPE public.account_status AS ENUM ('active', 'suspended', 'archived');
CREATE TYPE public.store_status AS ENUM ('active', 'suspended');
CREATE TYPE public.membership_role AS ENUM ('owner', 'manager', 'seller', 'stock_operator', 'auditor');
CREATE TYPE public.membership_status AS ENUM ('invited', 'active', 'suspended', 'removed');
CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'expired', 'cancelled');

-- ---------- Colunas de status em entidades existentes ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status public.account_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS status public.store_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text;

-- =====================================================================
-- platform_admins — quem acessa /control
-- =====================================================================
CREATE TABLE public.platform_admins (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.platform_role NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Read own admin row (para o guard client-side saber onde redirecionar)
CREATE POLICY "read own platform_admin row"
  ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_platform_admins_touch
  BEFORE UPDATE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- =====================================================================
-- platform_admin_allowlist — bootstrap por email
-- =====================================================================
CREATE TABLE public.platform_admin_allowlist (
  email       citext PRIMARY KEY,
  role        public.platform_role NOT NULL DEFAULT 'super_admin',
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_admin_allowlist TO authenticated;
GRANT ALL ON public.platform_admin_allowlist TO service_role;
ALTER TABLE public.platform_admin_allowlist ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy pública: apenas service_role/security definer lê.

-- =====================================================================
-- store_memberships — quem opera cada loja
-- =====================================================================
CREATE TABLE public.store_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id      uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  role          public.membership_role NOT NULL,
  status        public.membership_status NOT NULL DEFAULT 'active',
  invited_by    uuid REFERENCES auth.users(id),
  invited_at    timestamptz,
  accepted_at   timestamptz,
  suspended_at  timestamptz,
  removed_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id)
);

CREATE INDEX store_memberships_store_idx ON public.store_memberships(store_id);
CREATE INDEX store_memberships_user_idx ON public.store_memberships(user_id);

GRANT SELECT ON public.store_memberships TO authenticated;
GRANT ALL ON public.store_memberships TO service_role;
ALTER TABLE public.store_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own memberships"
  ON public.store_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_store_memberships_touch
  BEFORE UPDATE ON public.store_memberships
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- =====================================================================
-- account_invitations — convites (só hash é persistido)
-- =====================================================================
CREATE TABLE public.account_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        citext NOT NULL,
  store_id     uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  role         public.membership_role NOT NULL,
  invited_by   uuid REFERENCES auth.users(id),
  token_hash   text NOT NULL,
  status       public.invitation_status NOT NULL DEFAULT 'pending',
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  accepted_at  timestamptz
);

CREATE INDEX account_invitations_email_idx ON public.account_invitations(email);
CREATE INDEX account_invitations_store_idx ON public.account_invitations(store_id);
CREATE UNIQUE INDEX account_invitations_token_hash_idx ON public.account_invitations(token_hash);

GRANT SELECT ON public.account_invitations TO authenticated;
GRANT ALL ON public.account_invitations TO service_role;
ALTER TABLE public.account_invitations ENABLE ROW LEVEL SECURITY;
-- Sem policy para authenticated: apenas server-side com service_role manipula.

-- =====================================================================
-- platform_audit_logs — auditoria da plataforma (append-only)
-- =====================================================================
CREATE TABLE public.platform_audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid REFERENCES auth.users(id),
  action       text NOT NULL,
  target_type  text NOT NULL,
  target_id    text,
  store_id     uuid REFERENCES public.stores(id),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_audit_logs_actor_idx ON public.platform_audit_logs(actor_id, created_at DESC);
CREATE INDEX platform_audit_logs_target_idx ON public.platform_audit_logs(target_type, target_id);
CREATE INDEX platform_audit_logs_created_idx ON public.platform_audit_logs(created_at DESC);

-- Append-only: SELECT + INSERT via service_role apenas. Nada para authenticated.
GRANT SELECT, INSERT ON public.platform_audit_logs TO service_role;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

-- Bloqueia UPDATE/DELETE mesmo para service_role via trigger defensivo
CREATE OR REPLACE FUNCTION public.tg_platform_audit_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_logs is append-only';
END;
$$;
CREATE TRIGGER trg_platform_audit_no_update
  BEFORE UPDATE ON public.platform_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_platform_audit_append_only();
CREATE TRIGGER trg_platform_audit_no_delete
  BEFORE DELETE ON public.platform_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_platform_audit_append_only();

-- =====================================================================
-- Security-definer helpers
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = _user_id AND active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.has_store_membership(_user_id uuid, _store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_memberships
    WHERE user_id = _user_id AND store_id = _store_id AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.membership_role_in(_user_id uuid, _store_id uuid)
RETURNS public.membership_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.store_memberships
  WHERE user_id = _user_id AND store_id = _store_id AND status = 'active'
  LIMIT 1
$$;

-- =====================================================================
-- Trigger: grant platform_admin on signup se estiver na allowlist
-- =====================================================================
CREATE OR REPLACE FUNCTION public.grant_platform_admin_from_allowlist()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.platform_role;
BEGIN
  IF NEW.email IS NULL THEN RETURN NEW; END IF;
  SELECT role INTO v_role
    FROM public.platform_admin_allowlist
   WHERE email = NEW.email::citext;
  IF v_role IS NOT NULL THEN
    INSERT INTO public.platform_admins (user_id, role, active)
    VALUES (NEW.id, v_role, true)
    ON CONFLICT (user_id) DO UPDATE
      SET role = EXCLUDED.role, active = true, updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_platform_admin ON auth.users;
CREATE TRIGGER trg_grant_platform_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_platform_admin_from_allowlist();

-- =====================================================================
-- Migração de dados: owners atuais -> store_memberships
-- =====================================================================
INSERT INTO public.store_memberships (user_id, store_id, role, status, accepted_at)
SELECT ur.user_id, s.id, 'owner'::public.membership_role, 'active'::public.membership_status, now()
FROM public.user_roles ur
JOIN public.stores s ON true  -- singleton
WHERE ur.role = 'owner'
ON CONFLICT (user_id, store_id) DO NOTHING;

-- =====================================================================
-- Bootstrap super_admin: aspiassessoria@gmail.com
-- =====================================================================
INSERT INTO public.platform_admin_allowlist (email, role)
VALUES ('aspiassessoria@gmail.com'::citext, 'super_admin')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;

-- Promove imediatamente se o usuário já existe
INSERT INTO public.platform_admins (user_id, role, active)
SELECT id, 'super_admin'::public.platform_role, true
FROM auth.users
WHERE email = 'aspiassessoria@gmail.com'
ON CONFLICT (user_id) DO UPDATE
  SET role = 'super_admin', active = true, updated_at = now();
