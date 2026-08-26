import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { ProjectsService } from './projects.service';

export const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  assigneeId: z.string().min(1).optional(),
  dueDate: z.iso.datetime().optional(),
  dependsOnIds: z.array(z.string().min(1)).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  dueDate: z.iso.datetime().nullable().optional(),
  dependsOnIds: z.array(z.string().min(1)).optional(),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const updateTaskStatusSchema = z.object({
  status: z.enum(['a_fazer', 'em_andamento', 'concluida']),
});

export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;

const taskInclude = {
  assignee: { select: { id: true, name: true, email: true } },
  phase: { select: { id: true, stage: true, order: true } },
  dependsOn: { select: { id: true, title: true, status: true } },
} as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async listForProject(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.task.findMany({
      where: { phase: { projectId } },
      include: taskInclude,
      orderBy: [{ phase: { order: 'asc' } }, { order: 'asc' }],
    });
  }

  private async getPhaseScoped(accountId: string, projectId: string, phaseId: string) {
    await this.projectsService.getProject(accountId, projectId);
    const phase = await this.prisma.db.projectPhase.findFirst({ where: { id: phaseId, projectId } });
    if (!phase) {
      throw new NotFoundError('Fase do projeto');
    }
    return phase;
  }

  // Task.id sozinho não basta pra escopar por conta (não tem accountId
  // direto) -- sobe pela fase até o projeto, mesmo padrão de
  // OfficeLink/Activity (polimórfico validado na service layer), só que
  // aqui o caminho é fixo (Task -> ProjectPhase -> Project), não
  // polimórfico de verdade.
  private async getTaskScoped(accountId: string, id: string) {
    const task = await this.prisma.db.task.findFirst({
      where: { id, phase: { project: { accountId } } },
      include: { ...taskInclude, phase: { select: { id: true, projectId: true } } },
    });
    if (!task) {
      throw new NotFoundError('Tarefa');
    }
    return task;
  }

  // BFS a partir de cada dependência candidata, seguindo as arestas
  // dependsOn -- se algum caminho chega de volta em taskId, essa
  // dependência criaria um ciclo (a tarefa nunca poderia ser concluída,
  // travada esperando ela mesma por transitividade).
  private async wouldCreateCycle(taskId: string | null, candidateDependsOnIds: string[]): Promise<boolean> {
    const visited = new Set<string>();
    const queue = [...candidateDependsOnIds];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (taskId && current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      const currentTask = await this.prisma.db.task.findUnique({
        where: { id: current },
        select: { dependsOn: { select: { id: true } } },
      });
      if (currentTask) {
        queue.push(...currentTask.dependsOn.map((d) => d.id));
      }
    }
    return false;
  }

  // dependsOnIds precisa apontar pra tarefas do MESMO projeto (não
  // necessariamente a mesma fase -- uma tarefa de uma fase posterior
  // pode legitimamente depender de algo de uma fase anterior), e não
  // pode formar ciclo.
  private async validateDependsOnIds(projectId: string, taskId: string | null, dependsOnIds: string[]) {
    if (dependsOnIds.length === 0) return;
    const found = await this.prisma.db.task.findMany({
      where: { id: { in: dependsOnIds }, phase: { projectId } },
      select: { id: true },
    });
    if (found.length !== dependsOnIds.length) {
      throw new NotFoundError('Uma ou mais tarefas em dependsOnIds');
    }
    if (await this.wouldCreateCycle(taskId, dependsOnIds)) {
      throw new ApiError(
        'TASK_DEPENDENCY_CYCLE',
        'Essa dependência criaria um ciclo — a tarefa nunca poderia ser concluída.',
        422,
      );
    }
  }

  private async validateAssignee(accountId: string, assigneeId: string) {
    const user = await this.prisma.db.user.findFirst({ where: { id: assigneeId, accountId } });
    if (!user) {
      throw new NotFoundError('Usuário responsável');
    }
  }

  async createTask(accountId: string, projectId: string, phaseId: string, input: CreateTaskInput) {
    await this.getPhaseScoped(accountId, projectId, phaseId);
    if (input.assigneeId) {
      await this.validateAssignee(accountId, input.assigneeId);
    }
    const dependsOnIds = input.dependsOnIds ?? [];
    await this.validateDependsOnIds(projectId, null, dependsOnIds);

    const count = await this.prisma.db.task.count({ where: { phaseId } });

    return this.prisma.db.task.create({
      data: {
        phaseId,
        title: input.title,
        assigneeId: input.assigneeId,
        status: 'a_fazer',
        order: count,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        dependsOn: dependsOnIds.length > 0 ? { connect: dependsOnIds.map((id) => ({ id })) } : undefined,
      },
      include: taskInclude,
    });
  }

  async updateTask(accountId: string, id: string, input: UpdateTaskInput) {
    const task = await this.getTaskScoped(accountId, id);
    if (input.assigneeId) {
      await this.validateAssignee(accountId, input.assigneeId);
    }
    if (input.dependsOnIds !== undefined) {
      await this.validateDependsOnIds(task.phase.projectId, id, input.dependsOnIds);
    }

    return this.prisma.db.task.update({
      where: { id },
      data: {
        title: input.title,
        assigneeId: input.assigneeId === undefined ? undefined : input.assigneeId,
        dueDate:
          input.dueDate === undefined ? undefined : input.dueDate === null ? null : new Date(input.dueDate),
        dependsOn: input.dependsOnIds === undefined ? undefined : { set: input.dependsOnIds.map((depId) => ({ id: depId })) },
      },
      include: taskInclude,
    });
  }

  // Separado do updateTask (mesmo espírito de ProjectPhase.../approve):
  // concluir de verdade impõe uma regra de negócio (dependências
  // precisam já estar concluídas) que um PATCH genérico não deveria
  // conseguir contornar por acidente.
  async updateStatus(accountId: string, id: string, input: UpdateTaskStatusInput) {
    const task = await this.getTaskScoped(accountId, id);

    if (input.status === 'concluida') {
      const incomplete = task.dependsOn.filter((d) => d.status !== 'concluida');
      if (incomplete.length > 0) {
        throw new ApiError(
          'TASK_BLOCKED',
          `Esta tarefa depende de ${incomplete.length} tarefa(s) ainda não concluída(s).`,
          422,
        );
      }
    }

    return this.prisma.db.task.update({
      where: { id },
      data: {
        status: input.status,
        completedAt: input.status === 'concluida' ? new Date() : null,
      },
      include: taskInclude,
    });
  }

  async deleteTask(accountId: string, id: string) {
    await this.getTaskScoped(accountId, id);
    // Apagar remove as arestas de dependência junto (ON DELETE CASCADE na
    // tabela de junção) -- outras tarefas que dependiam desta ficam sem
    // essa dependência, não travadas esperando algo que não existe mais.
    await this.prisma.db.task.delete({ where: { id } });
  }
}
