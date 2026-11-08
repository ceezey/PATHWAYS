-- cr-pathways-map-pins-and-detail-panel (0089): disposable checks for pathways.project_map_pins, the pins key of the
-- publication snapshot and the public map view. Synthetic fixtures only; everything rolls back. Run as a local superuser
-- against a disposable pathways_phase2_* or phase4/phase6 replay database that already has 0089 applied.
-- Success prints PROJECT_MAP_PINS_RUNTIME=PASS (n).
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
 IF current_database() !~ '^pathways_phase(2|4)_[a-z0-9_]+$' OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
 OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Project map pins checks require a disposable local database'; END IF;
END $$;

-- Hosted prisma has no BYPASSRLS, so the suite drops it for this transaction to read forced RLS as hosted does.
ALTER ROLE prisma NOBYPASSRLS;

CREATE FUNCTION pg_temp.u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('a8900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION pg_temp.count_pass() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('pmp.passed',(coalesce(nullif(current_setting('pmp.passed',true),''),'0')::integer+1)::text,true);
END $$;
-- A boolean that is not true raises with its label; a true one is counted.
CREATE FUNCTION pg_temp.ok(label text, value boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion % failed',label; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- Two documents must be equal; the failure shows both.
CREATE FUNCTION pg_temp.same(label text, got jsonb, wanted jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF got IS NULL OR got IS DISTINCT FROM wanted THEN RAISE EXCEPTION 'Assertion % gave % not %',label,got,wanted; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- The statement must fail with the expected SQLSTATE and a message that mentions the needle.
CREATE FUNCTION pg_temp.refused(label text, statement text, expected text, needle text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text; message text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN got := SQLSTATE; message := SQLERRM; END;
 IF got IS DISTINCT FROM expected OR position(needle in message)=0 THEN
  RAISE EXCEPTION 'Assertion % gave % (%) not % mentioning %',label,got,message,expected,needle; END IF;
 PERFORM pg_temp.count_pass();
END $$;
-- Rows a statement changed, so a policy that hides rows shows as zero.
CREATE FUNCTION pg_temp.changed(statement text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 EXECUTE statement; GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
-- App context for staff user user_n (jwt user_n-10) in organization org_n; 0 clears every app and jwt setting.
CREATE FUNCTION pg_temp.act_as(user_n integer, org_n integer DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n-10)::text END,true),
  set_config('request.jwt.claims','',true),
  set_config('app.organization_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(org_n)::text END,true),
  set_config('app.user_id',CASE WHEN user_n=0 THEN '' ELSE pg_temp.u(user_n)::text END,true);
END $$;
CREATE FUNCTION pg_temp.pins(project_n integer) RETURNS jsonb LANGUAGE sql AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',place_name,'province',province,'longitude',longitude,'latitude',latitude)
  ORDER BY place_name),'[]'::jsonb) FROM pathways.project_map_pins WHERE organization_id=pg_temp.u(1) AND project_id=pg_temp.u(project_n)
$$;
-- Moves a publication by one UPDATE as the given user.
CREATE FUNCTION pg_temp.move(user_n integer, project_n integer, assignments text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(user_n);
 EXECUTE format('UPDATE pathways.project_publications SET %s WHERE organization_id=%L AND project_id=%L',
  assignments,pg_temp.u(1),pg_temp.u(project_n));
END $$;
-- 21 submits revision 1 with the map view, then 22 approves and publishes it.
CREATE FUNCTION pg_temp.publish_first(project_n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(21);
 INSERT INTO pathways.project_publications(organization_id,project_id,revision,state,last_operation,summary,snapshot,submitted_by_id)
 VALUES(pg_temp.u(1),pg_temp.u(project_n),1,'FOR_REVIEW','SUBMIT','Pins summary','{"media":[],"views":["map"]}',pg_temp.u(21));
 PERFORM pg_temp.move(22,project_n,$s$state='APPROVED'$s$);
 PERFORM pg_temp.move(22,project_n,$s$state='PUBLISHED'$s$);
END $$;
-- The public read of one view, as the API calls it with no app context.
CREATE FUNCTION pg_temp.pv(project_n integer, view_name text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.act_as(0);
 RETURN pathways.p87_public_view(pg_temp.u(project_n),view_name);
END $$;

-- Catalog: the table is prisma-owned with forced row security, the keys and checks are in place, and the runtime role cannot
-- move a pin to another place or project.
SELECT pg_temp.ok('catalog table', (SELECT pg_catalog.pg_get_userbyid(relowner)='prisma' AND relrowsecurity AND relforcerowsecurity
  FROM pg_catalog.pg_class WHERE oid='pathways.project_map_pins'::regclass)
 AND (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.project_map_pins'::regclass)=4
 AND (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid='pathways.project_map_pins'::regclass AND contype='f')=3
 AND (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid='pathways.project_map_pins'::regclass AND contype='c')=4
 AND has_table_privilege('pathways_runtime','pathways.project_map_pins','SELECT')
 AND has_table_privilege('pathways_runtime','pathways.project_map_pins','INSERT')
 AND has_table_privilege('pathways_runtime','pathways.project_map_pins','DELETE')
 AND NOT has_table_privilege('pathways_runtime','pathways.project_map_pins','UPDATE')
 AND has_column_privilege('pathways_runtime','pathways.project_map_pins','locked','UPDATE')
 AND NOT has_column_privilege('pathways_runtime','pathways.project_map_pins','place_name','UPDATE')
 AND NOT has_table_privilege('anon','pathways.project_map_pins','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('authenticated','pathways.project_map_pins','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('service_role','pathways.project_map_pins','SELECT,INSERT,UPDATE,DELETE'));

-- Fixtures: organization A with Project Managers 21 and 22 and Project Officer 23 (read only), all assigned to projects 41 to 43;
-- organization B with Project Manager 31. Project 42 has no pins. Project 43 keeps an older snapshot.
INSERT INTO auth.users(id) VALUES (pg_temp.u(11)),(pg_temp.u(12)),(pg_temp.u(13)),(pg_temp.u(21));
INSERT INTO pathways.organizations(id,code,name) VALUES (pg_temp.u(1),'PMP_A','Synthetic map pins organization A'),
 (pg_temp.u(2),'PMP_B','Synthetic map pins organization B');
INSERT INTO pathways.system_users(id,organization_id,role_id,auth_user_id,full_name,email,account_status,invited_at,activated_at)
SELECT v.id,v.org,r.id,v.auth_id,v.full_name,v.email,'ACTIVE',now(),now()
FROM (VALUES (pg_temp.u(21),pg_temp.u(1),'PROJECT_MANAGER',pg_temp.u(11),'Synthetic PMP editor','pmp-a@example.invalid'),
 (pg_temp.u(22),pg_temp.u(1),'PROJECT_MANAGER',pg_temp.u(12),'Synthetic PMP publisher','pmp-b@example.invalid'),
 (pg_temp.u(23),pg_temp.u(1),'PROJECT_OFFICER',pg_temp.u(13),'Synthetic PMP reader','pmp-c@example.invalid'),
 (pg_temp.u(31),pg_temp.u(2),'PROJECT_MANAGER',pg_temp.u(21),'Synthetic PMP outsider','pmp-d@example.invalid')) v(id,org,role_code,auth_id,full_name,email)
JOIN pathways.roles r ON r.code=v.role_code;
SET LOCAL session_replication_role = replica;
INSERT INTO pathways.projects(id,organization_id,code,title,implementation_area,created_by_id)
SELECT pg_temp.u(n),pg_temp.u(1),'PMP_'||n,'Synthetic PMP project '||n,'Borongan City, Guiuan',pg_temp.u(21) FROM unnest(ARRAY[41,42,43]) n;
INSERT INTO pathways.user_project_assignments(id,organization_id,project_id,user_id,assigned_by_id)
SELECT pg_temp.u(900+p*3+s),pg_temp.u(1),pg_temp.u(p),pg_temp.u(20+s),pg_temp.u(21) FROM unnest(ARRAY[41,42,43]) p, unnest(ARRAY[1,2,3]) s;
SET LOCAL session_replication_role = origin;

SET LOCAL SESSION AUTHORIZATION pathways_runtime;

-- editor_writes: an editor inserts, moves and locks, then deletes a pin; the stamp names the editor.
SELECT pg_temp.act_as(21);
INSERT INTO pathways.project_map_pins(organization_id,project_id,place_name,province,longitude,latitude,updated_by_id)
VALUES (pg_temp.u(1),pg_temp.u(41),'Borongan City','Eastern Samar',125.44,11.61,pg_temp.u(21)),
 (pg_temp.u(1),pg_temp.u(41),'Guiuan','Eastern Samar',125.72,11.03,pg_temp.u(21));
SELECT pg_temp.ok('editor inserts', (SELECT count(*)=2 AND bool_and(NOT locked) AND bool_and(updated_by_id=pg_temp.u(21))
 FROM pathways.project_map_pins WHERE project_id=pg_temp.u(41)));
SELECT pg_temp.ok('editor updates', pg_temp.changed(format($u$UPDATE pathways.project_map_pins SET longitude=125.5,latitude=11.6,locked=true,
 updated_by_id=%L,updated_at=now() WHERE organization_id=%L AND project_id=%L AND place_name='Guiuan'$u$,pg_temp.u(21),pg_temp.u(1),pg_temp.u(41)))=1);
SELECT pg_temp.ok('editor update stored', (SELECT locked AND longitude=125.5 AND latitude=11.6 FROM pathways.project_map_pins WHERE place_name='Guiuan'));
SELECT pg_temp.ok('editor deletes', pg_temp.changed(format($d$DELETE FROM pathways.project_map_pins WHERE organization_id=%L AND project_id=%L
 AND place_name='Guiuan'$d$,pg_temp.u(1),pg_temp.u(41)))=1);
SELECT pg_temp.ok('editor delete stored', (SELECT count(*)=1 FROM pathways.project_map_pins));
-- Another editor's name cannot be written, the place and project keys are fixed, and the second editor may change the first one's pin.
SELECT pg_temp.refused('stamp must be the actor', format($s$INSERT INTO pathways.project_map_pins(organization_id,project_id,place_name,
 province,longitude,latitude,updated_by_id) VALUES(%L,%L,'Guiuan','Eastern Samar',125.7,11.0,%L)$s$,pg_temp.u(1),pg_temp.u(41),pg_temp.u(22)),
 '42501','row-level security');
SELECT pg_temp.refused('place key is fixed', format($s$UPDATE pathways.project_map_pins SET place_name='Salcedo' WHERE organization_id=%L
 AND project_id=%L$s$,pg_temp.u(1),pg_temp.u(41)),'42501','permission denied');
SELECT pg_temp.refused('project key is fixed', format($s$UPDATE pathways.project_map_pins SET project_id=%L WHERE organization_id=%L
 AND project_id=%L$s$,pg_temp.u(42),pg_temp.u(1),pg_temp.u(41)),'42501','permission denied');
SELECT pg_temp.refused('one pin per place', format($s$INSERT INTO pathways.project_map_pins(organization_id,project_id,place_name,province,
 longitude,latitude,updated_by_id) VALUES(%L,%L,'Borongan City','Eastern Samar',125.0,11.0,%L)$s$,pg_temp.u(1),pg_temp.u(41),pg_temp.u(21)),
 '23505','project_map_pins_pkey');
SELECT pg_temp.act_as(22);
SELECT pg_temp.ok('second editor moves', pg_temp.changed(format($u$UPDATE pathways.project_map_pins SET longitude=125.45,updated_by_id=%L,
 updated_at=now() WHERE organization_id=%L AND project_id=%L$u$,pg_temp.u(22),pg_temp.u(1),pg_temp.u(41)))=1);

-- reader_reads: projects.read alone selects but cannot insert, move or delete.
SELECT pg_temp.act_as(23);
SELECT pg_temp.ok('reader selects', (SELECT count(*)=1 FROM pathways.project_map_pins WHERE project_id=pg_temp.u(41)));
SELECT pg_temp.refused('reader insert refused', format($s$INSERT INTO pathways.project_map_pins(organization_id,project_id,place_name,province,
 longitude,latitude,updated_by_id) VALUES(%L,%L,'Guiuan','Eastern Samar',125.7,11.0,%L)$s$,pg_temp.u(1),pg_temp.u(41),pg_temp.u(23)),
 '42501','row-level security');
SELECT pg_temp.ok('reader update hidden', pg_temp.changed(format($u$UPDATE pathways.project_map_pins SET locked=true,updated_by_id=%L
 WHERE organization_id=%L$u$,pg_temp.u(23),pg_temp.u(1)))=0);
SELECT pg_temp.ok('reader delete hidden', pg_temp.changed(format($d$DELETE FROM pathways.project_map_pins WHERE organization_id=%L$d$,pg_temp.u(1)))=0);
SELECT pg_temp.ok('reader delete stored nothing', (SELECT count(*)=1 FROM pathways.project_map_pins));

-- other_organization: staff of organization B see no pin of organization A, and cannot write one.
SELECT pg_temp.act_as(31,2);
SELECT pg_temp.ok('other organization sees none', (SELECT count(*)=0 FROM pathways.project_map_pins));
SELECT pg_temp.refused('other organization insert refused', format($s$INSERT INTO pathways.project_map_pins(organization_id,project_id,
 place_name,province,longitude,latitude,updated_by_id) VALUES(%L,%L,'Guiuan','Eastern Samar',125.7,11.0,%L)$s$,pg_temp.u(1),pg_temp.u(41),pg_temp.u(31)),
 '42501','row-level security');
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('no context sees none', (SELECT count(*)=0 FROM pathways.project_map_pins));

-- bounds: longitude 114 to 128 and latitude 4 to 22 hold at the edges and fail outside them.
SELECT pg_temp.act_as(21);
SELECT pg_temp.refused('longitude below range', format($s$INSERT INTO pathways.project_map_pins(organization_id,project_id,place_name,province,
 longitude,latitude,updated_by_id) VALUES(%L,%L,'West','Test',113.9,11.0,%L)$s$,pg_temp.u(1),pg_temp.u(41),pg_temp.u(21)),'23514','project_map_pins_longitude_check');
SELECT pg_temp.refused('longitude above range', format($s$INSERT INTO pathways.project_map_pins(organization_id,project_id,place_name,province,
 longitude,latitude,updated_by_id) VALUES(%L,%L,'East','Test',128.1,11.0,%L)$s$,pg_temp.u(1),pg_temp.u(41),pg_temp.u(21)),'23514','project_map_pins_longitude_check');
SELECT pg_temp.refused('latitude above range', format($s$INSERT INTO pathways.project_map_pins(organization_id,project_id,place_name,province,
 longitude,latitude,updated_by_id) VALUES(%L,%L,'North','Test',125.0,22.1,%L)$s$,pg_temp.u(1),pg_temp.u(41),pg_temp.u(21)),'23514','project_map_pins_latitude_check');
SELECT pg_temp.refused('latitude below range', format($s$INSERT INTO pathways.project_map_pins(organization_id,project_id,place_name,province,
 longitude,latitude,updated_by_id) VALUES(%L,%L,'South','Test',125.0,3.9,%L)$s$,pg_temp.u(1),pg_temp.u(41),pg_temp.u(21)),'23514','project_map_pins_latitude_check');
SELECT pg_temp.refused('not a number refused', format($s$INSERT INTO pathways.project_map_pins(organization_id,project_id,place_name,province,
 longitude,latitude,updated_by_id) VALUES(%L,%L,'Nan','Test','NaN',11.0,%L)$s$,pg_temp.u(1),pg_temp.u(41),pg_temp.u(21)),'23514','project_map_pins_longitude_check');
SELECT pg_temp.refused('empty place refused', format($s$INSERT INTO pathways.project_map_pins(organization_id,project_id,place_name,province,
 longitude,latitude,updated_by_id) VALUES(%L,%L,'','Test',125.0,11.0,%L)$s$,pg_temp.u(1),pg_temp.u(41),pg_temp.u(21)),'23514','project_map_pins_place_name_check');
SELECT pg_temp.refused('long province refused', format($s$INSERT INTO pathways.project_map_pins(organization_id,project_id,place_name,province,
 longitude,latitude,updated_by_id) VALUES(%L,%L,'Long',%L,125.0,11.0,%L)$s$,pg_temp.u(1),pg_temp.u(41),repeat('p',121),pg_temp.u(21)),'23514','project_map_pins_province_check');
INSERT INTO pathways.project_map_pins(organization_id,project_id,place_name,province,longitude,latitude,updated_by_id)
VALUES (pg_temp.u(1),pg_temp.u(41),'Edge SW','Test',114,4,pg_temp.u(21)),(pg_temp.u(1),pg_temp.u(41),'Edge NE','Test',128,22,pg_temp.u(21));
SELECT pg_temp.ok('edges accepted', (SELECT count(*)=3 FROM pathways.project_map_pins WHERE project_id=pg_temp.u(41)));
DELETE FROM pathways.project_map_pins WHERE province='Test';

-- snapshot_pins: SUBMIT freezes the saved pins into the snapshot; a later move does not change the submitted revision.
SELECT pg_temp.same('pins before submit', pg_temp.pins(41),
 '[{"name":"Borongan City","province":"Eastern Samar","longitude":125.45,"latitude":11.61}]');
SELECT pg_temp.publish_first(41);
SELECT pg_temp.publish_first(42);
SELECT pg_temp.act_as(21);
SELECT pg_temp.same('snapshot pins', (SELECT snapshot->'pins' FROM pathways.project_publications WHERE project_id=pg_temp.u(41)),
 '[{"name":"Borongan City","province":"Eastern Samar","longitude":125.45,"latitude":11.61}]');
SELECT pg_temp.same('live snapshot pins', (SELECT live_snapshot->'pins' FROM pathways.project_publications WHERE project_id=pg_temp.u(41)),
 '[{"name":"Borongan City","province":"Eastern Samar","longitude":125.45,"latitude":11.61}]');
SELECT pg_temp.same('snapshot without pins holds an empty list', (SELECT snapshot->'pins' FROM pathways.project_publications
 WHERE project_id=pg_temp.u(42)),'[]');
SELECT pg_temp.ok('snapshot keeps eleven keys', (SELECT (SELECT count(*) FROM jsonb_object_keys(snapshot))=11 FROM pathways.project_publications
 WHERE project_id=pg_temp.u(41)));
SELECT pg_temp.ok('later move', pg_temp.changed(format($u$UPDATE pathways.project_map_pins SET longitude=126.0,updated_by_id=%L,
 updated_at=now() WHERE organization_id=%L AND project_id=%L$u$,pg_temp.u(21),pg_temp.u(1),pg_temp.u(41)))=1);
SELECT pg_temp.ok('later move leaves live revision', (SELECT live_snapshot->'pins'->0->>'longitude'='125.45' AND snapshot->'pins'->0->>'longitude'='125.45'
  FROM pathways.project_publications WHERE project_id=pg_temp.u(41)));
-- A new revision picks up the moved pin; a pin cannot be smuggled in through the submitted snapshot.
SELECT pg_temp.move(21,41,$$revision=2,state='FOR_REVIEW',summary='Pins summary two',
 snapshot='{"media":[],"views":["map"],"pins":[{"name":"Fake","province":"Fake","longitude":120,"latitude":10}]}'$$);
SELECT pg_temp.same('new revision pins', (SELECT snapshot->'pins' FROM pathways.project_publications WHERE project_id=pg_temp.u(41)),
 '[{"name":"Borongan City","province":"Eastern Samar","longitude":126,"latitude":11.61}]');
SELECT pg_temp.move(22,41,$$state='APPROVED'$$);
SELECT pg_temp.move(22,41,$$state='PUBLISHED'$$);

-- public_pins: the map view returns the live revision's pins beside the area and towns, and the project payload has no pins key.
SELECT pg_temp.same('public map pins', pg_temp.pv(41,'map')->'pins',
 '[{"name":"Borongan City","province":"Eastern Samar","longitude":126,"latitude":11.61}]');
SELECT pg_temp.ok('public map keeps area and towns', pg_temp.pv(41,'map') ? 'area' AND pg_temp.pv(41,'map') ? 'towns');
SELECT pg_temp.same('public map empty pins', pg_temp.pv(42,'map')->'pins','[]');
SELECT pg_temp.act_as(0);
SELECT pg_temp.ok('public project has no pins key', (SELECT NOT (pathways.p85_public_projects(pg_temp.u(41))->0 ? 'pins')
 AND pathways.p85_public_projects(pg_temp.u(41))->0 ? 'media' AND pathways.p85_public_projects(pg_temp.u(41))->0 ? 'views'
 AND (SELECT count(*)=11 FROM jsonb_object_keys(pathways.p85_public_projects(pg_temp.u(41))->0))));
SELECT pg_temp.ok('public projects list has no pins key', NOT EXISTS(SELECT FROM jsonb_array_elements(pathways.p85_public_projects()) x
 WHERE x ? 'pins'));
SELECT pg_temp.ok('anonymous reads never touch the pin table', pg_temp.pv(41,'map') IS NOT NULL
 AND NOT has_table_privilege('anon','pathways.project_map_pins','SELECT') AND NOT has_table_privilege('authenticated','pathways.project_map_pins','SELECT'));

-- older_snapshot: a snapshot from before 0089 has no pins key, still passes the shape check, and the map view gives an empty list.
RESET SESSION AUTHORIZATION;
SET LOCAL session_replication_role = replica;
UPDATE pathways.project_publications SET live_snapshot=live_snapshot-'pins',snapshot=snapshot-'pins' WHERE project_id=pg_temp.u(41);
SET LOCAL session_replication_role = origin;
SELECT pg_temp.ok('older snapshot passes the shape check', (SELECT NOT (snapshot ? 'pins') AND NOT (live_snapshot ? 'pins')
 FROM pathways.project_publications WHERE project_id=pg_temp.u(41)));
SET LOCAL SESSION AUTHORIZATION pathways_runtime;
SELECT pg_temp.same('older snapshot map pins', pg_temp.pv(41,'map')->'pins','[]');
SELECT pg_temp.ok('older snapshot project payload', (SELECT NOT (pathways.p85_public_projects(pg_temp.u(41))->0 ? 'pins')));
RESET SESSION AUTHORIZATION;
-- The shape check still refuses a pins value that is not a list and any other extra key.
SET LOCAL session_replication_role = replica;
SELECT pg_temp.refused('pins must be a list', format($s$UPDATE pathways.project_publications SET snapshot=snapshot||'{"pins":"x"}'
 WHERE project_id=%L$s$,pg_temp.u(41)),'23514','publication_snapshot_shape');
SELECT pg_temp.refused('no other extra key', format($s$UPDATE pathways.project_publications SET snapshot=snapshot||'{"extra":[]}'
 WHERE project_id=%L$s$,pg_temp.u(41)),'23514','publication_snapshot_shape');
SET LOCAL session_replication_role = origin;

SELECT 'PROJECT_MAP_PINS_RUNTIME=PASS ('||current_setting('pmp.passed')||')' AS result \gset
ROLLBACK;
\echo :result
