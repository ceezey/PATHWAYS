'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { type FieldType, type FormField, dataTypeLabels } from '../../collection.utils'
import type { MappingStatus } from '../../import/collection-import-state'
import { fieldCodeFromText, fieldCodeWhileTyping } from '../digital-form-contract'
import { FieldIntakeEditor } from './field-intake-editor'
import { ToggleRow } from './toggle-row'

export const FieldEditor = ({
  field,
  fieldCodes,
  readOnly,
  attention,
  updateField,
}: {
  field: FormField
  fieldCodes: string[]
  readOnly: boolean
  attention?: boolean
  updateField: (fieldId: string, patch: Partial<FormField>) => void
}) => (
  <div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-2">
    <div className="space-y-2">
      <Label htmlFor={`${field.id}-label`}>Field label</Label>
      <Input
        id={`${field.id}-label`}
        value={field.label}
        onChange={(event) => updateField(field.id, { label: event.target.value })}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${field.id}-code`}>Field code</Label>
      <Input
        id={`${field.id}-code`}
        value={field.code}
        onChange={(event) =>
          updateField(field.id, { code: fieldCodeWhileTyping(event.target.value) })
        }
        onBlur={(event) => updateField(field.id, { code: fieldCodeFromText(event.target.value) })}
      />
    </div>
    <div className="space-y-2">
      <Label>Data type</Label>
      <Select
        value={field.type}
        onValueChange={(value) => updateField(field.id, { type: value as FieldType })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(dataTypeLabels).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <Label>Mapping status</Label>
      <Select
        value={field.mappingStatus}
        onValueChange={(value) => updateField(field.id, { mappingStatus: value as MappingStatus })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mapped">Mapped</SelectItem>
          <SelectItem value="unmapped">Unmapped</SelectItem>
          <SelectItem value="ignored">Ignored</SelectItem>
          <SelectItem value="invalid">Invalid</SelectItem>
        </SelectContent>
      </Select>
    </div>
    {(field.type === 'single_select' || field.type === 'multi_select') && (
      <div className="space-y-2 md:col-span-2">
        <p className="text-sm font-medium">Allowed values</p>
        {field.allowedValues.map((value, index) => (
          <div key={`${field.id}-option-${index}`} className="flex gap-2">
            <Label className="sr-only" htmlFor={`${field.id}-option-${index}`}>
              Option {index + 1}
            </Label>
            <Input
              id={`${field.id}-option-${index}`}
              value={value}
              onChange={(event) =>
                updateField(field.id, {
                  allowedValues: field.allowedValues.map((option, i) =>
                    i === index ? event.target.value : option,
                  ),
                })
              }
            />
            <Button
              type="button"
              variant="outline"
              aria-label={`Remove option ${index + 1}`}
              onClick={() =>
                updateField(field.id, {
                  allowedValues: field.allowedValues.filter((_, i) => i !== index),
                })
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => updateField(field.id, { allowedValues: [...field.allowedValues, ''] })}
        >
          Add option
        </Button>
      </div>
    )}
    {(field.type === 'integer' || field.type === 'decimal' || field.type === 'date') && (
      <>
        <div className="space-y-2">
          <Label htmlFor={`${field.id}-minimum`}>
            Minimum {field.type === 'date' ? 'date' : 'value'}
          </Label>
          <Input
            id={`${field.id}-minimum`}
            type={field.type === 'date' ? 'date' : 'text'}
            value={field.minimumValue}
            onChange={(event) => updateField(field.id, { minimumValue: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${field.id}-maximum`}>
            Maximum {field.type === 'date' ? 'date' : 'value'}
          </Label>
          <Input
            id={`${field.id}-maximum`}
            type={field.type === 'date' ? 'date' : 'text'}
            value={field.maximumValue}
            onChange={(event) => updateField(field.id, { maximumValue: event.target.value })}
          />
        </div>
      </>
    )}
    {(field.type === 'text' || field.type === 'long_text' || field.type === 'multi_select') && (
      <>
        <div className="space-y-2">
          <Label htmlFor={`${field.id}-min-length`}>
            Minimum {field.type === 'multi_select' ? 'selections' : 'length'}
          </Label>
          <Input
            id={`${field.id}-min-length`}
            type="number"
            min="0"
            value={field.minimumLength}
            onChange={(event) => updateField(field.id, { minimumLength: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${field.id}-max-length`}>
            Maximum {field.type === 'multi_select' ? 'selections' : 'length'}
          </Label>
          <Input
            id={`${field.id}-max-length`}
            type="number"
            min="1"
            value={field.maximumLength}
            onChange={(event) => updateField(field.id, { maximumLength: event.target.value })}
          />
        </div>
      </>
    )}
    <div className="grid gap-2 sm:grid-cols-3 md:col-span-2">
      <ToggleRow
        checked={field.required}
        label="Required"
        onChange={(checked) => updateField(field.id, { required: checked })}
      />
      <ToggleRow
        checked={field.metadataKey}
        label="Metadata key"
        onChange={(checked) => updateField(field.id, { metadataKey: checked })}
      />
      <ToggleRow
        checked={field.sadddField}
        label="SADDD field"
        onChange={(checked) => updateField(field.id, { sadddField: checked })}
      />
    </div>
    <FieldIntakeEditor
      field={field}
      fieldCodes={fieldCodes}
      readOnly={readOnly}
      attention={attention}
      onChange={(patch) => updateField(field.id, patch)}
    />
  </div>
)
