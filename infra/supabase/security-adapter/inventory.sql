-- Phase 4 evidence only. One SELECT, one JSONB result, no resource mutation.
-- The runner must establish the approved project/connection independently and
-- execute in a READ ONLY transaction. A database name is not project identity.
-- Counts use only the fixed 39 target / 15 legacy identifier allowlist below.
-- Never add credential columns, raw ledger logs, identity_data, email addresses,
-- Storage contents, private object names, connection URLs, or role passwords.
-- Fingerprints are reproducible metadata comparisons, not backup-file SHA-256.
WITH
approved_tables AS (
  SELECT 'pathways'::text AS schema_name, table_name, 'target'::text AS table_group
  FROM unnest(ARRAY[
    'organizations','roles','permissions','role_permissions','system_users','audit_logs',
    'programs','projects','user_project_assignments','project_activities',
    'project_activity_assignments','project_milestones','project_indicators',
    'digital_forms','form_fields','data_import_batches','data_import_rows',
    'metadata_mappings','form_submissions','form_response_values','beneficiaries',
    'beneficiary_project_enrollments','journey_stages','activity_journey_stage_mappings',
    'beneficiary_activity_participations','beneficiary_journey_events',
    'project_budget_records','budget_expense_entries','assessment_results',
    'project_evaluation_criteria','project_evaluations','project_evaluation_scores',
    'alert_rules','alert_rule_conditions','alert_rule_recommendations',
    'rule_based_alerts','decision_recommendations','evidence_media','reports'
  ]::text[]) AS names(table_name)
  UNION ALL
  SELECT 'public', table_name, 'legacy'
  FROM unnest(ARRAY[
    'AuditLog','FormMetadata','MetadataField','Participant','ParticipantCard',
    'ParticipantJourney','Program','Project','Report','Role','UploadBatch',
    'UploadRow','UploadRowError','User','UserRole'
  ]::text[]) AS names(table_name)
),
table_catalog AS (
  SELECT approved.*, c.oid AS table_oid, c.relowner, c.relkind,
    c.relrowsecurity, c.relforcerowsecurity, c.relacl
  FROM approved_tables approved
  LEFT JOIN pg_namespace n ON n.nspname = approved.schema_name
  LEFT JOIN pg_class c ON c.relnamespace = n.oid
    AND c.relname = approved.table_name AND c.relkind IN ('r','p')
),
table_details AS (
  SELECT t.*,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'position', a.attnum, 'name', a.attname,
        'type', format_type(a.atttypid,a.atttypmod),
        'not_null', a.attnotnull, 'identity', a.attidentity,
        'generated', a.attgenerated,
        'default', pg_get_expr(d.adbin,d.adrelid),
        'collation', CASE WHEN a.attcollation = 0 THEN NULL ELSE
          format('%I.%I',collation_namespace.nspname,collation_row.collname) END
      ) ORDER BY a.attnum)
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      LEFT JOIN pg_collation collation_row ON collation_row.oid=a.attcollation
      LEFT JOIN pg_namespace collation_namespace ON collation_namespace.oid=collation_row.collnamespace
      WHERE a.attrelid=t.table_oid AND a.attnum>0 AND NOT a.attisdropped
    ),'[]'::jsonb) AS columns_definition,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'name',c.conname,'type',c.contype,
        'definition',pg_get_constraintdef(c.oid,false),
        'validated',c.convalidated,'deferrable',c.condeferrable,
        'initially_deferred',c.condeferred
      ) ORDER BY c.conname)
      FROM pg_constraint c WHERE c.conrelid=t.table_oid
        -- PG18 catalogs NOT NULL as constraints; attnotnull above covers it on
        -- both PG17 and PG18. Do not exclude any CHECK/FK/unique constraint.
        AND c.contype<>'n'
    ),'[]'::jsonb) AS constraints_definition,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'name',i.relname,'definition',pg_get_indexdef(x.indexrelid,0,false),
        'valid',x.indisvalid,'ready',x.indisready,
        'unique',x.indisunique,'primary',x.indisprimary
      ) ORDER BY i.relname)
      FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
      WHERE x.indrelid=t.table_oid
    ),'[]'::jsonb) AS indexes_definition,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'name',g.tgname,'definition',pg_get_triggerdef(g.oid,false),
        'enabled',g.tgenabled,'function_schema',function_schema.nspname,
        'function_name',p.proname,
        'function_arguments',pg_get_function_identity_arguments(p.oid)
      ) ORDER BY g.tgname)
      FROM pg_trigger g JOIN pg_proc p ON p.oid=g.tgfoid
      JOIN pg_namespace function_schema ON function_schema.oid=p.pronamespace
      WHERE g.tgrelid=t.table_oid AND NOT g.tgisinternal
    ),'[]'::jsonb) AS triggers_definition,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
        'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END
                                ORDER BY CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END)
                 FROM unnest(p.polroles) AS roles(r)),
        'using',pg_get_expr(p.polqual,p.polrelid),
        'with_check',pg_get_expr(p.polwithcheck,p.polrelid)
      ) ORDER BY p.polname)
      FROM pg_policy p WHERE p.polrelid=t.table_oid
    ),'[]'::jsonb) AS policies,
    coalesce((
      SELECT jsonb_agg(jsonb_build_array(
        CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
        pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable
      ) ORDER BY x.grantee,x.grantor,x.privilege_type)
      FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) x
    ),'[]'::jsonb) AS table_acl,
    coalesce((
      SELECT jsonb_agg(jsonb_build_array(
        a.attname,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
        pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable
      ) ORDER BY a.attnum,x.grantee,x.grantor,x.privilege_type)
      FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x
      WHERE a.attrelid=t.table_oid AND a.attnum>0 AND NOT a.attisdropped
    ),'[]'::jsonb) AS column_acl,
    CASE WHEN t.table_oid IS NULL THEN NULL ELSE
      ((xpath('/row/row_count/text()',query_to_xml(
        format('SELECT count(*) AS row_count FROM %I.%I',t.schema_name,t.table_name),
        false,true,'')))[1]::text)::bigint END AS row_count
  FROM table_catalog t
),
table_evidence AS (
  SELECT schema_name,table_name,table_group,
    jsonb_build_object(
      'schema',schema_name,'table',table_name,'group',table_group,
      'present',table_oid IS NOT NULL,'kind',relkind,
      'owner',pg_get_userbyid(relowner),'row_count',row_count,
      'columns_count',jsonb_array_length(columns_definition),
      'columns_md5',md5(columns_definition::text),
      'constraints_count',jsonb_array_length(constraints_definition),
      'constraints_md5',md5(constraints_definition::text),
      'indexes_count',jsonb_array_length(indexes_definition),
      'indexes_md5',md5(indexes_definition::text),
      'triggers_count',jsonb_array_length(triggers_definition),
      'triggers_md5',md5(triggers_definition::text),
      'structure_md5',md5(jsonb_build_object('columns',columns_definition,
        'constraints',constraints_definition,'indexes',indexes_definition,
        'triggers',triggers_definition)::text),
      'rls_enabled',relrowsecurity,'rls_forced',relforcerowsecurity,
      'policies',policies,'table_acl',table_acl,'column_acl',column_acl
    ) AS evidence
  FROM table_details
),
auth_users_evidence AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'created_at',created_at,'updated_at',updated_at
  ) ORDER BY id),'[]'::jsonb) AS identifiers FROM auth.users
),
auth_identities_evidence AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'user_id',user_id,'provider',provider,
    'created_at',created_at,'updated_at',updated_at
  ) ORDER BY id),'[]'::jsonb) AS identifiers FROM auth.identities
),
storage_buckets_evidence AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'bucket_id_md5',md5(id),'bucket_name_md5',md5(name),'public',public,
    'created_at',created_at,'updated_at',updated_at
  ) ORDER BY id),'[]'::jsonb) AS identifiers FROM storage.buckets
),
storage_objects_evidence AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'bucket_id_md5',md5(bucket_id),'private_key_md5',md5(name),
    'created_at',created_at,'updated_at',updated_at
  ) ORDER BY id),'[]'::jsonb) AS identifiers FROM storage.objects
),
event_trigger_evidence AS (
  SELECT e.evtname AS name,jsonb_build_object(
    'name',e.evtname,'owner',pg_get_userbyid(e.evtowner),
    'event',e.evtevent,'enabled',e.evtenabled,
    'tags',e.evttags,'function_schema',n.nspname,'function_name',p.proname,
    'function_arguments',pg_get_function_identity_arguments(p.oid),
    'function_owner',pg_get_userbyid(p.proowner),
    'function_security_definer',p.prosecdef,
    'function_definition_md5',md5(pg_get_functiondef(p.oid)),
    'create_definition',format('CREATE EVENT TRIGGER %I ON %s%s EXECUTE FUNCTION %I.%I()',
      e.evtname,e.evtevent,CASE WHEN e.evttags IS NULL THEN '' ELSE
      ' WHEN TAG IN (' || (SELECT string_agg(quote_literal(tag),', ' ORDER BY tag)
                          FROM unnest(e.evttags) AS tags(tag)) || ')' END,
      n.nspname,p.proname),
    -- Only emit the previously reviewed, non-secret custom function body when
    -- its exact capture matches. Drift emits a fingerprint, never unknown text.
    'captured_custom_function_definition',CASE
      WHEN e.evtname='ensure_rls' AND n.nspname='public' AND p.proname='rls_auto_enable'
       AND md5(pg_get_functiondef(p.oid))='6998ea6b4c2480f5d2e34b5dcf3f8d36'
      THEN pg_get_functiondef(p.oid) ELSE NULL END
  ) AS evidence
  FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid
  JOIN pg_namespace n ON n.oid=p.pronamespace
)
SELECT jsonb_build_object(
  'inventory_version',1,
  'connection',jsonb_build_object(
    'database',current_database(),'current_user',current_user,'session_user',session_user,
    'admin_can_read_role_catalog',has_table_privilege(current_user,'pg_catalog.pg_authid','SELECT'),
    'transaction_read_only',current_setting('transaction_read_only'),
    'server_version_num',current_setting('server_version_num'),
    'database_owner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())
  ),
  'ledger_locations',(SELECT coalesce(jsonb_agg(format('%I.%I',n.nspname,c.relname)
                         ORDER BY n.nspname),'[]'::jsonb)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname='_prisma_migrations' AND c.relkind IN ('r','p')),
  'ledger',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'migration_name',migration_name,'checksum',checksum,
    'started_at',started_at,'finished_at',finished_at,'rolled_back_at',rolled_back_at,
    'applied_steps_count',applied_steps_count,
    'has_failure_log',coalesce(length(logs)>0,false),
    'failure_contains_postgres_42501',coalesce(position('42501' IN logs)>0,false)
  ) ORDER BY started_at,id),'[]'::jsonb) FROM public._prisma_migrations),
  'actual_tables',(SELECT coalesce(jsonb_agg(format('%I.%I',n.nspname,c.relname)
                      ORDER BY n.nspname,c.relname),'[]'::jsonb)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','pathways') AND c.relkind IN ('r','p')),
  'tables',(SELECT jsonb_agg(evidence ORDER BY schema_name,table_name) FROM table_evidence),
  'legacy_structure_md5',(SELECT md5(jsonb_agg(jsonb_build_array(table_name,evidence->>'structure_md5')
                                          ORDER BY table_name)::text)
                          FROM table_evidence WHERE table_group='legacy'),
  'auth_foreign_keys',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'table',source_table.relname,'name',c.conname,
    'definition',pg_get_constraintdef(c.oid,false),'validated',c.convalidated
  ) ORDER BY source_table.relname,c.conname),'[]'::jsonb)
    FROM pg_constraint c JOIN pg_class source_table ON source_table.oid=c.conrelid
    JOIN pg_namespace source_schema ON source_schema.oid=source_table.relnamespace
    JOIN pg_class destination_table ON destination_table.oid=c.confrelid
    JOIN pg_namespace destination_schema ON destination_schema.oid=destination_table.relnamespace
    WHERE c.contype='f' AND source_schema.nspname='pathways' AND destination_schema.nspname='auth'),
  'auth',jsonb_build_object(
    'users_count',(SELECT jsonb_array_length(identifiers) FROM auth_users_evidence),
    'users',(SELECT identifiers FROM auth_users_evidence),
    'users_md5',(SELECT md5(identifiers::text) FROM auth_users_evidence),
    'identities_count',(SELECT jsonb_array_length(identifiers) FROM auth_identities_evidence),
    'identities',(SELECT identifiers FROM auth_identities_evidence),
    'identities_md5',(SELECT md5(identifiers::text) FROM auth_identities_evidence)
  ),
  'storage',jsonb_build_object(
    'buckets_count',(SELECT jsonb_array_length(identifiers) FROM storage_buckets_evidence),
    'buckets',(SELECT identifiers FROM storage_buckets_evidence),
    'buckets_md5',(SELECT md5(identifiers::text) FROM storage_buckets_evidence),
    'objects_count',(SELECT jsonb_array_length(identifiers) FROM storage_objects_evidence),
    'objects',(SELECT identifiers FROM storage_objects_evidence),
    'objects_md5',(SELECT md5(identifiers::text) FROM storage_objects_evidence)
  ),
  'event_triggers',(SELECT coalesce(jsonb_agg(evidence ORDER BY name),'[]'::jsonb)
                    FROM event_trigger_evidence),
  'managed_event_triggers_md5',(SELECT md5(coalesce(jsonb_agg(evidence ORDER BY name),'[]'::jsonb)::text)
    FROM event_trigger_evidence WHERE name<>'ensure_rls'),
  'schemas',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name',n.nspname,'owner',pg_get_userbyid(n.nspowner),
    'acl',(SELECT coalesce(jsonb_agg(jsonb_build_array(
      CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable
    ) ORDER BY x.grantee,x.grantor,x.privilege_type),'[]'::jsonb)
      FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x)
  ) ORDER BY n.nspname),'[]'::jsonb) FROM pg_namespace n
    WHERE n.nspname IN ('pathways','public','auth','storage')),
  'pathways_enums',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name',t.typname,'owner',pg_get_userbyid(t.typowner),
    'labels',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
              FROM pg_enum e WHERE e.enumtypid=t.oid),
    'acl',(SELECT coalesce(jsonb_agg(jsonb_build_array(
      CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable
    ) ORDER BY x.grantee,x.grantor,x.privilege_type),'[]'::jsonb)
      FROM aclexplode(coalesce(t.typacl,acldefault('T',t.typowner))) x)
  ) ORDER BY t.typname),'[]'::jsonb)
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='pathways' AND t.typtype='e'),
  'pathways_functions',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
    'result',pg_get_function_result(p.oid),'owner',pg_get_userbyid(p.proowner),
    'security_definer',p.prosecdef,'volatility',p.provolatile,
    'definition_md5',md5(pg_get_functiondef(p.oid)),
    'safe_configuration',(SELECT coalesce(jsonb_agg(setting ORDER BY setting),'[]'::jsonb)
      FROM unnest(p.proconfig) AS settings(setting)
      WHERE split_part(setting,'=',1) IN ('search_path','row_security','statement_timeout','lock_timeout')),
    'configuration_names',(SELECT coalesce(jsonb_agg(split_part(setting,'=',1) ORDER BY setting),'[]'::jsonb)
      FROM unnest(p.proconfig) AS settings(setting)),
    'acl',(SELECT coalesce(jsonb_agg(jsonb_build_array(
      CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable
    ) ORDER BY x.grantee,x.grantor,x.privilege_type),'[]'::jsonb)
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x)
  ) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)),'[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='pathways' AND p.prokind IN ('f','p')),
  'database_acl',(SELECT coalesce(jsonb_agg(jsonb_build_array(
    CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
    pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable
  ) ORDER BY x.grantee,x.grantor,x.privilege_type),'[]'::jsonb)
    FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) x
    WHERE d.datname=current_database()),
  'default_acl',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'owner',pg_get_userbyid(d.defaclrole),
    'schema',CASE WHEN d.defaclnamespace=0 THEN '<global>' ELSE n.nspname END,
    'object_type',d.defaclobjtype,
    'acl',(SELECT coalesce(jsonb_agg(jsonb_build_array(
      CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable
    ) ORDER BY x.grantee,x.grantor,x.privilege_type),'[]'::jsonb)
      FROM aclexplode(d.defaclacl) x)
  ) ORDER BY pg_get_userbyid(d.defaclrole),coalesce(n.nspname,''),d.defaclobjtype),'[]'::jsonb)
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace),
  'roles',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name',r.rolname,'superuser',r.rolsuper,'inherit',r.rolinherit,
    'create_database',r.rolcreatedb,'create_role',r.rolcreaterole,
    'login',r.rolcanlogin,'replication',r.rolreplication,'bypass_rls',r.rolbypassrls,
    'connection_limit',r.rolconnlimit,'valid_until',r.rolvaliduntil,
    'database_connect',has_database_privilege(r.oid,current_database(),'CONNECT'),
    'database_create',has_database_privilege(r.oid,current_database(),'CREATE'),
    'database_temporary',has_database_privilege(r.oid,current_database(),'TEMPORARY'),
    'configuration_names',(SELECT coalesce(jsonb_agg(split_part(setting,'=',1) ORDER BY setting),'[]'::jsonb)
      FROM unnest(r.rolconfig) AS settings(setting))
  ) ORDER BY r.rolname),'[]'::jsonb) FROM pg_roles r),
  'runtime_owned_object_count',(SELECT count(*) FROM pg_shdepend d
    JOIN pg_roles r ON r.oid=d.refobjid
    WHERE d.refclassid='pg_authid'::regclass AND r.rolname='pathways_runtime'
      AND d.deptype='o'),
  'memberships',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'role',pg_get_userbyid(m.roleid),'member',pg_get_userbyid(m.member),
    'grantor',pg_get_userbyid(m.grantor),'admin_option',m.admin_option,
    'inherit_option',m.inherit_option,'set_option',m.set_option
  ) ORDER BY pg_get_userbyid(m.roleid),pg_get_userbyid(m.member),pg_get_userbyid(m.grantor)),
    '[]'::jsonb) FROM pg_auth_members m)
) AS phase4_inventory;
