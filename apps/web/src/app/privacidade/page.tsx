// Lacuna da matriz (LGPD) -- achado da auditoria: "nenhum artefato de
// LGPD no apps/web: sem aviso de privacidade, sem controlador
// identificado, sem canal do encarregado". Esta página é a ESTRUTURA
// certa (as seções que um aviso de privacidade de verdade precisa ter),
// não o conteúdo -- quem é o controlador, quem é o encarregado e o texto
// legal de cada seção são decisão da Giulia mais revisão jurídica, não
// algo que devesse ser inventado aqui. Cada seção abaixo está marcada
// [A PREENCHER] até isso acontecer -- publicar esta página como está,
// sem preencher, não cumpre a LGPD, só organiza o que falta.
const PLACEHOLDER = "[A PREENCHER — revisão jurídica necessária antes de publicar]";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{title}</h2>
      <div className="text-sm text-zinc-600 dark:text-zinc-400">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Política de Privacidade</h1>
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Página em preparação — o conteúdo abaixo é um rascunho estrutural, não o texto final. Não substitui revisão
          jurídica.
        </p>
      </div>

      <Section title="Quem é o controlador dos dados">{PLACEHOLDER}</Section>
      <Section title="Que dados coletamos e por quê">
        Nome, e-mail e telefone informados no formulário de contato; dados de projeto e financeiros de clientes
        ativos. {PLACEHOLDER}
      </Section>
      <Section title="Base legal para o tratamento">{PLACEHOLDER}</Section>
      <Section title="Por quanto tempo guardamos seus dados">{PLACEHOLDER}</Section>
      <Section title="Com quem compartilhamos">{PLACEHOLDER}</Section>
      <Section title="Seus direitos como titular">
        Você pode solicitar acesso, correção, portabilidade ou exclusão dos seus dados a qualquer momento. {PLACEHOLDER}
      </Section>
      <Section title="Canal do encarregado (DPO)">{PLACEHOLDER}</Section>
    </main>
  );
}
