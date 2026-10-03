import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Activity, JourneyStageConfig, JourneyStageType } from '@/types/pathways'

import { stageTypes } from './journey-config-utils'

type DetailsProps = {
  stage: JourneyStageConfig
  stages: JourneyStageConfig[]
  activities: Pick<Activity, 'id' | 'title' | 'journeyStageId'>[]
  canEdit: boolean
  onChange: <Key extends keyof JourneyStageConfig>(key: Key, value: JourneyStageConfig[Key]) => void
}

export const JourneyStageDetails = ({
  stage,
  stages,
  activities,
  canEdit,
  onChange,
}: DetailsProps) => {
  const toggle = (id: string) =>
    onChange(
      'mappedActivityIds',
      stage.mappedActivityIds.includes(id)
        ? stage.mappedActivityIds.filter((item) => item !== id)
        : [...stage.mappedActivityIds, id],
    )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Label className="space-y-2">
          <span>Stage code</span>
          <Input
            disabled={!canEdit}
            value={stage.code}
            onChange={(event) => onChange('code', event.target.value)}
          />
        </Label>
        <Label className="space-y-2">
          <span>Stage name</span>
          <Input
            disabled={!canEdit}
            value={stage.name}
            onChange={(event) => onChange('name', event.target.value)}
          />
        </Label>
      </div>
      <Label className="space-y-2">
        <span>Stage type</span>
        <Select
          disabled={!canEdit}
          value={stage.type}
          onValueChange={(value) => onChange('type', value as JourneyStageType)}
        >
          <SelectTrigger aria-label="Journey stage type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stageTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
      {stage.type === 'Branch' ? (
        <Label className="space-y-2">
          <span>Parent stage</span>
          <Select
            disabled={!canEdit}
            value={stage.parentStageId ?? ''}
            onValueChange={(value) => onChange('parentStageId', value)}
          >
            <SelectTrigger aria-label="Parent journey stage">
              <SelectValue placeholder="Select a parent stage" />
            </SelectTrigger>
            <SelectContent>
              {stages
                .filter((item) => item.id !== stage.id && !item.parentStageId)
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.code} · {item.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Label>
      ) : null}
      <Label className="flex items-center gap-3 rounded-md border border-border bg-background p-3">
        <input
          className="h-4 w-4 rounded border-border"
          disabled={!canEdit}
          type="checkbox"
          checked={stage.terminal}
          onChange={(event) => onChange('terminal', event.target.checked)}
        />
        This is an end stage
      </Label>
      <Label className="space-y-2">
        <span>Description</span>
        <Textarea
          disabled={!canEdit}
          value={stage.description}
          onChange={(event) => onChange('description', event.target.value)}
        />
      </Label>
      <div className="space-y-2">
        <h3 className="font-medium text-foreground">Activity mappings</h3>
        {activities.length > 0 ? (
          activities.map((activity) => (
            <Label
              key={activity.id}
              className="flex items-center gap-3 rounded-md border border-border bg-background p-3"
            >
              <input
                className="h-4 w-4 rounded border-border"
                disabled={!canEdit}
                type="checkbox"
                checked={stage.mappedActivityIds.includes(activity.id)}
                onChange={() => toggle(activity.id)}
              />
              <span className="text-sm text-foreground">{activity.title}</span>
            </Label>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No project activities are available for mapping.
          </p>
        )}
      </div>
    </div>
  )
}
