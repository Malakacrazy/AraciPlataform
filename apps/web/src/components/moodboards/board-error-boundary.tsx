"use client";

import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";

interface Props {
  boardId: string;
  // "staff" | "client" | "guest" -- mesmos três surfaces de
  // MoodboardCommentAuthorType (ver moodboards.service.ts), aqui como tag
  // do evento no Sentry (ver §6.1 do plano de migração tldraw->Excalidraw).
  surface: "staff" | "client" | "guest";
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Achado §6.2 do plano de migração: nenhum error boundary existe em
// apps/web (confirmado por grep) -- error.tsx do Next é isolado por ROTA,
// não por componente, e ssr:false não pega throw em fase de render. Um
// componente de biblioteca montado N vezes na mesma seção
// (ffe/page.tsx:328 e present/[token]/page.tsx mapeiam sobre TODAS as
// pranchas do projeto de uma vez) faz uma prancha que lança no mount
// derrubar a página inteira -- inclusive o form "Remover prancha", que
// fica DENTRO da mesma <section> em ffe/page.tsx, tirando o único jeito
// de apagar a prancha quebrada. Por isso o boundary é por PRANCHA, não
// por página: uma prancha quebrada degrada pra um aviso, as outras (e o
// resto da página) continuam de pé. Class component de propósito --
// getDerivedStateFromError/componentDidCatch não têm equivalente em hook.
export class BoardErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    Sentry.captureException(error, {
      tags: { surface: this.props.surface, boardId: this.props.boardId },
      extra: { componentStack: info.componentStack ?? undefined },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Não foi possível carregar esta prancha. O conteúdo salvo continua intacto — recarregue a página para
          tentar de novo.
        </p>
      );
    }
    return this.props.children;
  }
}
