import React from 'react'
import { Badge } from '@/components/ui/badge'

/** Leading "<icon> Source" badge that names what a workspace header line is about. */
export function WorkspaceHeaderSourceBadge({
  icon,
  label
}: {
  icon: React.ReactNode
  label: string
}): React.JSX.Element {
  return (
    <Badge variant="outline">
      {icon}
      {label}
    </Badge>
  )
}
