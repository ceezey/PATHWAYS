import { requireServerPage } from '@/lib/rbac/server-access'

import { BackButton } from '@/components/layout/back-button'
import { JourneyStagesLoader } from '@/features/beneficiaries/journey-stages-loader'

export const dynamic = 'force-dynamic'

type JourneyStagesPageProps = {
  params: Promise<{ projectId: string }>
}

export default async function ProtectedPage(props: JourneyStagesPageProps) {
  await requireServerPage('journey', props)
  const { projectId } = await props.params
  return (
    <>
      <BackButton fallbackHref={`/projects/${projectId}/activities`} />
      <JourneyStagesLoader projectId={projectId} />
    </>
  )
}
