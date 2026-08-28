// Bloqueador 11 da auditoria: sem not-found.tsx, um notFound() chamado
// em qualquer página (ex.: present/[token]/page.tsx quando o token não
// existe) caía na página 404 genérica do Next em vez de algo com a cara
// do produto e um caminho de volta.
export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-3 px-6 py-24">
      <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Página não encontrada</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        O link que você abriu não existe ou não está mais disponível.
      </p>
      <a href="/" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
        Voltar ao início
      </a>
    </main>
  );
}
