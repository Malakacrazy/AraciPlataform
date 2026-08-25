import Link from "next/link";

const TABS = [
  { href: "/dashboard", label: "Visão executiva" },
  { href: "/dashboard/capacidade", label: "Capacidade da equipe" },
  { href: "/dashboard/ffe", label: "FF&E" },
];

export function DashboardTabs({ active }: { active: string }) {
  return (
    <div className="flex gap-4 border-b border-zinc-200 pb-2 text-sm dark:border-zinc-800">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={
            tab.href === active
              ? "font-medium text-zinc-900 dark:text-zinc-50"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
