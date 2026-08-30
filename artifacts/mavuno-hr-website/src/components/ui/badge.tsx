import * as React from "react"

export function Badge({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-inset ring-accent/20 ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
