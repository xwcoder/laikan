import { ComponentPropsWithoutRef } from 'react'
import { Button } from '@/ui/components/ui/button'

type Props = ComponentPropsWithoutRef<typeof Button> & { label: string }

export function IconButton({ label, ...props }: Props) {
  return <Button variant="ghost" size="icon" aria-label={label} {...props} />
}
