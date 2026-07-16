
-- RLS on account_invitations
GRANT SELECT ON public.account_invitations TO authenticated;
GRANT ALL ON public.account_invitations TO service_role;
ALTER TABLE public.account_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members can view invites" ON public.account_invitations;
CREATE POLICY "members can view invites"
  ON public.account_invitations FOR SELECT
  TO authenticated
  USING (public.has_store_capability(auth.uid(), store_id, 'members.view'));

-- store_memberships extra policies
DROP POLICY IF EXISTS "members can view memberships" ON public.store_memberships;
CREATE POLICY "members can view memberships"
  ON public.store_memberships FOR SELECT
  TO authenticated
  USING (public.has_store_capability(auth.uid(), store_id, 'members.view'));

-- Trigger updated_at on store_memberships
DROP TRIGGER IF EXISTS trg_store_memberships_updated_at ON public.store_memberships;
CREATE TRIGGER trg_store_memberships_updated_at
  BEFORE UPDATE ON public.store_memberships
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- create_store_invite
CREATE OR REPLACE FUNCTION public.create_store_invite(
  _store_id uuid,
  _email citext,
  _role public.membership_role,
  _token_hash text,
  _expires_at timestamptz
) RETURNS public.account_invitations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.account_invitations;
BEGIN
  IF NOT public.has_store_capability(auth.uid(), _store_id, 'members.invite') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _role = 'owner' THEN
    RAISE EXCEPTION 'cannot_invite_owner' USING ERRCODE='22023';
  END IF;
  IF _email IS NULL OR length(trim(_email::text)) = 0 THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE='22023';
  END IF;

  -- cancel any existing pending invite for same email/store
  UPDATE public.account_invitations
     SET status='cancelled'
   WHERE store_id=_store_id AND email=_email AND status='pending';

  INSERT INTO public.account_invitations(store_id, email, role, invited_by, token_hash, status, expires_at)
  VALUES (_store_id, _email, _role, auth.uid(), _token_hash, 'pending', _expires_at)
  RETURNING * INTO v_row;

  INSERT INTO public.audit_logs(store_id, actor_id, action, entity, entity_id, payload)
  VALUES (_store_id, auth.uid(), 'member.invite', 'invitation', v_row.id::text,
          jsonb_build_object('email', _email::text, 'role', _role::text));

  RETURN v_row;
END;
$$;

