import { ConflictException, NotFoundException } from '@nestjs/common'
import type { CreateFormRequest, GenerateFormRequest } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { findForm, requireForm, requireLinks } from './form-lookup.service'
import { type FormTemplateKey, formTemplates } from './form-templates'
import { assertDefinition, fieldData } from './metadata.helpers'
import { type CachedFormDefinition, fieldInput, formSelection, mapForm } from './metadata.mapper'
import type { PublishedDefinitionCache } from './published-definition-cache'

export async function listProjectForms(tx: Tx, actor: ApplicationIdentity, projectId: string) {
  const id = await requireScopedProject(tx, actor, projectId)
  const rows = await tx.digitalForm.findMany({
    where: { organizationId: actor.organizationId, projectId: id },
    select: formSelection,
    orderBy: [{ code: 'asc' }, { version: 'desc' }],
    take: 100,
  })
  return rows.map((row) => mapForm(row, actor))
}

export async function readFormDefinition(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
  cache: PublishedDefinitionCache<CachedFormDefinition>,
) {
  const scopedProjectId = await requireScopedProject(tx, actor, projectId)
  if (!UUID_PATTERN.test(formId)) throw new NotFoundException('Form unavailable.')
  const id = formId.toLowerCase()
  const key = JSON.stringify([
    actor.id,
    actor.organizationId,
    actor.userId,
    actor.aal,
    [...actor.roles].sort(),
    [...actor.permissions].sort(),
    [...actor.assignedProjectIds].sort(),
    scopedProjectId,
    id,
  ])
  // Cached data is a candidate only. Current scoped SQL source/status must
  // match before this payload can be returned; authority is never cached.
  const candidate = cache.read(key)
  const current = await currentDefinition(
    tx,
    actor,
    scopedProjectId,
    id,
    candidate?.fingerprint ?? null,
  )
  if (!current) throw new NotFoundException('Form unavailable.')
  if (!current.fingerprint) {
    cache.evictForm(id)
    return mapForm(await findForm(tx, actor, scopedProjectId, id), actor)
  }
  if (
    current.status === 'PUBLISHED' &&
    candidate?.fingerprint === current.fingerprint &&
    current.payload === null
  )
    return candidate.value
  if (!current.payload) throw new NotFoundException('Form unavailable.')
  if (current.status === 'PUBLISHED')
    cache.write(key, id, {
      fingerprint: current.fingerprint,
      value: current.payload,
    })
  else cache.evictForm(id)
  return current.payload
}

export async function createDraftForm(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  input: CreateFormRequest,
) {
  const scopedProjectId = await requireScopedProject(tx, actor, projectId)
  return insertDraft(tx, actor, scopedProjectId, input, 'FORM_DRAFT_CREATED', {})
}

export async function generateDraftForm(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  input: GenerateFormRequest,
  hasTemplate: boolean,
) {
  const scopedProjectId = await requireScopedProject(tx, actor, projectId)
  let definition: CreateFormRequest
  let origin: Prisma.InputJsonObject
  if (hasTemplate) {
    const key = input.templateKey as FormTemplateKey
    const template = formTemplates[key]
    definition = {
      code: input.code,
      name: input.name,
      description: template.description,
      formType: template.formType,
      fields: template.fields.map((item) => ({
        ...item,
        allowedValues: item.allowedValues ? [...item.allowedValues] : undefined,
      })),
    }
    origin = { templateKey: key }
  } else {
    const source = await requireForm(tx, actor, scopedProjectId, input.sourceFormId as string)
    definition = {
      code: input.code,
      name: input.name,
      description: source.description ?? undefined,
      formType: source.formType,
      activityId: source.activityId ?? undefined,
      journeyStageId: source.journeyStageId ?? undefined,
      fields: source.formField_form.map(fieldInput),
    }
    origin = { sourceFormId: source.id, sourceVersion: source.version }
  }
  assertDefinition(definition)
  return insertDraft(tx, actor, scopedProjectId, definition, 'FORM_GENERATED', origin)
}

async function insertDraft(
  tx: Tx,
  actor: ApplicationIdentity,
  scopedProjectId: string,
  input: CreateFormRequest,
  action: 'FORM_DRAFT_CREATED' | 'FORM_GENERATED',
  origin: Prisma.InputJsonObject,
) {
  await requireLinks(tx, actor, scopedProjectId, input.activityId, input.journeyStageId)
  const exists = await tx.digitalForm.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId: scopedProjectId,
      code: input.code,
    },
    select: { id: true },
  })
  if (exists) throw new ConflictException('That form code already exists in this project.')
  const created = await tx.digitalForm.create({
    data: {
      organizationId: actor.organizationId,
      projectId: scopedProjectId,
      code: input.code,
      version: 1,
      name: input.name,
      description: input.description?.trim() || null,
      formType: input.formType,
      activityId: input.activityId?.toLowerCase(),
      journeyStageId: input.journeyStageId?.toLowerCase(),
      createdById: actor.userId,
      lastEditedById: actor.userId,
    },
    select: { id: true },
  })
  await tx.formField.createMany({
    data: fieldData(actor.organizationId, scopedProjectId, created.id, input.fields),
  })
  await writeAuditLog(tx, actor, {
    projectId: scopedProjectId,
    action,
    entityType: 'DigitalForm',
    entityId: created.id,
    changes: { code: input.code, version: 1, fieldCount: input.fields.length, ...origin },
  })
  return mapForm(await findForm(tx, actor, scopedProjectId, created.id), actor)
}

