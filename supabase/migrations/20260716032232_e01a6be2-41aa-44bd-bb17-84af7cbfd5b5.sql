-- 1) Seed da loja base (single-tenant)
INSERT INTO public.stores (id, name)
SELECT gen_random_uuid(), 'Smoke'
WHERE NOT EXISTS (SELECT 1 FROM public.stores);

-- 2) Extensão para email case-insensitive
CREATE EXTENSION IF NOT EXISTS citext;

-- 3) Allowlist de administradores
CREATE TABLE IF NOT EXISTS public.admin_allowlist (
  email citext PRIMARY KEY,
  role public.app_role NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_allowlist TO authenticated;
GRANT ALL ON public.admin_allowlist TO service_role;

ALTER TABLE public.admin_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners read allowlist" ON public.admin_allowlist;
CREATE POLICY "owners read allowlist" ON public.admin_allowlist
  FOR SELECT TO authenticated USING (public.is_owner());
-- Nenhuma política INSERT/UPDATE/DELETE → apenas service_role escreve.

-- Seed do owner atual
INSERT INTO public.admin_allowlist (email, role)
VALUES ('futurelouis52@gmail.com', 'owner')
ON CONFLICT (email) DO NOTHING;

-- 4) handle_new_user reescrita: só cria profile, NUNCA atribui role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_store_id uuid;
BEGIN
  SELECT id INTO v_store_id FROM public.stores ORDER BY created_at LIMIT 1;
  IF v_store_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, store_id, display_name)
  VALUES (
    NEW.id,
    v_store_id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 5) Trigger separada: concede role SOMENTE se o email consta na allowlist
CREATE OR REPLACE FUNCTION public.grant_role_from_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_role public.app_role;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO v_role
    FROM public.admin_allowlist
   WHERE email = NEW.email::citext;

  IF v_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Registra o trigger em auth.users (o de handle_new_user já existe; adicionamos um segundo)
DROP TRIGGER IF EXISTS on_auth_user_created_grant_role ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_role_from_allowlist();

-- 6) Retroativo: se o owner atual não tem profile (porque stores estava vazia), cria
INSERT INTO public.profiles (id, store_id, display_name)
SELECT u.id,
       (SELECT id FROM public.stores ORDER BY created_at LIMIT 1),
       COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- 7) Grants mínimos nas novas funções
REVOKE ALL ON FUNCTION public.grant_role_from_allowlist() FROM PUBLIC;
