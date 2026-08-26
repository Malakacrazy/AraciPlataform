import { Prisma, type PrismaClient } from '@araci/db';
import { getAuditActor } from './audit-context';

// Tabelas de fora do escopo do log -- pura plumbing de sessão/token/
// notificação, nunca "dado de negócio" que alguém precisaria investigar
// depois. AuditLog está aqui também, óbvio: sem isso a própria escrita do
// log dispararia a si mesma (recursão infinita).
const EXCLUDED_MODELS = new Set([
  'AuditLog',
  'Notification',
  'ClientMagicLink',
  'ClientSession',
  'PresentationLink',
]);

function modelKeyOf(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

// Só pros models onde existe um campo óbvio de "nome de exibição" -- o
// resto (ProjectPhase, TimeEntry, ProductSpecification, ...) fica sem
// entityLabel, e a tela de log mostra só entityType + id curto pra eles.
// Não vale a complexidade de mapear um "campo-pai" pra cada um só pra
// isso.
const DISPLAY_FIELD: Record<string, string> = {
  Account: 'name',
  User: 'name',
  Client: 'name',
  Opportunity: 'title',
  Project: 'name',
  Product: 'name',
  RoleRate: 'role',
  Moodboard: 'name',
  Area: 'name',
};

function labelFor(model: string, row: Record<string, unknown> | null): string | null {
  const field = DISPLAY_FIELD[model];
  if (!field || !row) return null;
  const value = row[field];
  return typeof value === 'string' ? value : null;
}

// DMMF (metadados do schema, já embutidos no client gerado) em vez de
// heurística sobre o formato do valor -- é o jeito exato, não um "parece
// um objeto de relação", de saber quais campos são escalares (incluindo
// Decimal/Json/enum) e quais são include de relação, por model.
const scalarFieldsByModel = new Map<string, Set<string>>();
function scalarFieldsFor(model: string): Set<string> {
  let fields = scalarFieldsByModel.get(model);
  if (!fields) {
    const dmmfModel = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
    fields = new Set((dmmfModel?.fields ?? []).filter((f) => f.kind !== 'object').map((f) => f.name));
    scalarFieldsByModel.set(model, fields);
  }
  return fields;
}

function pickScalars(model: string, row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  const fields = scalarFieldsFor(model);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    if (fields.has(key)) out[key] = row[key];
  }
  return out;
}

// Decimal (decimal.js, usado pelo Prisma pra campos Decimal) não é uma
// coluna Json válida como instância de classe -- só como valor plano.
function serializeValue(value: unknown): unknown {
  if (value && typeof value === 'object' && typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    return value.toString();
  }
  return value ?? null;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return JSON.stringify(a) === JSON.stringify(b);
}

const IGNORED_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

function diffRows(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (IGNORED_FIELDS.has(key)) continue;
    const from = serializeValue(before[key]);
    const to = serializeValue(after[key]);
    if (!valuesEqual(from, to)) changes[key] = { from, to };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

function snapshotAsChanges(row: Record<string, unknown>, direction: 'create' | 'delete') {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(row)) {
    if (IGNORED_FIELDS.has(key)) continue;
    const value = serializeValue(row[key]);
    changes[key] = direction === 'create' ? { from: null, to: value } : { from: value, to: null };
  }
  return changes;
}

// accountId da Notification/Activity/etc já vem no próprio ator (usuário
// logado) -- mas dois casos não têm isso ainda quando a escrita acontece:
// bootstrap do primeiro Account do sistema (não existe id antes de criar)
// e criação preguiçosa de User num Account que já existe (accountId só é
// conhecido depois que o próprio User nasce). Os dois se resolvem olhando
// pra linha recém-lida antes de desistir.
function resolveAccountId(
  actorAccountId: string | undefined,
  row: Record<string, unknown> | null,
  model: string,
  rowId: string,
): string | null {
  if (actorAccountId) return actorAccountId;
  if (row && typeof row.accountId === 'string') return row.accountId;
  if (model === 'Account') return rowId;
  return null;
}

async function writeAuditLog(
  baseClient: PrismaClient,
  entry: {
    accountId: string | null;
    actorType: string;
    actorId: string | null;
    actorEmail: string | null;
    action: string;
    entityType: string;
    entityId: string;
    entityLabel: string | null;
    changes: Record<string, unknown> | null;
  },
) {
  try {
    await (baseClient as unknown as { auditLog: { create: (args: unknown) => Promise<unknown> } }).auditLog.create({
      data: entry,
    });
  } catch (error) {
    // Nunca deixa uma falha ao GRAVAR o log derrubar a escrita de negócio
    // que já aconteceu -- mesma filosofia de "log/notificação nunca
    // derruba a ação real" já usada em NotificationsService.
    console.error('[audit] falha ao gravar AuditLog', error);
  }
}

