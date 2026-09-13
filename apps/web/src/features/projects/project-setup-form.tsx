'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { ProjectStatus } from '@/types/pathways'
import { type ProjectSetupSchema, projectSetupSchema } from './project-form-validation'

const projectStatuses: ProjectStatus[] = ['Active', 'Needs Attention', 'Planned', 'Completed']

export const ProjectSetupForm = () => {
  const router = useRouter()
  const form = useForm<ProjectSetupSchema>({
    resolver: zodResolver(projectSetupSchema),
    defaultValues: {
      code: '',
      title: '',
      implementationArea: '',
      startDate: '',
      endDate: '',
      status: 'Planned',
      description: '',
      objectives: '',
    },
  })

  const onSubmit = async (values: ProjectSetupSchema) => {
    try {
      const project = await pathwaysClient.createProject(values)
      toast.success('Project saved.', { description: 'The project profile is now persisted.' })
      router.push(`/projects/${project.id}`)
      router.refresh()
    } catch {
      toast.error('Project could not be saved.', {
        description: 'Your entries remain available. Reload your access and try again.',
      })
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Project setup"
        title="Create project"
        description="Create a private project profile inside your authorized organization."
        actions={
          <Button asChild className="gap-2" variant="outline">
            <Link href="/projects">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Projects
            </Link>
          </Button>
        }
      />
      <SectionCard
        title="Project information"
        description="Required fields are validated by both the browser and API."
      >
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-5 lg:grid-cols-2">
              <TextField
                control={form.control}
                name="code"
                label="Project code"
                placeholder="PRJ-2026-001"
              />
              <TextField
                control={form.control}
                name="title"
                label="Project title"
                placeholder="Community Resilience Project"
              />
              <TextField
                control={form.control}
                name="implementationArea"
                label="Implementation area"
                placeholder="Metro Manila"
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projectStatuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <TextField control={form.control} name="startDate" label="Start date" type="date" />
              <TextField control={form.control} name="endDate" label="End date" type="date" />
            </div>
            <TextField
              control={form.control}
              name="description"
              label="Description"
              placeholder="Describe the project scope and intended participants."
            />
            <TextField
              control={form.control}
              name="objectives"
              label="Objectives"
              placeholder="Describe the project objectives."
            />
            <div className="flex justify-end gap-3">
              <Button asChild variant="outline">
                <Link href="/projects">Cancel</Link>
              </Button>
              <Button className="gap-2" disabled={form.formState.isSubmitting} type="submit">
                {form.formState.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Save project
              </Button>
            </div>
          </form>
        </Form>
      </SectionCard>
    </>
  )
}

function TextField({
  control,
  name,
  label,
  placeholder,
  type = 'text',
}: {
  control: ReturnType<typeof useForm<ProjectSetupSchema>>['control']
  name: keyof ProjectSetupSchema
  label: string
  placeholder?: string
  type?: string
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} placeholder={placeholder} type={type} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
