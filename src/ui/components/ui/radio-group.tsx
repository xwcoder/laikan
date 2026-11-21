import { ComponentPropsWithoutRef, ElementRef, forwardRef } from 'react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { Circle } from 'lucide-react'
import { cn } from '@/ui/lib/utils'

const RadioGroup = forwardRef<
  ElementRef<typeof RadioGroupPrimitive.Root>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-3', className)} {...props} />
))
RadioGroup.displayName = 'RadioGroup'

const RadioGroupItem = forwardRef<
  ElementRef<typeof RadioGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> & { variant?: 'default' | 'segment' }
>(({
  className, children, variant = 'default', ...props
}, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
      variant === 'segment'
        ? 'flex h-7 items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm dark:data-[state=checked]:bg-accent'
        : 'size-4 rounded-full border border-input text-primary shadow-xs data-[state=checked]:border-primary',
      className,
    )}
    {...props}
  >
    {children ?? (
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="size-2 fill-current" />
      </RadioGroupPrimitive.Indicator>
    )}
  </RadioGroupPrimitive.Item>
))
RadioGroupItem.displayName = 'RadioGroupItem'

export { RadioGroup, RadioGroupItem }
