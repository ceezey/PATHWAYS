'use client'

import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  HandHeart,
  ImageIcon,
  MapPin,
  MessageSquareQuote,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ProgressBar } from '@/components/pathways/progress-bar'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import type {
  PublicDashboardLayoutPreset,
  PublicDashboardPresentation,
  PublicDashboardSectionId,
  PublicProjectRecord,
} from '@/types/pathways'

import {
  PUBLIC_DONATE_CTA_LABEL,
  getPublicDashboardStorageKey,
  publicCtaDestinations,
  publicDashboardLayoutPresets,
  publicDashboardSections,
  sanitizePublicDashboardPresentation,
} from './public-dashboard-config'
import { PublicIndicatorChart, PublicProgressTrendChart } from './public-project-charts'

const indicatorTone = (status: PublicProjectRecord['selectedIndicators'][number]['status']) =>
  status === 'Completed' ? 'success' : status === 'On Track' ? 'info' : 'warning'

const requiredTextFields: Array<keyof PublicDashboardPresentation> = [
  'eyebrow',
  'headline',
  'summaryTitle',
  'summaryBody',
  'quote',
  'quoteAttribution',
  'closingTitle',
  'closingText',
  'secondaryCtaLabel',
]

const layoutWidthClasses: Record<PublicDashboardLayoutPreset, string> = {
  'story-led': 'max-w-7xl',
  balanced: 'max-w-6xl',
  compact: 'max-w-5xl',
}

const layoutContentClasses: Record<PublicDashboardLayoutPreset, string> = {
  'story-led': 'space-y-10 py-10 sm:py-14',
  balanced: 'space-y-8 py-8 sm:py-12',
  compact: 'space-y-6 py-7 sm:py-9',
}

type PublicProjectDetailMode = 'public' | 'staff-preview'

