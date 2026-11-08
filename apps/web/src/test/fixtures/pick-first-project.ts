import { useEffect } from 'react'

type Scope = { projects: { id: string }[]; projectId: string; selectProject: (id: string) => void }

// Stands in for the person choosing the first project whenever a project list arrives.
export const pickFirst = { enabled: true }
export const usePickFirstProject = (scope: Scope) => {
  // biome-ignore lint/correctness/useExhaustiveDependencies: a pick follows only a new project list.
  useEffect(() => {
    if (pickFirst.enabled && !scope.projectId && scope.projects[0])
      scope.selectProject(scope.projects[0].id)
  }, [scope.projects])
}
