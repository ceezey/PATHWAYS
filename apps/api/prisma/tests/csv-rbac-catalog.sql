-- Read-only catalog parity for disposable replay; includes objects Prisma omits.
SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(table_name,column_name,data_type,udt_schema,udt_name,is_nullable,column_default) ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema='pathways'),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pathways'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(tablename,indexname,indexdef) ORDER BY tablename,indexname) FROM pg_indexes WHERE schemaname='pathways'),
 'policies',(SELECT jsonb_agg(jsonb_build_array(tablename,policyname,permissive,roles,cmd,qual,with_check) ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='pathways'),
 'functions',(SELECT jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pathways'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pathways' AND NOT t.tgisinternal),
 'tableSecurity',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pathways' AND c.relkind='r'),
 'grants',(SELECT jsonb_agg(jsonb_build_array(r.code,p.code) ORDER BY r.code,p.code) FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id JOIN pathways.permissions p ON p.id=rp.permission_id)
)::text;
