\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL search_path = '';

SELECT 'organization' AS kind, o.id::text AS id, o.code AS label, o.status::text AS state
FROM pathways.organizations AS o
WHERE o.archived_at IS NULL
ORDER BY o.code;

SELECT 'approved_actor' AS kind, u.id::text AS id, u.full_name AS label,
  r.code || ':' || u.account_status::text AS state
FROM pathways.system_users AS u
JOIN pathways.roles AS r ON r.id = u.role_id
WHERE u.archived_at IS NULL
  AND r.code IN ('SYSTEM_ADMINISTRATOR', 'PROJECT_MANAGER', 'MONITORING_AND_EVALUATION_OFFICER')
ORDER BY r.code, u.full_name;

SELECT 'target_project' AS kind, p.id::text AS id, p.code AS label,
  concat_ws('/', p.start_date::text, p.end_date::text, p.status::text) AS state
FROM pathways.projects AS p
WHERE p.code IN ('C8-VISIBLE-001', 'C8-SUPPRESS-001')
ORDER BY p.code;

SELECT 'target_assignment' AS kind, a.id::text AS id,
  u.full_name || ':' || p.code AS label, a.status::text AS state
FROM pathways.user_project_assignments AS a
JOIN pathways.system_users AS u ON u.id = a.user_id AND u.organization_id = a.organization_id
JOIN pathways.projects AS p ON p.id = a.project_id AND p.organization_id = a.organization_id
WHERE p.code IN ('C8-VISIBLE-001', 'C8-SUPPRESS-001')
ORDER BY p.code, u.full_name, a.assigned_at;

DO $check$
BEGIN
  IF (SELECT count(*) FROM pathways.organizations WHERE archived_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active approved organization';
  END IF;
  IF (
    SELECT count(*) FROM pathways.projects
    WHERE organization_id = '7541cfc6-541d-4057-9229-03d89d361d34'::uuid
      AND archived_at IS NULL
      AND status = 'COMPLETED'
      AND (
        (code = 'C8-VISIBLE-001' AND start_date = DATE '2026-06-01' AND end_date = DATE '2026-06-30')
        OR (code = 'C8-SUPPRESS-001' AND start_date = DATE '2026-07-01' AND end_date = DATE '2026-07-31')
      )
  ) <> 2 THEN
    RAISE EXCEPTION 'C8 target project periods do not match approval';
  END IF;
  IF (
    SELECT count(*)
    FROM pathways.user_project_assignments AS a
    JOIN pathways.projects AS p ON p.id = a.project_id AND p.organization_id = a.organization_id
    JOIN pathways.system_users AS u ON u.id = a.user_id AND u.organization_id = a.organization_id
    JOIN pathways.roles AS r ON r.id = u.role_id
    WHERE p.code IN ('C8-VISIBLE-001', 'C8-SUPPRESS-001')
      AND a.status = 'ACTIVE' AND a.ended_at IS NULL
      AND u.account_status = 'ACTIVE'
      AND (
        (u.full_name = 'Project Manager Test' AND r.code = 'PROJECT_MANAGER')
        OR (u.full_name = 'MERL Officer Test' AND r.code = 'MONITORING_AND_EVALUATION_OFFICER')
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'Four approved active C8 project assignments are required';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pathways.user_project_assignments AS a
    JOIN pathways.projects AS p ON p.id = a.project_id AND p.organization_id = a.organization_id
    JOIN pathways.system_users AS u ON u.id = a.user_id AND u.organization_id = a.organization_id
    WHERE p.code IN ('C8-VISIBLE-001', 'C8-SUPPRESS-001')
      AND a.status = 'ACTIVE' AND a.ended_at IS NULL
      AND u.full_name NOT IN ('Project Manager Test', 'MERL Officer Test')
  ) THEN
    RAISE EXCEPTION 'Unexpected active C8 project assignee';
  END IF;
END
$check$;

SELECT 'target_form' AS kind, f.id::text AS id,
  p.code || ':' || f.code AS label,
  f.status::text || '/v' || f.version::text || '/fields=' || count(ff.id)::text ||
    '/author=' || coalesce(author.full_name, 'none') ||
    '/publisher=' || coalesce(publisher.full_name, 'none') AS state
FROM pathways.digital_forms AS f
JOIN pathways.projects AS p ON p.id = f.project_id AND p.organization_id = f.organization_id
LEFT JOIN pathways.form_fields AS ff ON ff.form_id = f.id
LEFT JOIN pathways.system_users AS author ON author.id = f.created_by_id
LEFT JOIN pathways.system_users AS publisher ON publisher.id = f.published_by_id
WHERE p.code IN ('C8-VISIBLE-001', 'C8-SUPPRESS-001')
GROUP BY f.id, p.code, author.full_name, publisher.full_name
ORDER BY p.code, f.version;

SELECT 'PATHWAYS_C8_FIXTURE_PREFLIGHT=PASS' AS result;
ROLLBACK;
