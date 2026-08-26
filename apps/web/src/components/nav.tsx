import Link from "next/link";
import type { AccessLevel } from "@/lib/types";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clientes" },
  { href: "/opportunities", label: "Pipeline" },
  { href: "/role-rates", label: "Tarifas", adminOnly: true },
  { href: "/projects", label: "Projetos" },
  { href: "/ffe", label: "FF&E" },
  { href: "/timesheet", label: "Timesheet" },
  { href: "/team", label: "Equipe" },
  { href: "/products", label: "Produtos" },
  { href: "/financeiro", label: "Financeiro", adminOnly: true },
];

// adminOnly esconde o link em vez de deixar staff clicar numa página que
// só vai devolver 403 -- as duas telas por trás (Tarifas, Financeiro) são
// só dados de custo/tarifa, que staff não pode ver de qualquer jeito (ver
// User.accessLevel no schema).
export function Nav({ accessLevel }: { accessLevel: AccessLevel }) {
  const links = LINKS.filter((link) => !link.adminOnly || accessLevel === "admin");
  return (
    <nav className="print:hidden flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-200 bg-white px-6 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <Link href="/" className="font-medium text-zinc-900 dark:text-zinc-50">
        Araci
      </Link>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
