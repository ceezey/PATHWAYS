-- Read-only first-provision/containment evidence. Never return password material.
BEGIN READ ONLY;
SELECT jsonb_build_object(
  'database',current_database(),'current_user',current_user,'session_user',session_user,
  'read_only',current_setting('transaction_read_only'),
  'admin_can_signal_runtime',pg_has_role(current_user,'pg_signal_backend','USAGE'),
  'runtime_exists',EXISTS(SELECT FROM pg_roles WHERE rolname='pathways_runtime'),
  'runtime_login',(SELECT rolcanlogin FROM pg_roles WHERE rolname='pathways_runtime'),
  'password_absent',(SELECT rolpassword IS NULL FROM pg_authid WHERE rolname='pathways_runtime'),
  'role_settings_absent',NOT EXISTS(SELECT FROM pg_db_role_setting s JOIN pg_roles r
    ON r.oid=s.setrole WHERE r.rolname='pathways_runtime'),
  'runtime_sessions',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'pid',pid,'backend_start',backend_start::text,'database',datname,'role',usename,
    'application_name',CASE WHEN application_name ~ '^p4r_[a-f0-9]{32}$'
      THEN application_name ELSE '<unattributed>' END
  ) ORDER BY pid) FROM pg_stat_activity WHERE usename='pathways_runtime'),'[]'::jsonb)
) AS recovery_role_state;
COMMIT;
