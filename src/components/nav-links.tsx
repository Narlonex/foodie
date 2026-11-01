"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  /** Compact label for the mobile bar, where six items must fit. */
  shortLabel?: string;
  icon: IconName;
}

export function NavLinks({
  items,
  ariaLabel,
  variant = "desktop",
}: {
  items: NavItem[];
  ariaLabel: string;
  variant?: "desktop" | "mobile";
}) {
  const pathname = usePathname();
  return (
    <nav
      className={variant === "mobile" ? "mobile-nav" : "main-nav"}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={item.icon} size={variant === "mobile" ? 19 : 17} />
            <span>{variant === "mobile" ? (item.shortLabel ?? item.label) : item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
