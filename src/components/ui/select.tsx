"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon, SearchIcon } from "lucide-react"

const SelectSearchContext = React.createContext("")

type SelectState = { open: boolean; value: string | undefined }
const SelectStateContext = React.createContext<SelectState | null>(null)
/** Khi đóng, `null` = render đủ mọi mục; còn lại chỉ render mục có value này. */
const SelectClosedValueContext = React.createContext<string | undefined | null>(null)

// Lúc đóng, Radix vẫn render mọi mục vào một DocumentFragment ẩn chỉ để SelectValue lấy nhãn của mục
// đang chọn. Danh sách dài (nhân sự, kỳ lương) vì thế giữ hàng trăm node ẩn ở mọi trang; từ ngưỡng này
// trở lên chỉ render mục đang chọn khi đóng. Danh sách ngắn giữ nguyên để không mất typeahead trên nút.
const COLLAPSE_CLOSED_ITEMS_FROM = 30

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
}

function getNodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(getNodeText).join(" ")
  if (React.isValidElement(node)) {
    return getNodeText((node.props as { children?: React.ReactNode }).children)
  }
  return ""
}

function hasMatchingSelectItem(node: React.ReactNode, search: string): boolean {
  let hasMatch = false
  const normalizedSearch = normalizeSearchText(search)

  React.Children.forEach(node, (child) => {
    if (hasMatch || !React.isValidElement(child)) return
    const childProps = child.props as { children?: React.ReactNode; searchText?: string }

    if (child.type === SelectItem) {
      const itemText = childProps.searchText ?? getNodeText(childProps.children)
      hasMatch = normalizeSearchText(itemText).includes(normalizedSearch)
      return
    }

    if (childProps.children) {
      hasMatch = hasMatchingSelectItem(childProps.children, search)
    }
  })

  return hasMatch
}

function countSelectItems(node: React.ReactNode, limit: number): number {
  let count = 0
  React.Children.forEach(node, (child) => {
    if (count >= limit || !React.isValidElement(child)) return
    if (child.type === SelectItem) {
      count += 1
      return
    }
    const childProps = child.props as { children?: React.ReactNode }
    if (childProps.children) count += countSelectItems(childProps.children, limit - count)
  })
  return count
}

function Select({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  value: valueProp,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  // Theo dõi trạng thái mở và giá trị cả khi dùng kiểu uncontrolled, để SelectContent biết lúc nào được rút gọn.
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue)
  const open = openProp ?? uncontrolledOpen
  const value = valueProp ?? uncontrolledValue
  const state = React.useMemo(() => ({ open, value }), [open, value])

  return (
    <SelectStateContext.Provider value={state}>
      <SelectPrimitive.Root
        data-slot="select"
        open={open}
        onOpenChange={(next) => {
          setUncontrolledOpen(next)
          onOpenChange?.(next)
        }}
        value={valueProp}
        defaultValue={defaultValue}
        onValueChange={(next) => {
          setUncontrolledValue(next)
          onValueChange?.(next)
        }}
        {...props}
      />
    </SelectStateContext.Provider>
  )
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" className={cn("min-w-0 flex-1 truncate", className)} {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-white py-2 pr-3 pl-3 text-sm whitespace-nowrap shadow-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="pointer-events-none ml-auto size-4 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  searchPlaceholder,
  emptySearchMessage = "Không tìm thấy kết quả phù hợp.",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content> & {
  searchPlaceholder?: string
  emptySearchMessage?: string
}) {
  const state = React.useContext(SelectStateContext)
  const closed = state !== null && !state.open
  const [search, setSearch] = React.useState("")
  // Mở lại thì bắt đầu từ danh sách đầy đủ; từ khoá cũ còn có thể lọc mất mục đang chọn khỏi SelectValue.
  if (closed && search) setSearch("")
  const hasSearchResult = !search || hasMatchingSelectItem(children, search)
  const closedValue = closed && countSelectItems(children, COLLAPSE_CLOSED_ITEMS_FROM) >= COLLAPSE_CLOSED_ITEMS_FROM
    ? state.value
    : null

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        data-align-trigger={position === "item-aligned"}
        className={cn("relative z-50 max-h-(--radix-select-content-available-height) min-w-36 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", position ==="popper"&&"data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", className )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          data-position={position}
          className={cn(
            "data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)",
            position === "popper" && ""
          )}
        >
          {searchPlaceholder ? (
            <div
              className="sticky top-0 z-10 border-b border-border bg-popover p-2"
              onKeyDown={(event) => {
                if (event.key !== "Escape") event.stopPropagation()
              }}
            >
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  autoFocus
                  className="h-9 w-full min-w-48 rounded-md border border-input bg-background pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
              </div>
            </div>
          ) : null}
          <SelectClosedValueContext.Provider value={closedValue}>
            <SelectSearchContext.Provider value={search}>{children}</SelectSearchContext.Provider>
          </SelectClosedValueContext.Provider>
          {!hasSearchResult ? (
            <p className="px-3 py-5 text-center text-sm text-muted-foreground">{emptySearchMessage}</p>
          ) : null}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  searchText,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item> & {
  searchText?: string
}) {
  const search = React.useContext(SelectSearchContext)
  const closedValue = React.useContext(SelectClosedValueContext)

  if (closedValue !== null && props.value !== closedValue) return null
  if (search && !normalizeSearchText(searchText ?? getNodeText(children)).includes(normalizeSearchText(search))) {
    return null
  }

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="pointer-events-none" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
