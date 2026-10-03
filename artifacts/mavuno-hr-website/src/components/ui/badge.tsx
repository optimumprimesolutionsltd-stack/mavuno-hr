import * as React from "react"

export function Badge({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`ref-label text-primary ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