async function currentDefinition(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  formId: string,
  candidateFingerprint: string | null,
) {
  // Current header, exact source digest and conditional projection share one
  // statement snapshot. Cache hits avoid returning/hydrating the field payload.
  // Fixed JSON tuples bind every returned header/field value, without repeating
  // property names or unrelated audit timestamps/scope columns. Native JSON
  // escaping preserves boundaries; 1KiB per row conservatively bounds omitted
  // fixed-name/scope serialization overhead inside the unchanged 256KiB cap.
  const rows = await tx.$queryRaw<
    Array<{
      status: string
      fingerprint: string | null
      fieldCount: number
      sourceBytes: bigint
      payload: ReturnType<typeof mapForm> | null
    }>
  >`
      WITH form AS (
        SELECT f.*, json_build_array(f.id,f.project_id,f.code,f.version,f.name,f.description,f.form_type,f.status,
          f.activity_id,f.journey_stage_id,f.created_by_id,f.published_at,f.archived_at,f.updated_at)::text AS source
        FROM pathways.digital_forms f
        WHERE organization_id=${actor.organizationId}::uuid AND project_id=${projectId}::uuid AND id=${formId}::uuid
      ), fields AS (
        SELECT f.*, json_build_array(f.id,f.code,f.label,f.data_type,f.is_required,f.is_metadata_key,f.is_saddd_field,
          f.allowed_values,f.minimum_value,f.maximum_value,f.minimum_date,f.maximum_date,
          f.minimum_length,f.maximum_length,f.source_names,f.value_aliases,f.import_default,f.rule,f.sequence_no)::text AS source
        FROM pathways.form_fields f
        WHERE organization_id=${actor.organizationId}::uuid AND project_id=${projectId}::uuid AND form_id=${formId}::uuid
        ORDER BY sequence_no,id LIMIT 101
      ), stats AS (
        SELECT count(*)::integer AS count,
          coalesce(sum(octet_length(source)+1024),0)::bigint AS bytes FROM fields
      ), snapshot AS (
        SELECT form.*, stats.count AS field_count, stats.bytes + octet_length(form.source)+1024 AS source_bytes,
          CASE WHEN stats.count<=100 AND stats.bytes+octet_length(form.source)+1024<=262144 THEN
            encode(pg_catalog.sha256(convert_to('['||form.source||',['||
              (SELECT coalesce(string_agg(source,',' ORDER BY id),'') FROM fields)||']]','UTF8')),'hex')
            ELSE NULL END AS fingerprint FROM form CROSS JOIN stats
      )
      SELECT status::text, fingerprint, field_count AS "fieldCount", source_bytes AS "sourceBytes",
        CASE WHEN fingerprint IS NULL OR (status='PUBLISHED' AND fingerprint=${candidateFingerprint}::text) THEN NULL ELSE
          jsonb_build_object('id',id,'projectId',project_id,'code',code,'version',version,'name',name,
            'description',description,'formType',form_type,'status',status,'activityId',activity_id,
            'journeyStageId',journey_stage_id,'updatedAt',to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'createdByCurrentUser',coalesce(created_by_id=${actor.userId}::uuid,false),
            'fields',(SELECT coalesce(jsonb_agg(jsonb_build_object(
              'id',id,'code',code,'label',label,'dataType',data_type,'required',is_required,
              'metadataKey',is_metadata_key,'sadddField',is_saddd_field,
              'allowedValues',CASE WHEN jsonb_typeof(allowed_values)='array' THEN
                CASE WHEN NOT EXISTS(SELECT FROM jsonb_array_elements(allowed_values) v WHERE jsonb_typeof(v)<>'string') THEN allowed_values ELSE NULL END ELSE NULL END,
              'minimumLength',minimum_length,'maximumLength',maximum_length,'sourceNames',to_jsonb(source_names),'sequence',sequence_no
            ) || jsonb_strip_nulls(jsonb_build_object(
              'minimumValue',CASE WHEN minimum_value=trunc(minimum_value) THEN trunc(minimum_value)::text ELSE trim(trailing '.' from trim(trailing '0' from minimum_value::text)) END,
              'maximumValue',CASE WHEN maximum_value=trunc(maximum_value) THEN trunc(maximum_value)::text ELSE trim(trailing '.' from trim(trailing '0' from maximum_value::text)) END,
              'minimumDate',to_char(minimum_date,'YYYY-MM-DD'),'maximumDate',to_char(maximum_date,'YYYY-MM-DD'),
              'valueAliases',value_aliases,'importDefault',import_default,'rule',rule
            )) ORDER BY sequence_no,id),'[]'::jsonb) FROM fields)
          ) || jsonb_strip_nulls(jsonb_build_object(
            'publishedAt',to_char(published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'archivedAt',to_char(archived_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          )) END AS payload FROM snapshot`
  return rows[0] ?? null
}
