INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::public.app_role FROM auth.users WHERE email = 'futurelouis52@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;