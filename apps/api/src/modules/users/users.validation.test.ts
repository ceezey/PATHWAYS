import 'reflect-metadata'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import * as nestCommon from '@nestjs/common'
import type { Type } from '@nestjs/common'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { RequirePermission } from '@app/common/decorators/permission.decorator'
import { AuthorizeExistingUserDto, UpdateAuthorizedUserDto } from './users.dto'

/**
 * Vitest/esbuild does not emit Nest's design:paramtypes metadata. Compile the actual
 * controller with TypeScript here, preserving the Nest build's decorator flags.
 * Only the UsersService import is replaced. No service, API or provider is called.
 */
function controllerBodyType(method: 'authorizeExisting' | 'update', index: number): Type<unknown> {
  const source = readFileSync(path.join(__dirname, 'users.controller.ts'), 'utf8')
  const compiled = ts.transpileModule(source, {
    fileName: 'users.controller.ts',
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

  class UnusedUsersService {}
  const imports: Record<string, unknown> = {
    '@nestjs/common': nestCommon,
    '@app/common/decorators/permission.decorator': { RequirePermission },
    './users.dto': { AuthorizeExistingUserDto, UpdateAuthorizedUserDto },
    './users.service': { UsersService: UnusedUsersService },
  }
  const moduleValue: { exports: Record<string, unknown> } = { exports: {} }
  runInNewContext(
    compiled.outputText,
    {
      exports: moduleValue.exports,
      module: moduleValue,
      Reflect,
      require: (name: string) => {
        if (!Object.hasOwn(imports, name)) throw new Error('Unexpected controller test import.')
        return imports[name]
      },
    },
    { timeout: 1000 },
  )
  const controller = moduleValue.exports.UsersController
  if (typeof controller !== 'function') throw new Error('Controller export is missing.')
  const types: unknown = Reflect.getMetadata('design:paramtypes', controller.prototype, method)
  if (!Array.isArray(types) || typeof types[index] !== 'function') {
    throw new Error('Controller body metadata is missing.')
  }
  return types[index] as Type<unknown>
}

// Match the existing main.ts policy; do not weaken validation for the fix.
const pipe = new nestCommon.ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})
const updateBody = {
  fullName: 'Synthetic Test User',
  role: 'PROGRAM_MANAGER',
  accountStatus: 'ACTIVE',
  projectIds: [],
}
const authorizeBody = {
  authUserId: '71000000-0000-4000-8000-000000000001',
  fullName: 'Synthetic Test User',
  role: 'PROGRAM_MANAGER',
  projectIds: [],
}

const updateType = controllerBodyType('update', 2)
const authorizeType = controllerBodyType('authorizeExisting', 1)

describe('P07 user DTO runtime validation (no database or provider)', () => {
  it('retains both real DTO classes in controller parameter metadata', () => {
    expect(updateType).toBe(UpdateAuthorizedUserDto)
    expect(authorizeType).toBe(AuthorizeExistingUserDto)
  })

  it('accepts the four declared update fields without authorizing a user change', async () => {
    const value = await pipe.transform({ ...updateBody }, { type: 'body', metatype: updateType })
    expect(value).toBeInstanceOf(UpdateAuthorizedUserDto)
    expect(value).toMatchObject(updateBody)
  })

  it('accepts an existing-identity authorization payload without contacting Auth', async () => {
    const value = await pipe.transform(
      { ...authorizeBody },
      { type: 'body', metatype: authorizeType },
    )
    expect(value).toBeInstanceOf(AuthorizeExistingUserDto)
    expect(value).toMatchObject(authorizeBody)
  })

  it.each(['organizationId', 'permissions', 'authUserId'])(
    'rejects extra update field %s',
    async (key) => {
      await expect(
        pipe.transform(
          { ...updateBody, [key]: 'not-allowed' },
          { type: 'body', metatype: updateType },
        ),
      ).rejects.toBeInstanceOf(nestCommon.BadRequestException)
    },
  )

  it.each([
    { role: 'UNRECOGNIZED_ROLE' },
    { accountStatus: 'UNKNOWN_STATE' },
    { projectIds: ['not-a-uuid'] },
    { projectIds: 'not-an-array' },
  ])('rejects invalid declared values: %j', async (change) => {
    await expect(
      pipe.transform({ ...updateBody, ...change }, { type: 'body', metatype: updateType }),
    ).rejects.toBeInstanceOf(nestCommon.BadRequestException)
  })

  it('reproduces the original whitelist failure when the metatype is Function instead of the DTO', async () => {
    await expect(
      pipe.transform({ ...updateBody }, { type: 'body', metatype: Function }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: expect.arrayContaining(
          Object.keys(updateBody).map((key) => `property ${key} should not exist`),
        ),
      },
    })
  })
})
