import Link from "next/link";

const LINKS = [
  { href: "/clients", label: "Clientes" },
  { href: "/opportunities", label: "Pipeline" },
  { href: "/role-rates", label: "Tarifas" },
  { href: "/projects", label: "Projetos" },
  { href: "/timesheet", label: "Timesheet" },
  { href: "/team", label: "Equipe" },
  { href: "/products", label: "Produtos" },
];

export function Nav() {
  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-200 bg-white px-6 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <Link href="/" className="font-medium text-zinc-900 dark:text-zinc-50">
        Araci
      </Link>
      {LINKS.map((link) => (
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
