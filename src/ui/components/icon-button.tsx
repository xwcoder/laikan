import { ComponentPropsWithoutRef } from 'react'
import { Button } from '@/ui/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip'

type Props = ComponentPropsWithoutRef<typeof Button> & { label: string }

export function IconButton({ label, children, ...props }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
