import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { AuditChangeValue, AuditLogEntry, AuditLogResponse } from "@/lib/types";

// Todos os models de negócio auditados (ver apps/api/src/audit/
// prisma-audit-extension.ts, EXCLUDED_MODELS) -- lista espelhada aqui só
// pro filtro; não precisa bater 100% se um model novo entrar depois, o
// filtro "Todas" sempre cobre.
const ENTITY_TYPES = [
  "Account",
  "User",
  "Client",
  "Opportunity",
  "Proposal",
  "Project",
  "ProjectPhase",
  "ProjectMember",
  "Product",
  "ProductSpecification",
  "Area",
  "Moodboard",
  "MoodboardItem",
  "Invoice",
  "RoleRate",
  "TimeEntry",
  "Allocation",
  "OfficeLink",
  "Activity",
];

const ACTION_LABELS: Record<string, string> = { create: "Criado", update: "Alterado", delete: "Removido" };
const ACTOR_LABELS: Record<string, string> = { user: "Colaborador", client: "Cliente", system: "Sistema" };

// Só pras entidades que têm página de detalhe própria -- o resto (Invoice,
// ProjectPhase, ProductSpecification, ...) aparece só como texto, sem link
// (são sub-recursos mostrados dentro da página de um Project, não têm URL
// própria).
function entityHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "Project":
      return `/projects/${entityId}`;
    case "Client":
      return `/clients/${entityId}`;
    case "Opportunity":
      return `/opportunities/${entityId}`;
    case "Product":
      return `/products/${entityId}`;
    case "User":
      return `/team`;
    case "RoleRate":
      return `/role-rates`;
    default:
      return null;
  }
}

function formatValue(value: AuditChangeValue): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "sim" : "não";
  return String(value);
}

function ChangesSummary({ entry }: { entry: AuditLogEntry }) {
  const changes = entry.changes;
  if (!changes || Object.keys(changes).length === 0) {
    return <span className="text-zinc-400 dark:text-zinc-600">—</span>;
  }
  const fields = Object.entries(changes);
  // create/delete trazem TODO campo do registro (snapshot completo) -- uma
  // lista longa não ajuda a escanear, então fica escondida atrás de
  // <details>. update normalmente tem 1-3 campos, então mostra direto.
  if (entry.action !== "update" || fields.length > 4) {
    return (
      <details>
        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
          {fields.length} campo(s)
        </summary>
        <ul className="mt-1 flex flex-col gap-0.5">
          {fields.map(([field, { from, to }]) => (
            <li key={field} className="text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{field}</span>: {formatValue(from)} →{" "}
              {formatValue(to)}
            </li>
          ))}
        </ul>
      </details>
    );
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {fields.map(([field, { from, to }]) => (
        <li key={field} className="text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{field}</span>: {formatValue(from)} →{" "}
          {formatValue(to)}
        </li>
      ))}
    </ul>
  );
}

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; action?: string; page?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const { entityType, action, page } = await searchParams;
  const query = new URLSearchParams();
  if (entityType) query.set("entityType", entityType);
  if (action) query.set("action", action);
  if (page) query.set("page", page);

  let data: AuditLogResponse;
  try {
    data = await apiGet<AuditLogResponse>(`audit-log?${query.toString()}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return (
        <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Sua conta não tem permissão para ver o log.</p>
        </main>
      );
    }
    throw err;
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Log de auditoria</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Quem mudou o quê, gravado automaticamente em toda escrita — não depende de nenhuma tela lembrar de registrar.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Entidade</span>
          <select
            name="entityType"
            defaultValue={entityType ?? ""}
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          >
            <option value="">Todas</option>
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Ação</span>
          <select
            name="action"
            defaultValue={action ?? ""}
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          >
            <option value="">Todas</option>
            <option value="create">Criado</option>
            <option value="update">Alterado</option>
            <option value="delete">Removido</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Filtrar
        </button>
      </form>

      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {data.entries.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500 dark:text-zinc-400">Nenhum registro ainda.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 font-medium">Quem</th>
                <th className="px-4 py-3 font-medium">Ação</th>
                <th className="px-4 py-3 font-medium">O quê</th>
                <th className="px-4 py-3 font-medium">Mudanças</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => {
                const href = entityHref(entry.entityType, entry.entityId);
                const label = entry.entityLabel ?? `${entry.entityType} ${entry.entityId.slice(0, 8)}…`;
                return (
                  <tr key={entry.id} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(entry.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-zinc-900 dark:text-zinc-50">{entry.actorEmail ?? "—"}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{ACTOR_LABELS[entry.actorType]}</div>
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{ACTION_LABELS[entry.action]}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{entry.entityType}</div>
                      {href ? (
                        <Link href={href} className="text-zinc-900 hover:underline dark:text-zinc-50">
                          {label}
                        </Link>
                      ) : (
                        <span className="text-zinc-900 dark:text-zinc-50">{label}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ChangesSummary entry={entry} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
          <span>
            Página {data.page} de {totalPages}
          </span>
          <div className="flex gap-3">
            {data.page > 1 && (
              <Link href={`/log?${new URLSearchParams({ ...(entityType ? { entityType } : {}), ...(action ? { action } : {}), page: String(data.page - 1) }).toString()}`}>
                ← Anterior
              </Link>
            )}
            {data.page < totalPages && (
              <Link href={`/log?${new URLSearchParams({ ...(entityType ? { entityType } : {}), ...(action ? { action } : {}), page: String(data.page + 1) }).toString()}`}>
                Próxima →
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
