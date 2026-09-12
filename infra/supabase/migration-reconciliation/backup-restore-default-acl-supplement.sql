-- Archive-bound application default-ACL supplement for one disposable restore.
-- This is not a provider-role bootstrap and must never run against hosted data.
\set ON_ERROR_STOP on
BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'pathways_phase4_backup_restore'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR current_user <> 'postgres'
     OR session_user <> 'postgres'
     OR to_regrole('prisma') IS NULL
     OR EXISTS (
       SELECT 1 FROM pg_default_acl WHERE defaclrole = 'prisma'::regrole
     ) THEN
    RAISE EXCEPTION 'Default-ACL supplement target refused';
  END IF;
END
$guard$;

ALTER DEFAULT PRIVILEGES FOR ROLE prisma REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE prisma REVOKE USAGE ON TYPES FROM PUBLIC;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM pg_default_acl WHERE defaclrole = 'prisma'::regrole) <> 2
     OR EXISTS (
       SELECT 1
       FROM pg_default_acl
       WHERE defaclrole = 'prisma'::regrole
         AND (defaclnamespace <> 0 OR defaclobjtype NOT IN ('f', 'T'))
     )
     OR EXISTS (
       SELECT 1
       FROM pg_default_acl default_acl
       CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) privilege
       WHERE default_acl.defaclrole = 'prisma'::regrole
         AND (
           privilege.grantee <> 'prisma'::regrole
           OR privilege.grantor <> 'prisma'::regrole
           OR privilege.is_grantable
           OR (default_acl.defaclobjtype = 'f' AND privilege.privilege_type <> 'EXECUTE')
           OR (default_acl.defaclobjtype = 'T' AND privilege.privilege_type <> 'USAGE')
         )
     )
     OR (
       SELECT count(*)
       FROM pg_default_acl default_acl
       CROSS JOIN LATERAL aclexplode(default_acl.defaclacl)
       WHERE default_acl.defaclrole = 'prisma'::regrole
     ) <> 2 THEN
    RAISE EXCEPTION 'Default-ACL supplement verification failed';
  END IF;
END
$verify$;

COMMIT;
