"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-slate-950/35 backdrop-blur-[1px]",
        className
      )}
      {...props}
    />
  )
}

// Nút chính của dialog = nút default/destructive cuối cùng trong DialogFooter
// (nút Hủy/Đóng luôn là outline nên không bị chọn).
const PRIMARY_ACTION_SELECTOR =
  '[data-slot="dialog-footer"] button:is([data-variant="default"], [data-variant="destructive"])'

const NON_TEXT_INPUT_TYPES = new Set([
  "button", "submit", "reset", "checkbox", "radio", "file", "range", "color", "hidden", "image",
])

function findPrimaryAction(content: HTMLElement) {
  return Array.from(content.querySelectorAll<HTMLButtonElement>(PRIMARY_ACTION_SELECTOR)).at(-1)
}

function isTextField(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) return true
  return element instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(element.type)
}

// Ô tìm kiếm lọc danh sách ngay khi gõ, Enter ở đó không có nghĩa là lưu form.
function isSearchField(element: HTMLInputElement | HTMLTextAreaElement) {
  return element.type === "search" || element.enterKeyHint === "search"
}

function confirmOnEnterKey(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Enter" || event.defaultPrevented || event.repeat) return
  // Enter lúc bộ gõ tiếng Việt đang ghép chữ chỉ để chốt chữ.
  if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
  if (event.shiftKey || event.altKey) return

  const content = event.currentTarget
  const target = event.target
  // Select/Popover render qua portal nhưng sự kiện vẫn nổi bọt theo cây React.
  if (!(target instanceof HTMLElement) || !content.contains(target)) return
  // Nút, select, checkbox... giữ hành vi Enter riêng; chỉ nhận từ ô nhập hoặc chính khung dialog.
  if (target !== content) {
    if (!isTextField(target) || isSearchField(target)) return
    if (target instanceof HTMLTextAreaElement && !event.ctrlKey && !event.metaKey) return
    // Ô nằm trong <form> thì trình duyệt tự submit.
    if (target instanceof HTMLInputElement && target.form) return
  }

  const action = findPrimaryAction(content)
  if (!action) return
  event.preventDefault()
  if (!action.disabled) action.click()
}

// Mặc định Radix focus phần tử đầu tiên, với dialog xác nhận đó là nút Hủy nên Enter sẽ hủy.
// Dialog có nút chính thì focus ô nhập đầu tiên, không có ô nhập thì focus khung dialog.
function focusForEnterConfirm(event: Event) {
  const content = event.currentTarget
  if (!(content instanceof HTMLElement) || !findPrimaryAction(content)) return
  event.preventDefault()
  const field = Array.from(
    content.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")
  ).find(
    (element) =>
      isTextField(element) &&
      !isSearchField(element) &&
      !element.disabled &&
      !element.readOnly &&
      element.getClientRects().length > 0
  )
  if (!field) {
    content.focus({ preventScroll: true })
    return
  }
  field.focus({ preventScroll: true })
  if (field instanceof HTMLInputElement) field.select()
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  confirmOnEnter = true,
  onKeyDown,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** Enter trong ô nhập (Ctrl/⌘+Enter với textarea) bấm nút chính ở DialogFooter. */
  confirmOnEnter?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
        "fixed top-1/2 left-1/2 z-50 flex w-full max-w-[calc(100%-2rem)] max-h-[calc(100dvh-3rem)] sm:max-h-[calc(100dvh-8rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover p-4 text-sm text-popover-foreground shadow-2xl shadow-slate-950/15 outline-none sm:max-w-xl sm:p-5",
          className
        )}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (confirmOnEnter) confirmOnEnterKey(event)
        }}
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event)
          if (confirmOnEnter && !event.defaultPrevented) focusForEnterConfirm(event)
        }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-3 right-3 rounded-full text-muted-foreground hover:bg-slate-100 hover:text-foreground"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex shrink-0 flex-col gap-1.5 border-b border-border/70 pb-4 pr-8", className)}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        "-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:-mx-5 sm:px-5",
        className,
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex shrink-0 flex-col-reverse gap-2 rounded-b-2xl border-t border-border/70 bg-slate-50 p-4 sm:-mx-5 sm:-mb-5 sm:px-5 sm:py-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-lg leading-tight font-semibold tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm leading-5 text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
