import type { ReactNode } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const ModulePlaceholder = ({
  title,
  summary,
  children,
}: {
  title: string
  summary: string
  children?: ReactNode
}) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{summary}</CardDescription>
    </CardHeader>
    {children ? <CardContent>{children}</CardContent> : null}
  </Card>
)
