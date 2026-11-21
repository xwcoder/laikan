import { ComponentPropsWithoutRef, ElementRef, forwardRef } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/ui/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const { t } = useTranslation()
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'undraggle fixed top-1/2 left-1/2 z-50 grid max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-xl border bg-popover p-6 text-popover-foreground shadow-lg outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close aria-label={t('common.close')} className="absolute top-3 right-3 grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <X aria-hidden className="size-4" />
          <span className="sr-only">{t('common.close')}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})
DialogContent.displayName = 'DialogContent'

const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('pr-6 text-lg leading-tight font-semibold tracking-tight', className)} {...props} />
))
DialogTitle.displayName = 'DialogTitle'
const DialogDescription = DialogPrimitive.Description

export {
  Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription,
}