// Extensão do Prisma Client (não uma chamada explícita em cada service) --
// é o único jeito de cobrir "toda escrita em todo model de negócio" sem um
// call site manual em dezenas de arquivos que inevitavelmente ficaria pra
// trás conforme o app cresce. `baseClient` é o client SEM esta extensão
// (capturado por closure em PrismaService), usado pras leituras de
// antes/depois e pra gravar o próprio AuditLog -- nunca o client
// estendido, senão essas leituras/escritas re-entrariam nesta mesma
// função.
export function withAuditExtension(baseClient: PrismaClient) {
  return Prisma.defineExtension({
    name: 'audit-log',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || EXCLUDED_MODELS.has(model)) {
            return query(args);
          }

          const actor = getAuditActor();
          const base = {
            actorType: actor.actorType ?? 'system',
            actorId: actor.actorId ?? null,
            actorEmail: actor.actorEmail ?? null,
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const delegate = (baseClient as any)[modelKeyOf(model)];

          if (operation === 'create') {
            const result = await query(args);
            const after = pickScalars(model, result as Record<string, unknown>);
            if (after) {
              await writeAuditLog(baseClient, {
                ...base,
                accountId: resolveAccountId(actor.accountId, after, model, after.id as string),
                action: 'create',
                entityType: model,
                entityId: after.id as string,
                entityLabel: labelFor(model, after),
                changes: snapshotAsChanges(after, 'create'),
              });
            }
            return result;
          }

          if (operation === 'update' || operation === 'upsert') {
            const where = (args as { where: unknown }).where;
            const before = await delegate.findFirst({ where }).catch(() => null);
            const result = await query(args);
            const after = pickScalars(model, result as Record<string, unknown>);
            if (!after) return result;

            if (!before) {
              // upsert que foi pelo caminho de criar -- não existia antes.
              await writeAuditLog(baseClient, {
                ...base,
                accountId: resolveAccountId(actor.accountId, after, model, after.id as string),
                action: 'create',
                entityType: model,
                entityId: after.id as string,
                entityLabel: labelFor(model, after),
                changes: snapshotAsChanges(after, 'create'),
              });
              return result;
            }

            const beforeScalars = pickScalars(model, before)!;
            const changes = diffRows(beforeScalars, after);
            if (changes) {
              await writeAuditLog(baseClient, {
                ...base,
                accountId: resolveAccountId(actor.accountId, after, model, after.id as string),
                action: 'update',
                entityType: model,
                entityId: after.id as string,
                entityLabel: labelFor(model, after),
                changes,
              });
            }
            return result;
          }

          if (operation === 'delete') {
            const where = (args as { where: unknown }).where;
            const before = await delegate.findUnique({ where }).catch(() => null);
            const result = await query(args);
            const beforeScalars = pickScalars(model, before);
            if (beforeScalars) {
              await writeAuditLog(baseClient, {
                ...base,
                accountId: resolveAccountId(actor.accountId, beforeScalars, model, beforeScalars.id as string),
                action: 'delete',
                entityType: model,
                entityId: beforeScalars.id as string,
                entityLabel: labelFor(model, beforeScalars),
                changes: snapshotAsChanges(beforeScalars, 'delete'),
              });
            }
            return result;
          }

          if (operation === 'updateMany') {
            const where = (args as { where: unknown }).where;
            const beforeRows: Record<string, unknown>[] = await delegate.findMany({ where }).catch(() => []);
            const result = await query(args);
            if (beforeRows.length > 0) {
              const ids = beforeRows.map((r) => r.id);
              const afterRows: Record<string, unknown>[] = await delegate
                .findMany({ where: { id: { in: ids } } })
                .catch(() => []);
              const afterById = new Map(afterRows.map((r) => [r.id, r]));
              for (const beforeRow of beforeRows) {
                const afterRow = afterById.get(beforeRow.id);
                if (!afterRow) continue; // linha também removida por outra operação na mesma transação
                const changes = diffRows(pickScalars(model, beforeRow)!, pickScalars(model, afterRow)!);
                if (changes) {
                  await writeAuditLog(baseClient, {
                    ...base,
                    accountId: resolveAccountId(actor.accountId, afterRow, model, beforeRow.id as string),
                    action: 'update',
                    entityType: model,
                    entityId: beforeRow.id as string,
                    entityLabel: labelFor(model, afterRow),
                    changes,
                  });
                }
              }
            }
            return result;
          }

          if (operation === 'deleteMany') {
            const where = (args as { where: unknown }).where;
            const beforeRows: Record<string, unknown>[] = await delegate.findMany({ where }).catch(() => []);
            const result = await query(args);
            for (const beforeRow of beforeRows) {
              const scalars = pickScalars(model, beforeRow)!;
              await writeAuditLog(baseClient, {
                ...base,
                accountId: resolveAccountId(actor.accountId, scalars, model, scalars.id as string),
                action: 'delete',
                entityType: model,
                entityId: scalars.id as string,
                entityLabel: labelFor(model, scalars),
                changes: snapshotAsChanges(scalars, 'delete'),
              });
            }
            return result;
          }

          // createMany não vem coberto de propósito: Prisma não devolve as
          // linhas criadas (só { count }), então não dá pra saber os ids
          // pra montar um snapshot de verdade sem uma segunda query
          // adivinhando o que foi inserido. Único uso hoje
          // (Notification.createMany) já está no EXCLUDED_MODELS acima.
          return query(args);
        },
      },
    },
  });
}
