DELETE FROM public.account_invitations
 WHERE token_hash IN (
   encode(sha256('faseA_token_new'::bytea),'hex'),
   encode(sha256('faseA_token_existing'::bytea),'hex'),
   encode(sha256('faseA_token_accept'::bytea),'hex')
 );

ALTER TABLE public.platform_audit_logs DISABLE TRIGGER platform_audit_logs_append_only;
ALTER TABLE public.platform_audit_logs DISABLE TRIGGER trg_platform_audit_no_delete;
ALTER TABLE public.platform_audit_logs DISABLE TRIGGER trg_platform_audit_no_update;
DELETE FROM public.platform_audit_logs
 WHERE id IN (
   'cdda9f28-84d2-4b6b-8b94-b841671e23c2'::uuid,
   '5df7f475-9bdd-448f-9d18-0f27a0c2ffe5'::uuid
 );
ALTER TABLE public.platform_audit_logs ENABLE TRIGGER platform_audit_logs_append_only;
ALTER TABLE public.platform_audit_logs ENABLE TRIGGER trg_platform_audit_no_delete;
ALTER TABLE public.platform_audit_logs ENABLE TRIGGER trg_platform_audit_no_update;
