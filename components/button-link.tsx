import Link from "next/link";
import type { ComponentProps } from "react";
import { clsx } from "clsx";

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function ButtonLink({ className, variant = "primary", ...props }: ButtonLinkProps) {
  return (
    <Link
      className={clsx(
        "focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition",
        variant === "primary" && "bg-ink text-white hover:bg-mint",
        variant === "secondary" && "border border-line bg-white text-ink hover:border-mint hover:text-mint",
        variant === "ghost" && "text-ink hover:text-mint",
        className
      )}
      {...props}
    />
  );
}