-- cancel_store_invite
CREATE OR REPLACE FUNCTION public.cancel_store_invite(_invite_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.account_invitations;
BEGIN
  SELECT * INTO v_row FROM public.account_invitations WHERE id=_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='22023'; END IF;
  IF NOT public.has_store_capability(auth.uid(), v_row.store_id, 'members.invite') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF v_row.status <> 'pending' THEN RETURN; END IF;
  UPDATE public.account_invitations SET status='cancelled' WHERE id=_invite_id;
  INSERT INTO public.audit_logs(store_id, actor_id, action, entity, entity_id, payload)
  VALUES (v_row.store_id, auth.uid(), 'member.invite_cancel', 'invitation', _invite_id::text, '{}'::jsonb);
END;$$;

-- accept_store_invite
CREATE OR REPLACE FUNCTION public.accept_store_invite(_token_hash text, _email citext)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv public.account_invitations;
  v_membership_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_inv FROM public.account_invitations
   WHERE token_hash=_token_hash AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found' USING ERRCODE='22023'; END IF;
  IF v_inv.expires_at < now() THEN
    UPDATE public.account_invitations SET status='expired' WHERE id=v_inv.id;
    RAISE EXCEPTION 'invite_expired' USING ERRCODE='22023';
  END IF;
  IF v_inv.email <> _email THEN
    RAISE EXCEPTION 'email_mismatch' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.store_memberships(user_id, store_id, role, status, invited_by, invited_at, accepted_at)
  VALUES (auth.uid(), v_inv.store_id, v_inv.role, 'active', v_inv.invited_by, v_inv.created_at, now())
  ON CONFLICT (user_id, store_id) DO UPDATE
    SET role=EXCLUDED.role, status='active', accepted_at=now(), suspended_at=NULL, removed_at=NULL, updated_at=now()
  RETURNING id INTO v_membership_id;

  UPDATE public.account_invitations SET status='accepted', accepted_at=now() WHERE id=v_inv.id;

  INSERT INTO public.audit_logs(store_id, actor_id, action, entity, entity_id, payload)
  VALUES (v_inv.store_id, auth.uid(), 'member.accept', 'membership', v_membership_id::text,
          jsonb_build_object('invitation_id', v_inv.id::text, 'role', v_inv.role::text));

  RETURN v_membership_id;
END;$$;

-- change_member_role
CREATE OR REPLACE FUNCTION public.change_member_role(_membership_id uuid, _role public.membership_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.store_memberships;
BEGIN
  SELECT * INTO v_row FROM public.store_memberships WHERE id=_membership_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='22023'; END IF;
  IF NOT public.has_store_capability(auth.uid(), v_row.store_id, 'members.change_role') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF v_row.role = 'owner' OR _role = 'owner' THEN
    RAISE EXCEPTION 'cannot_change_owner' USING ERRCODE='22023';
  END IF;
  UPDATE public.store_memberships SET role=_role, updated_at=now() WHERE id=_membership_id;
  INSERT INTO public.audit_logs(store_id, actor_id, action, entity, entity_id, payload)
  VALUES (v_row.store_id, auth.uid(), 'member.change_role', 'membership', _membership_id::text,
          jsonb_build_object('from', v_row.role::text, 'to', _role::text));
END;$$;

-- suspend_member / reactivate_member / remove_member
CREATE OR REPLACE FUNCTION public.suspend_member(_membership_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.store_memberships;
BEGIN
  SELECT * INTO v_row FROM public.store_memberships WHERE id=_membership_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='22023'; END IF;
  IF NOT public.has_store_capability(auth.uid(), v_row.store_id, 'members.suspend') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF v_row.role='owner' THEN RAISE EXCEPTION 'cannot_suspend_owner' USING ERRCODE='22023'; END IF;
  UPDATE public.store_memberships SET status='suspended', suspended_at=now() WHERE id=_membership_id;
  INSERT INTO public.audit_logs(store_id, actor_id, action, entity, entity_id, payload)
  VALUES (v_row.store_id, auth.uid(), 'member.suspend', 'membership', _membership_id::text, '{}'::jsonb);
END;$$;

CREATE OR REPLACE FUNCTION public.reactivate_member(_membership_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.store_memberships;
BEGIN
  SELECT * INTO v_row FROM public.store_memberships WHERE id=_membership_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='22023'; END IF;
  IF NOT public.has_store_capability(auth.uid(), v_row.store_id, 'members.suspend') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.store_memberships SET status='active', suspended_at=NULL, removed_at=NULL WHERE id=_membership_id;
  INSERT INTO public.audit_logs(store_id, actor_id, action, entity, entity_id, payload)
  VALUES (v_row.store_id, auth.uid(), 'member.reactivate', 'membership', _membership_id::text, '{}'::jsonb);
END;$$;

CREATE OR REPLACE FUNCTION public.remove_member(_membership_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.store_memberships;
BEGIN
  SELECT * INTO v_row FROM public.store_memberships WHERE id=_membership_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='22023'; END IF;
  IF NOT public.has_store_capability(auth.uid(), v_row.store_id, 'members.remove') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF v_row.role='owner' THEN RAISE EXCEPTION 'cannot_remove_owner' USING ERRCODE='22023'; END IF;
  UPDATE public.store_memberships SET status='removed', removed_at=now() WHERE id=_membership_id;
  INSERT INTO public.audit_logs(store_id, actor_id, action, entity, entity_id, payload)
  VALUES (v_row.store_id, auth.uid(), 'member.remove', 'membership', _membership_id::text, '{}'::jsonb);
END;$$;

REVOKE ALL ON FUNCTION public.create_store_invite(uuid, citext, public.membership_role, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_store_invite(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.accept_store_invite(text, citext) FROM anon;
REVOKE ALL ON FUNCTION public.change_member_role(uuid, public.membership_role) FROM anon;
REVOKE ALL ON FUNCTION public.suspend_member(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reactivate_member(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.remove_member(uuid) FROM anon;
