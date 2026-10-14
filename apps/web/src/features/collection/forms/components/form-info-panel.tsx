'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ActivitySummary, ProjectSummary } from '@/types/pathways'

import { formTypeLabels } from '../../collection.copy'
import { JourneyStageSelector } from './journey-stage-selector'

export const FormInfoPanel = ({
  showHeading = false,
  formTitle,
  formType,
  journeyStage,
  linkedActivityId,
  projectActivities,
  projects,
  projectsLoaded,
  projectId,
  setFormTitle,
  setFormType,
  setJourneyStage,
  setLinkedActivityId,
  setProjectId,
}: {
  showHeading?: boolean
  formTitle: string
  formType: string
  journeyStage: string
  linkedActivityId: string
  projectActivities: ActivitySummary[]
  projects: ProjectSummary[]
  projectsLoaded: boolean
  projectId: string
  setFormTitle: (value: string) => void
  setFormType: (value: string) => void
  setJourneyStage: (value: string) => void
  setLinkedActivityId: (value: string) => void
  setProjectId: (value: string) => void
}) => (
  <Card>
    {showHeading ? (
      <CardHeader>
        <CardTitle>Form configuration</CardTitle>
      </CardHeader>
    ) : null}
    <CardContent className={cn('grid gap-4 md:grid-cols-2', !showHeading && 'pt-5')}>
      <div className="space-y-2">
        <Label htmlFor="form-title">Form title</Label>
        <Input
          id="form-title"
          value={formTitle}
          onChange={(event) => setFormTitle(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Form type</Label>
        <Select value={formType} onValueChange={setFormType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(formTypeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="collection-project-select">Project selection</Label>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger id="collection-project-select">
            <SelectValue
              placeholder={projectsLoaded ? 'No projects available' : 'Loading projects...'}
            />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <JourneyStageSelector
          projectId={projectId}
          value={journeyStage}
          onChange={setJourneyStage}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Linked activity</Label>
        <Select value={linkedActivityId} onValueChange={setLinkedActivityId}>
          <SelectTrigger>
            <SelectValue placeholder="Select an activity" />
          </SelectTrigger>
          <SelectContent>
            {projectActivities.map((activity) => (
              <SelectItem key={activity.id} value={activity.id}>
                {activity.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </CardContent>
  </Card>
)
