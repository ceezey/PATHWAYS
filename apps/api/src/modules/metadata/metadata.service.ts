import { BadRequestException, Inject, Injectable } from '@nestjs/common'

import type {
  CreateFormRequest,
  FormValidationMode,
  FormVersionRequest,
  GenerateFormRequest,
  ListSubmissionsQuery,
  SaveSubmissionRequest,
  SubmitSubmissionRequest,
  UpdateFormRequest,
  UpdateSubmissionRequest,
} from '@pathways/shared'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { PrismaService } from '../../prisma/prisma.service'
import { ParticipantsService } from '../participants/participants.service'
import {
  createDraftForm,
  generateDraftForm,
  listProjectForms,
  readFormDefinition,
} from './form-definitions.service'
import {
  listOwnSubmissions,
  readSubmission,
  readSubmissionByClientId,
  validateFormValues,
  validateStoredSubmission,
} from './form-submission-reads.service'
import {
  saveDraftSubmission,
  submitDraftSubmission,
  updateDraftSubmission,
} from './form-submissions.service'
import { formTemplates } from './form-templates'
import {
  archiveFormVersion,
  createNextFormVersion,
  publishFormVersion,
  updateFormDefinition,
} from './form-versions.service'
import { assertDefinition } from './metadata.helpers'
import type { CachedFormDefinition } from './metadata.mapper'
import { PublishedDefinitionCache } from './published-definition-cache'

// Form definition and direct entry routes; each opens one authorized transaction and delegates to a form module.
@Injectable()
export class MetadataService {
  private readonly publishedDefinitions = new PublishedDefinitionCache<CachedFormDefinition>()
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ParticipantsService) private readonly participants: ParticipantsService,
  ) {}

  listForms(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.read', (tx, actor) =>
      listProjectForms(tx, actor, projectId),
    )
  }

  getForm(identity: ApplicationIdentity, projectId: string, formId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.read', (tx, actor) =>
      readFormDefinition(tx, actor, projectId, formId, this.publishedDefinitions),
    )
  }

  createForm(identity: ApplicationIdentity, projectId: string, input: CreateFormRequest) {
    assertDefinition(input)
    return withAuthorizedOperation(this.prisma, identity, 'forms.manage', (tx, actor) =>
      createDraftForm(tx, actor, projectId, input),
    )
  }

  /**
   * `forms.generate`: new version-1 draft from a server-owned template or an
   * existing form in the same scoped project. Exactly one source is allowed.
   */
  async generateForm(identity: ApplicationIdentity, projectId: string, input: GenerateFormRequest) {
    const hasTemplate = input.templateKey !== undefined
    const hasSource = input.sourceFormId !== undefined
    if (hasTemplate === hasSource)
      throw new BadRequestException('Provide exactly one of templateKey or sourceFormId.')
    if (hasTemplate && !Object.hasOwn(formTemplates, input.templateKey as string))
      throw new BadRequestException('Unknown form template.')
    return withAuthorizedOperation(this.prisma, identity, 'forms.generate', (tx, actor) =>
      generateDraftForm(tx, actor, projectId, input, hasTemplate),
    )
  }

  updateForm(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    input: UpdateFormRequest,
  ) {
    assertDefinition(input)
    return withAuthorizedOperation(this.prisma, identity, 'forms.manage', (tx, actor) =>
      updateFormDefinition(tx, actor, projectId, formId, input, this.publishedDefinitions),
    )
  }

  publishForm(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    input: FormVersionRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.publish', (tx, actor) =>
      publishFormVersion(tx, actor, projectId, formId, input, this.publishedDefinitions),
    )
  }

  archiveForm(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    input: FormVersionRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.archive', (tx, actor) =>
      archiveFormVersion(tx, actor, projectId, formId, input, this.publishedDefinitions),
    )
  }

  newVersion(identity: ApplicationIdentity, projectId: string, formId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.manage', (tx, actor) =>
      createNextFormVersion(tx, actor, projectId, formId),
    )
  }

  validateValues(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    values: unknown,
    mode: FormValidationMode = 'final',
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      validateFormValues(tx, actor, projectId, formId, values, mode),
    )
  }

  saveSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    input: SaveSubmissionRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      saveDraftSubmission(tx, actor, projectId, formId, input),
    )
  }

  listSubmissions(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    query: ListSubmissionsQuery,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      listOwnSubmissions(tx, actor, projectId, formId, query),
    )
  }

  updateSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    submissionId: string,
    input: UpdateSubmissionRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      updateDraftSubmission(tx, actor, projectId, formId, submissionId, input),
    )
  }

  getSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    submissionId: string,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      readSubmission(tx, actor, projectId, formId, submissionId),
    )
  }

  getSubmissionByClientId(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    clientSubmissionId: string,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      readSubmissionByClientId(tx, actor, projectId, formId, clientSubmissionId),
    )
  }

  validateSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    submissionId: string,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      validateStoredSubmission(tx, actor, projectId, formId, submissionId),
    )
  }

  submitSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    submissionId: string,
    input: SubmitSubmissionRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      submitDraftSubmission(tx, actor, this.participants, projectId, formId, submissionId, input),
    )
  }
}
