import { type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { toneSurface, type Tone } from '@/lib/tone'

export function StatusBadge({ children, tone = 'muted' }: { children: ReactNode; tone?: Tone }) {
  return <Badge className={`border-0 ${toneSurface[tone]}`}>{children}</Badge>
}
