import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "soft" | "quiet" | "foam" | "raised";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-tide text-foam h-14",
  soft: "bg-sky text-ink h-13",
  quiet: "bg-mist text-ink h-13",
  foam: "bg-foam text-ink h-14",
  raised: "bg-ink-raised text-foam h-13", // secondary action inside a dark ink panel
};

function classes(variant: Variant, extra = "") {
  const padding = /\bpx-/.test(extra) ? "" : "px-5"; // let callers override horizontal padding
  return `press inline-flex items-center justify-center gap-2 rounded-md ${padding} text-center text-[17px] font-bold leading-tight disabled:opacity-50 ${VARIANTS[variant]} ${extra}`;
}

/** Same look as ButtonLink, for links that leave the app (e.g. Google Maps directions). */
export function ExternalButtonLink({ variant = "primary", icon, children, className, href }: {
  variant?: Variant;
  icon?: IconName;
  children: ReactNode;
  className?: string;
  href: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes(variant, className)}>
      {icon && <Icon name={icon} />}
      {children}
    </a>
  );
}

export function Button({ variant = "primary", icon, children, className, ...rest }: {
  variant?: Variant;
  icon?: IconName;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={classes(variant, className)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", icon, trailingIcon, children, className, to }: {
  variant?: Variant;
  icon?: IconName;
  trailingIcon?: IconName;
  children: ReactNode;
  className?: string;
  to: string;
}) {
  return (
    <Link to={to} className={classes(variant, className)}>
      {icon && <Icon name={icon} />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} />}
    </Link>
  );
}
