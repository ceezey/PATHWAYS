-- Catalogs only. Runner supplies BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY,
-- timeouts and search_path=pg_catalog. No Auth/Storage/business rows or raw
-- function/default/policy bodies are returned. Names are filtered at reporting.
WITH relations AS (
  SELECT c.*, n.nspname
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('pathways','public') AND c.relkind IN ('r','p','v','m','S','f')
    AND c.relname <> '_prisma_migrations'
    AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid='pg_class'::regclass
                    AND d.objid=c.oid AND d.deptype='e')
), functions AS (
  SELECT p.*, n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('pathways','public')
    AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid='pg_proc'::regclass
                    AND d.objid=p.oid AND d.deptype='e')
), objects AS (
  SELECT 'relation:'||nspname||'.'||relname||':properties' AS key,
    jsonb_build_object('owner',pg_get_userbyid(relowner),'kind',relkind,
      'persistence',relpersistence,'replica_identity',relreplident,
      'options',reloptions,'partition',relispartition,
      'view',CASE WHEN relkind IN ('v','m') THEN pg_get_viewdef(oid,false) END) AS definition
  FROM relations
  UNION ALL
  SELECT 'relation:'||r.nspname||'.'||r.relname||':columns',
    coalesce((SELECT jsonb_agg(jsonb_build_object(
      'position',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
      'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
      'default',pg_get_expr(d.adbin,d.adrelid),'storage',a.attstorage,
      'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE
        format('%I.%I',cn.nspname,co.collname) END
    ) ORDER BY a.attnum) FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    LEFT JOIN pg_collation co ON co.oid=a.attcollation
    LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
    WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb)
  FROM relations r
  UNION ALL
  SELECT 'constraint:'||r.nspname||'.'||r.relname||'.'||c.conname,
    jsonb_build_object('type',c.contype,'definition',pg_get_constraintdef(c.oid,false),
      'validated',c.convalidated,'deferrable',c.condeferrable,'deferred',c.condeferred)
  FROM relations r JOIN pg_constraint c ON c.conrelid=r.oid
  -- PG18 adds catalog NOT NULL constraints; attnotnull above covers both
  -- PG17 and PG18. CHECK, FK, UNIQUE and constraint triggers are retained.
  WHERE c.contype<>'n'
  UNION ALL
  SELECT 'index:'||r.nspname||'.'||r.relname||'.'||i.relname,
    jsonb_build_object('definition',pg_get_indexdef(x.indexrelid,0,false),
      'valid',x.indisvalid,'ready',x.indisready,'unique',x.indisunique,
      'primary',x.indisprimary,'replica',x.indisreplident,
      'clustered',x.indisclustered,'options',i.reloptions)
  FROM relations r JOIN pg_index x ON x.indrelid=r.oid JOIN pg_class i ON i.oid=x.indexrelid
  UNION ALL
  SELECT 'trigger:'||r.nspname||'.'||r.relname||'.'||t.tgname,
    jsonb_build_object('definition',pg_get_triggerdef(t.oid,false),'enabled',t.tgenabled)
  FROM relations r JOIN pg_trigger t ON t.tgrelid=r.oid WHERE NOT t.tgisinternal
  UNION ALL
  SELECT 'rls:'||r.nspname||'.'||r.relname,
    jsonb_build_object('enabled',r.relrowsecurity,'forced',r.relforcerowsecurity)
  FROM relations r
  UNION ALL
  SELECT 'policy:'||r.nspname||'.'||r.relname||'.'||p.polname,
    jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive,
      'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END
        ORDER BY CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END COLLATE "C")
        FROM unnest(p.polroles) role_id),
      'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
  FROM relations r JOIN pg_policy p ON p.polrelid=r.oid
  UNION ALL
  SELECT 'table-acl:'||r.nspname||'.'||r.relname,
    (SELECT jsonb_agg(jsonb_build_array(
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
      ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",
        pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type COLLATE "C",a.is_grantable)
     FROM aclexplode(coalesce(r.relacl,acldefault(CASE WHEN r.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,r.relowner))) a)
  FROM relations r
  UNION ALL
  SELECT 'column-acl:'||r.nspname||'.'||r.relname,
    coalesce((SELECT jsonb_agg(jsonb_build_array(c.attname,
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
      ORDER BY c.attnum,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",
        pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type COLLATE "C",a.is_grantable)
     FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a
     WHERE c.attrelid=r.oid AND c.attnum>0 AND NOT c.attisdropped),'[]'::jsonb)
  FROM relations r
  UNION ALL
  SELECT 'function:'||p.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
    jsonb_build_object('definition',CASE WHEN p.prokind IN ('f','p') THEN pg_get_functiondef(p.oid) END,
      'kind',p.prokind,'owner',pg_get_userbyid(p.proowner),'language',l.lanname,
      'security_definer',p.prosecdef,'volatility',p.provolatile,'parallel',p.proparallel,
      'strict',p.proisstrict,'leakproof',p.proleakproof,'cost',p.procost,'rows',p.prorows,
      'configuration',(SELECT jsonb_agg(v ORDER BY v COLLATE "C") FROM unnest(p.proconfig) v))
  FROM functions p JOIN pg_language l ON l.oid=p.prolang
  UNION ALL
  SELECT 'function-acl:'||p.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
    (SELECT jsonb_agg(jsonb_build_array(
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
      ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",
        pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type COLLATE "C",a.is_grantable)
     FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)
  FROM functions p
  UNION ALL
  SELECT 'enum:'||n.nspname||'.'||t.typname,
    jsonb_build_object('owner',pg_get_userbyid(t.typowner),
      'labels',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),
      'acl',(SELECT jsonb_agg(jsonb_build_array(
        CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
        pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
        ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",
          pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type COLLATE "C",a.is_grantable)
        FROM aclexplode(coalesce(t.typacl,acldefault('T',t.typowner))) a))
  FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname IN ('pathways','public') AND t.typtype='e'
  UNION ALL
  SELECT 'schema:pathways',jsonb_build_object('owner',pg_get_userbyid(n.nspowner),
    'acl',(SELECT jsonb_agg(jsonb_build_array(
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
      ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",
        pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type COLLATE "C",a.is_grantable)
      FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a))
  FROM pg_namespace n WHERE n.nspname='pathways'
  UNION ALL
  SELECT 'default-acl:prisma:'||coalesce(n.nspname,'global')||':'||d.defaclobjtype::text,
    (SELECT jsonb_agg(jsonb_build_array(
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
      ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",
        pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type COLLATE "C",a.is_grantable)
      FROM aclexplode(d.defaclacl) a)
  FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
  WHERE d.defaclrole='prisma'::regrole
), fingerprints AS (
  SELECT key,encode(sha256(convert_to(coalesce(definition,'null'::jsonb)::text,'UTF8')),'hex') AS fingerprint
  FROM objects
)
SELECT jsonb_build_object(
  'version',1,
  'readOnly',current_setting('transaction_read_only')='on',
  'database',current_database(),'user',current_user,'sessionUser',session_user,
  'serverVersion',current_setting('server_version_num')::integer,
  'ledgerLocations',(SELECT jsonb_agg(n.nspname ORDER BY n.nspname COLLATE "C")
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='_prisma_migrations'),
  'otherLedger',to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
  'ledger',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name',migration_name,'checksum',checksum,'finished',finished_at IS NOT NULL,
    'rolledBack',rolled_back_at IS NOT NULL,'failureLog',coalesce(length(logs)>0,false),
    'steps',applied_steps_count) ORDER BY migration_name COLLATE "C"),'[]'::jsonb)
    FROM public._prisma_migrations),
  'targetTables',(SELECT count(*) FROM relations WHERE nspname='pathways' AND relkind='r'),
  'legacyTables',(SELECT count(*) FROM relations WHERE nspname='public' AND relkind='r'),
  'livenessAbsent',NOT EXISTS (SELECT FROM functions WHERE proname='runtime_auth_session_live'),
  'pgcryptoPresent',EXISTS (SELECT FROM pg_extension WHERE extname='pgcrypto'),
  'runtimeSafe',EXISTS (SELECT FROM pg_roles r WHERE r.rolname='pathways_runtime'
    AND NOT (r.rolsuper OR r.rolinherit OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
    AND NOT has_database_privilege(r.oid,current_database(),'CREATE')
    AND NOT has_database_privilege(r.oid,current_database(),'TEMPORARY')
    AND NOT has_schema_privilege(r.oid,'pathways','CREATE')
    AND NOT EXISTS (SELECT FROM pg_auth_members m WHERE m.member=r.oid)
    AND NOT EXISTS (SELECT FROM pg_auth_members m WHERE m.roleid=r.oid
      AND NOT (m.member='postgres'::regrole AND pg_get_userbyid(m.grantor)='supabase_admin'
        AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option))
    AND NOT EXISTS (SELECT FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass
      AND d.refobjid=r.oid AND d.deptype='o')),
  'objects',(SELECT jsonb_agg(jsonb_build_object('key',key,'fingerprint',fingerprint) ORDER BY key COLLATE "C")
    FROM fingerprints)
) AS reconciliation_inventory;
