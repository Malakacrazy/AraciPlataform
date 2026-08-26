// Sem <Nav> de propósito -- essa navegação é pra colaboradores logados
// via Google Workspace (ver components/nav.tsx); quem abre este
// formulário é um visitante anônimo do site do estúdio, antes de
// qualquer contato (ver LeadsController, @Public()).
export default function LeadLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <span className="font-medium text-zinc-900 dark:text-zinc-50">Studio Araci</span>
      </header>
      {children}
    </div>
  );
}
