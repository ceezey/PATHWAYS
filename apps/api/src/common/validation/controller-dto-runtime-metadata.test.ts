import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

type ControllerCase = {
  file: string
  dtoNames: string[]
}

const cases: ControllerCase[] = [
  {
    file: 'src/modules/activities/activities.controller.ts',
    dtoNames: [
      'CreateActivityDto',
      'ReviewActivityUpdateDto',
      'SaveMilestoneDto',
      'SubmitActivityUpdateDto',
      'TransitionActivityDto',
      'UpdateActivityDto',
      'UpdateMilestoneDto',
    ],
  },
  {
    file: 'src/modules/beneficiaries/beneficiaries.controller.ts',
    dtoNames: [
      'ArchiveBeneficiaryDto',
      'BeneficiaryListQueryDto',
      'EnrollBeneficiaryDto',
      'RegisterBeneficiaryDto',
      'UpdateBeneficiaryDto',
    ],
  },
  {
    file: 'src/modules/imports/imports.controller.ts',
    dtoNames: [
      'ImportRowsQueryDto',
      'ProcessImportDto',
      'SaveImportMappingDto',
      'UploadImportDto',
      'ValidateImportDto',
    ],
  },
  {
    file: 'src/modules/metadata/metadata.controller.ts',
    dtoNames: [
      'CreateFormDto',
      'ExpectedVersionDto',
      'ListSubmissionsQueryDto',
      'SaveSubmissionDto',
      'SubmitSubmissionDto',
      'UpdateFormDto',
      'UpdateSubmissionDto',
      'ValidateValuesDto',
    ],
  },
  {
    file: 'src/modules/participants/participants.controller.ts',
    dtoNames: [
      'SaveJourneyConfigurationDto',
      'CorrectJourneyEventDto',
      'EnrollmentJourneyEventDto',
    ],
  },
  { file: 'src/modules/programs/programs.controller.ts', dtoNames: ['CreateProgramDto'] },
  {
    file: 'src/modules/projects/projects.controller.ts',
    dtoNames: ['CreateProjectDto', 'UpdateProjectDto'],
  },
  {
    file: 'src/modules/users/users.controller.ts',
    dtoNames: ['AuthorizeExistingUserDto', 'UpdateAuthorizedUserDto'],
  },
]

function compileController(file: string) {
  const source = readFileSync(path.join(process.cwd(), file), 'utf8')
  const compiled = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      isolatedModules: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  })
  expect(
    compiled.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error),
  ).toEqual([])
  return { source, output: compiled.outputText }
}

function metadataLines(output: string) {
  return output.split(/\r?\n/).filter((line) => line.includes('__metadata("design:paramtypes"'))
}

describe('Nest controller DTO runtime metadata', () => {
  it.each(cases)(
    '$file retains DTO constructors for ValidationPipe metadata',
    ({ file, dtoNames }) => {
      const { source, output } = compileController(file)
      const metadata = metadataLines(output)

      for (const dtoName of dtoNames) {
        expect(source).not.toMatch(
          new RegExp(`import\\s+type\\s*\\{[^}]*\\b${dtoName}\\b[^}]*\\}\\s*from`),
        )
        expect(metadata.some((line) => line.includes(`.${dtoName}`))).toBe(true)
      }
    },
  )
})
