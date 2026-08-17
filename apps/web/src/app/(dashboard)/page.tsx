import Link from "next/link";

const modules = [
  { name: "Office", desc: "Integração com Google Workspace", href: null },
  { name: "CRM", desc: "Captação e relacionamento com clientes", href: "/clients" },
  { name: "ERP Arquitetura", desc: "Projetos, equipe e financeiro", href: "/projects" },
  { name: "FF&E", desc: "Especificação e orçamento de mobiliário", href: "/products" },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-zinc-50 px-6 py-24 dark:bg-black">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Plataforma de Gestão Integrada
      </h1>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        {modules.map((m) => {
          const card = (
            <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{m.name}</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{m.desc}</p>
            </div>
          );
          return m.href ? (
            <Link key={m.name} href={m.href} className="hover:opacity-80">
              {card}
            </Link>
          ) : (
            <div key={m.name}>{card}</div>
          );
        })}
      </div>
    </main>
  );
}