export const PublicProjectDetail = ({
  mode = 'public',
  project,
}: {
  mode?: PublicProjectDetailMode
  project: PublicProjectRecord
}) => {
  const defaults = project.publicPresentation
  const editable = mode === 'staff-preview'
  const [presentation, setPresentation] = useState(defaults)
  const [draft, setDraft] = useState(defaults)
  const [editorOpen, setEditorOpen] = useState(false)
  const [donationOpen, setDonationOpen] = useState(false)
  const [editorError, setEditorError] = useState('')
  const [hydrated, setHydrated] = useState(!editable)

  useEffect(() => {
    if (!editable) {
      setPresentation(defaults)
      setDraft(defaults)
      setHydrated(true)
      return
    }

    try {
      const stored = window.localStorage.getItem(getPublicDashboardStorageKey(project.id))

      if (stored) {
        setPresentation(sanitizePublicDashboardPresentation(JSON.parse(stored), defaults))
      }
    } catch {
      setPresentation(defaults)
    }

    setHydrated(true)
  }, [defaults, editable, project.id])

  const openEditor = () => {
    if (!editable) {
      return
    }

    setDraft(presentation)
    setEditorError('')
    setEditorOpen(true)
  }

  const updateDraft = (field: keyof PublicDashboardPresentation, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setEditorError('')
  }

  const moveSection = (sectionId: PublicDashboardSectionId, direction: -1 | 1) => {
    setDraft((current) => {
      const currentIndex = current.sectionOrder.indexOf(sectionId)
      const nextIndex = currentIndex + direction

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.sectionOrder.length) {
        return current
      }

      const nextOrder = [...current.sectionOrder]
      ;[nextOrder[currentIndex], nextOrder[nextIndex]] = [
        nextOrder[nextIndex],
        nextOrder[currentIndex],
      ]

      return { ...current, sectionOrder: nextOrder }
    })
    setEditorError('')
  }

  const toggleSection = (sectionId: PublicDashboardSectionId) => {
    const isVisible = draft.visibleSections.includes(sectionId)

    if (isVisible && draft.visibleSections.length === 1) {
      setEditorError('Keep at least one public content section visible.')
      return
    }

    const visibleSections = isVisible
      ? draft.visibleSections.filter((item) => item !== sectionId)
      : [...draft.visibleSections, sectionId]

    setDraft({ ...draft, visibleSections })
    setEditorError('')
  }

  const savePresentation = () => {
    if (!editable) {
      return
    }

    if (requiredTextFields.some((field) => !String(draft[field]).trim())) {
      setEditorError('Complete every public text and CTA label before saving this preview.')
      return
    }

    if (draft.visibleSections.length === 0) {
      setEditorError('Keep at least one public content section visible.')
      return
    }

    const normalized = sanitizePublicDashboardPresentation(draft, defaults)

    try {
      window.localStorage.setItem(
        getPublicDashboardStorageKey(project.id),
        JSON.stringify(normalized),
      )
      setPresentation(normalized)
      setDraft(normalized)
      setEditorOpen(false)
      toast.success('Public prototype view updated.', {
        description: 'The preview changed only in this browser and was not published.',
      })
    } catch {
      setEditorError('This browser could not save the prototype view. Try again.')
    }
  }

  const restoreDefaults = () => {
    if (!editable) {
      return
    }

    try {
      window.localStorage.removeItem(getPublicDashboardStorageKey(project.id))
      setPresentation(defaults)
      setDraft(defaults)
      setEditorOpen(false)
      toast.success('Default public layout restored.', {
        description: `The approved ${project.title} presentation is visible again.`,
      })
    } catch {
      setEditorError('This browser could not restore the default view. Try again.')
    }
  }

  const sectionContent: Record<PublicDashboardSectionId, React.ReactNode> = {
    overview: <PublicOverview project={project} presentation={presentation} />,
    media: <PublicMediaGallery layoutPreset={presentation.layoutPreset} project={project} />,
    progress: <PublicProgress project={project} />,
    indicators: <PublicIndicators project={project} />,
    milestones: <PublicMilestones project={project} />,
  }
  const Root = editable ? 'div' : 'main'

  return (
    <Root
      className="min-h-screen bg-slate-50"
      data-public-layout={presentation.layoutPreset}
      data-public-mode={mode}
    >
      {editable ? (
        <section className="border-b border-blue-200 bg-blue-50">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-start gap-3 text-sm text-blue-950 sm:items-center">
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 sm:mt-0"
                aria-hidden="true"
              />
              <p className="leading-5">
                <span className="font-semibold">Staff-only prototype preview.</span> Browser-local
                changes are not published to the anonymous public page.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="gap-2" size="sm" variant="outline">
                <Link href={`/projects/${project.id}/transparency`}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back to project controls
                </Link>
              </Button>
              <Button
                className="gap-2"
                disabled={!hydrated}
                onClick={openEditor}
                size="sm"
                type="button"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Edit staff preview
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="border-b border-teal-100 bg-teal-50">
          <div className="mx-auto flex w-full max-w-7xl items-start gap-3 px-4 py-3 text-sm text-teal-950 sm:items-center sm:px-6">
            <ShieldCheck
              className="mt-0.5 h-5 w-5 shrink-0 text-teal-700 sm:mt-0"
              aria-hidden="true"
            />
            <p className="leading-5">
              <span className="font-semibold">Approved public view.</span> Aggregate, non-sensitive
              project information only.
            </p>
          </div>
        </section>
      )}

      <section className="overflow-hidden bg-[radial-gradient(circle_at_top_right,#2563eb_0,transparent_38%),linear-gradient(135deg,#082f49,#115e59_62%,#0f766e)] text-white">
        <div
          className={cn(
            'mx-auto w-full px-4 py-8 sm:px-6 sm:py-12',
            layoutWidthClasses[presentation.layoutPreset],
          )}
        >
          <nav
            aria-label="Breadcrumb"
            className="mb-8 flex flex-wrap items-center gap-2 text-sm text-teal-50/80"
          >
            <Link className="transition-colors hover:text-white" href="/">
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <Link className="transition-colors hover:text-white" href="/public/projects">
              Public projects
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-white">{project.title}</span>
          </nav>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] lg:items-end">
            <div className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-50">
                  {presentation.eyebrow}
                </span>
                <span className="rounded-full border border-emerald-200/30 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-50">
                  {project.publicationState}
                </span>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-100">
                  {project.sector} · {project.area}
                </p>
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                  {project.title}
                </h1>
                <p className="max-w-3xl text-xl font-medium leading-8 text-white sm:text-2xl">
                  {presentation.headline}
                </p>
                <p className="max-w-2xl text-sm leading-7 text-teal-50/90">{project.tagline}</p>
              </div>
            </div>

            <blockquote className="rounded-2xl border border-white/20 bg-white/10 p-6 shadow-xl backdrop-blur-sm">
              <MessageSquareQuote className="h-8 w-8 text-teal-200" aria-hidden="true" />
              <p className="mt-5 text-lg font-medium leading-8 text-white">
                “{presentation.quote}”
              </p>
              <footer className="mt-5 border-t border-white/15 pt-4 text-sm text-teal-100">
                {presentation.quoteAttribution}
              </footer>
            </blockquote>
          </div>

          <div className="mt-9 grid overflow-hidden rounded-xl border border-white/15 bg-slate-950/20 sm:grid-cols-3">
            <HeroMetric label="Approved progress" value={`${project.progressTrend.at(-1) ?? 0}%`} />
            <HeroMetric
              label="Beneficiaries reached"
              value={project.beneficiariesReached.toLocaleString()}
            />
            <HeroMetric label="Project period" value={project.timeframe} />
          </div>
        </div>
      </section>

      <div
        className={cn(
          'mx-auto w-full px-4 sm:px-6',
          layoutWidthClasses[presentation.layoutPreset],
          layoutContentClasses[presentation.layoutPreset],
        )}
      >
        {presentation.sectionOrder
          .filter((sectionId) => presentation.visibleSections.includes(sectionId))
          .map((sectionId) => (
            <div data-public-section={sectionId} key={sectionId}>
              {sectionContent[sectionId]}
            </div>
          ))}
      </div>

      <section className="border-t border-slate-700 bg-slate-950 text-white">
        <div
          className={cn(
            'mx-auto grid w-full gap-7 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:py-14',
            layoutWidthClasses[presentation.layoutPreset],
          )}
        >
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
              Support this work
            </p>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight">
              {presentation.closingTitle}
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-slate-300">{presentation.closingText}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
            <Button className="gap-2" onClick={() => setDonationOpen(true)} variant="secondary">
              <HandHeart className="h-4 w-4" aria-hidden="true" />
              {PUBLIC_DONATE_CTA_LABEL}
            </Button>
            <Button
              asChild
              className="border-slate-500 bg-transparent text-white hover:bg-white/10"
              variant="outline"
            >
              <Link href={presentation.secondaryCtaHref}>{presentation.secondaryCtaLabel}</Link>
            </Button>
          </div>
        </div>
      </section>

      {editable ? (
        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Edit staff public-dashboard preview</DialogTitle>
              <DialogDescription>
                Reorder approved sections and update public-facing presentation copy for{' '}
                {project.title}. Changes stay in this staff browser and are not published.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
              Use approved, non-sensitive project wording only. This prototype does not provide a
              publishing workflow or access to internal records.
            </div>

            <div className="space-y-7 py-2">
              <EditorSection
                description="Set the public headline, approved summary, and stakeholder quote."
                title="Public story"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <EditorField
                    id="public-eyebrow"
                    label="Story label"
                    maxLength={52}
                    onChange={(value) => updateDraft('eyebrow', value)}
                    value={draft.eyebrow}
                  />
                  <EditorField
                    id="public-summary-title"
                    label="Summary heading"
                    maxLength={100}
                    onChange={(value) => updateDraft('summaryTitle', value)}
                    value={draft.summaryTitle}
                  />
                </div>
                <EditorTextarea
                  id="public-headline"
                  label="Public headline"
                  maxLength={140}
                  onChange={(value) => updateDraft('headline', value)}
                  value={draft.headline}
                />
                <EditorTextarea
                  id="public-summary"
                  label="Public summary"
                  maxLength={420}
                  onChange={(value) => updateDraft('summaryBody', value)}
                  value={draft.summaryBody}
                />
                <EditorTextarea
                  id="public-quote"
                  label="Project quote"
                  maxLength={280}
                  onChange={(value) => updateDraft('quote', value)}
                  value={draft.quote}
                />
                <EditorField
                  id="public-quote-attribution"
                  label="Quote attribution"
                  maxLength={90}
                  onChange={(value) => updateDraft('quoteAttribution', value)}
                  value={draft.quoteAttribution}
                />
              </EditorSection>

              <EditorSection
                description="Choose a card-density preset, then change the order or visibility of approved sections."
                title="Section layout"
              >
                <div className="space-y-2">
                  <Label htmlFor="public-layout-preset">Layout preset</Label>
                  <Select
                    onValueChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        layoutPreset: value as PublicDashboardLayoutPreset,
                      }))
                    }
                    value={draft.layoutPreset}
                  >
                    <SelectTrigger id="public-layout-preset">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {publicDashboardLayoutPresets.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.label} — {preset.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  {draft.sectionOrder.map((sectionId, index) => {
                    const section = publicDashboardSections.find((item) => item.id === sectionId)

                    if (!section) {
                      return null
                    }

                    const isVisible = draft.visibleSections.includes(sectionId)

                    return (
                      <div
                        className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center"
                        key={section.id}
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm font-semibold text-slate-700">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-950">{section.label}</p>
                            <p className="text-xs leading-5 text-slate-500">
                              {section.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 sm:justify-end">
                          <Button
                            aria-label={`Move ${section.label} up`}
                            disabled={index === 0}
                            onClick={() => moveSection(section.id, -1)}
                            size="icon"
                            type="button"
                            variant="outline"
                          >
                            <ChevronUp className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            aria-label={`Move ${section.label} down`}
                            disabled={index === draft.sectionOrder.length - 1}
                            onClick={() => moveSection(section.id, 1)}
                            size="icon"
                            type="button"
                            variant="outline"
                          >
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            aria-label={`${isVisible ? 'Hide' : 'Show'} ${section.label}`}
                            className="min-w-24 gap-2"
                            onClick={() => toggleSection(section.id)}
                            size="sm"
                            type="button"
                            variant={isVisible ? 'outline' : 'secondary'}
                          >
                            {isVisible ? (
                              <Eye className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <EyeOff className="h-4 w-4" aria-hidden="true" />
                            )}
                            {isVisible ? 'Shown' : 'Hidden'}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </EditorSection>

              <EditorSection
                description="Keep Donate Now as the fixed primary action and edit the surrounding donor copy and supporting navigation."
                title="Closing CTA block"
              >
                <EditorField
                  id="public-closing-title"
                  label="CTA heading"
                  maxLength={100}
                  onChange={(value) => updateDraft('closingTitle', value)}
                  value={draft.closingTitle}
                />
                <EditorTextarea
                  id="public-closing-text"
                  label="CTA supporting text"
                  maxLength={280}
                  onChange={(value) => updateDraft('closingText', value)}
                  value={draft.closingText}
                />
                <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
                  <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-teal-950">
                    <p className="font-semibold">Primary public CTA</p>
                    <p className="mt-1">
                      {PUBLIC_DONATE_CTA_LABEL} remains fixed and opens a clearly labeled prototype
                      donation notice until an approved external destination is supplied.
                    </p>
                  </div>
                  <CtaEditor
                    destination={draft.secondaryCtaHref}
                    id="public-secondary"
                    label="Supporting CTA"
                    onDestinationChange={(value) => updateDraft('secondaryCtaHref', value)}
                    onLabelChange={(value) => updateDraft('secondaryCtaLabel', value)}
                    value={draft.secondaryCtaLabel}
                  />
                </div>
              </EditorSection>
            </div>

            {editorError ? (
              <p className="text-sm font-medium text-destructive" role="alert">
                {editorError}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button className="gap-2" onClick={restoreDefaults} type="button" variant="outline">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Restore project defaults
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button onClick={() => setEditorOpen(false)} type="button" variant="outline">
                  Cancel
                </Button>
                <Button className="gap-2" onClick={savePresentation} type="button">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Save prototype view
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog open={donationOpen} onOpenChange={setDonationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Donate to {project.title}</DialogTitle>
            <DialogDescription>
              This public prototype does not connect to a payment or fundraising service.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <StatusBadge tone="info">Prototype-only action</StatusBadge>
            <p className="text-sm leading-6 text-muted-foreground">
              The organization-approved donation destination will be connected during a future
              deployment step. No payment details are requested or collected here.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setDonationOpen(false)} type="button">
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Root>
  )
}

const PublicOverview = ({
  project,
  presentation,
}: {
  project: PublicProjectRecord
  presentation: PublicDashboardPresentation
}) => (
  <section
    aria-labelledby="public-overview-title"
    className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]"
  >
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardContent className="space-y-6 p-6 sm:p-8">
        <SectionEyebrow>Project overview</SectionEyebrow>
        <div className="space-y-3">
          <h2
            className="text-3xl font-semibold tracking-tight text-slate-950"
            id="public-overview-title"
          >
            About the Project
          </h2>
          <h3 className="text-xl font-medium text-teal-800">{presentation.summaryTitle}</h3>
        </div>
        <p className="text-base leading-8 text-slate-700">{presentation.summaryBody}</p>
        <p className="border-l-2 border-teal-600 pl-4 text-sm leading-7 text-slate-600">
          {project.description}
        </p>
      </CardContent>
    </Card>

    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle>Where the project works</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          {project.projectAreas.map((area) => (
            <div className="flex items-center gap-3 text-sm text-slate-700" key={area}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <MapPin className="h-4 w-4" aria-hidden="true" />
              </span>
              {area}
            </div>
          ))}
        </div>
        <div className="border-t border-slate-200 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Project period
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">{project.timeframe}</p>
        </div>
      </CardContent>
    </Card>
  </section>
)

const PublicMediaGallery = ({
  layoutPreset,
  project,
}: {
  layoutPreset: PublicDashboardLayoutPreset
  project: PublicProjectRecord
}) => {
  const approvedMedia = project.approvedMedia.filter(
    (media) =>
      media.approvalState === 'Approved for public presentation' &&
      media.consentScope === 'Public project storytelling',
  )

  if (approvedMedia.length === 0) {
    return null
  }

  return (
    <section aria-labelledby="public-media-title" className="space-y-5">
      <PublicSectionHeading
        description="Only synthetic, non-identifying mock media cleared for this public prototype is shown."
        eyebrow="Approved public media"
        id="public-media-title"
        title="Project moments and places"
      />
      <div
        className={cn(
          'grid gap-5',
          layoutPreset === 'story-led' && 'grid-cols-1',
          layoutPreset === 'balanced' && 'md:grid-cols-2',
          layoutPreset === 'compact' && 'gap-3 md:grid-cols-2',
        )}
      >
        {approvedMedia.map((media) => (
          <figure
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            key={media.id}
          >
            <div
              className={cn(
                'relative overflow-hidden bg-slate-200',
                layoutPreset === 'story-led' ? 'aspect-[16/7]' : 'aspect-video',
              )}
            >
              <Image
                alt={media.alt}
                className="object-cover"
                fill
                sizes={
                  layoutPreset === 'story-led'
                    ? '(max-width: 1280px) 100vw, 1200px'
                    : '(max-width: 768px) 100vw, 50vw'
                }
                src={media.src}
              />
              <span className="absolute left-3 top-3 rounded-full border border-white/40 bg-slate-950/65 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {media.contextLabel}
              </span>
            </div>
            <figcaption className={cn('space-y-3 p-5', layoutPreset === 'compact' && 'p-4')}>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="success">{media.approvalState}</StatusBadge>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {media.source}
                </span>
              </div>
              <p className="text-sm leading-6 text-slate-700">{media.caption}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

const PublicProgress = ({ project }: { project: PublicProjectRecord }) => (
  <section aria-labelledby="public-progress-title" className="space-y-5">
    <PublicSectionHeading
      description="A concise view of approved aggregate progress and project-level assessment results."
      eyebrow="Progress story"
      id="public-progress-title"
      title="Progress at a glance"
    />
    <div className="grid gap-4 md:grid-cols-3">
      <DetailMetric label="Approved progress" value={`${project.progressTrend.at(-1) ?? 0}%`} />
      <DetailMetric
        label="Beneficiaries reached"
        value={project.beneficiariesReached.toLocaleString()}
      />
      <DetailMetric label="Reviewed assessment" value={project.assessmentSummary} />
    </div>
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle>Approved progress trend</CardTitle>
        <p className="text-sm leading-6 text-slate-600">{project.budgetSummary}</p>
      </CardHeader>
      <CardContent>
        <PublicProgressTrendChart project={project} />
      </CardContent>
    </Card>
  </section>
)

const PublicIndicators = ({ project }: { project: PublicProjectRecord }) => (
  <section aria-labelledby="public-indicators-title" className="space-y-5">
    <PublicSectionHeading
      description="Only selected project-level indicators cleared for this public view are shown."
      eyebrow="Approved results"
      id="public-indicators-title"
      title="Selected indicators"
    />
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Indicator progress</CardTitle>
        </CardHeader>
        <CardContent>
          <PublicIndicatorChart project={project} />
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Approved indicator details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.selectedIndicators.map((indicator) => (
            <article
              className="space-y-3 rounded-lg border border-slate-200 p-4"
              key={indicator.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="max-w-xl font-medium leading-6 text-slate-900">{indicator.label}</p>
                <StatusBadge tone={indicatorTone(indicator.status)}>{indicator.status}</StatusBadge>
              </div>
              <ProgressBar label={indicator.label} tone="info" value={indicator.progress} />
              <p className="text-xs text-slate-500">
                {indicator.actualLabel} of {indicator.targetLabel}
              </p>
            </article>
          ))}
        </CardContent>
      </Card>
    </div>
  </section>
)

const PublicMilestones = ({ project }: { project: PublicProjectRecord }) => (
  <section aria-labelledby="public-milestones-title" className="space-y-5">
    <PublicSectionHeading
      description="Approved delivery milestones and accomplishment highlights for stakeholder review."
      eyebrow="Delivery highlights"
      id="public-milestones-title"
      title="Milestones and accomplishments"
    />
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Public milestones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.milestones.map((milestone, index) => (
            <article className="flex items-start gap-4" key={milestone.id}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-semibold text-teal-800">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1 border-b border-slate-100 pb-4 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-950">{milestone.title}</p>
                  <StatusBadge tone={milestone.status === 'Completed' ? 'success' : 'info'}>
                    {milestone.status}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-sm text-slate-500">{milestone.dateLabel}</p>
              </div>
            </article>
          ))}
        </CardContent>
      </Card>
      <Card className="border-slate-200 bg-teal-950 text-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-white">Accomplishment highlights</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {project.accomplishments.map((item) => (
              <li className="flex gap-3 text-sm leading-7 text-teal-50" key={item}>
                <BadgeCheck className="mt-1 h-5 w-5 shrink-0 text-teal-300" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  </section>
)

const PublicSectionHeading = ({
  description,
  eyebrow,
  id,
  title,
}: {
  description: string
  eyebrow: string
  id: string
  title: string
}) => (
  <div className="max-w-3xl space-y-2">
    <SectionEyebrow>{eyebrow}</SectionEyebrow>
    <h2 className="text-3xl font-semibold tracking-tight text-slate-950" id={id}>
      {title}
    </h2>
    <p className="text-sm leading-6 text-slate-600">{description}</p>
  </div>
)

const SectionEyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">{children}</p>
)

const HeroMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 border-b border-white/15 p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-teal-100">{label}</p>
    <p className="mt-2 break-words text-base font-semibold leading-6 text-white">{value}</p>
  </div>
)

const DetailMetric = ({ label, value }: { label: string; value: string }) => (
  <Card className="border-slate-200 shadow-sm">
    <CardContent className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold leading-7 text-slate-950">{value}</p>
    </CardContent>
  </Card>
)

const EditorSection = ({
  children,
  description,
  title,
}: {
  children: React.ReactNode
  description: string
  title: string
}) => (
  <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
    <legend className="px-1 text-base font-semibold text-slate-950">{title}</legend>
    <p className="text-sm leading-6 text-slate-600">{description}</p>
    {children}
  </fieldset>
)

const EditorField = ({
  id,
  label,
  maxLength,
  onChange,
  value,
}: {
  id: string
  label: string
  maxLength: number
  onChange: (value: string) => void
  value: string
}) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  </div>
)

const EditorTextarea = ({
  id,
  label,
  maxLength,
  onChange,
  value,
}: {
  id: string
  label: string
  maxLength: number
  onChange: (value: string) => void
  value: string
}) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <textarea
      className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      id={id}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  </div>
)

const CtaEditor = ({
  destination,
  id,
  label,
  onDestinationChange,
  onLabelChange,
  value,
}: {
  destination: string
  id: string
  label: string
  onDestinationChange: (value: string) => void
  onLabelChange: (value: string) => void
  value: string
}) => (
  <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
    <legend className="px-1 text-sm font-semibold text-slate-950">{label}</legend>
    <EditorField
      id={`${id}-label`}
      label="Button label"
      maxLength={48}
      onChange={onLabelChange}
      value={value}
    />
    <div className="space-y-2">
      <Label htmlFor={`${id}-destination`}>Destination</Label>
      <Select onValueChange={onDestinationChange} value={destination}>
        <SelectTrigger id={`${id}-destination`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {publicCtaDestinations.map((item) => (
            <SelectItem key={item.href} value={item.href}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </fieldset>
)
