import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  TasksService,
  createTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
  type UpdateTaskStatusInput,
} from './tasks.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

// Lista todas as tarefas do projeto (todas as fases juntas, já ordenadas
// por fase depois por ordem) -- criar precisa saber em qual fase a
// tarefa nasce, então fica sob .../phases/:phaseId, mas ler o quadro
// inteiro de uma vez é o caso de uso real de uma tela de projeto.
@Controller('v1/projects/:projectId/tasks')
export class ProjectTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async list(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.tasksService.listForProject(accountId, projectId);
    return { data };
  }
}

@Controller('v1/projects/:projectId/phases/:phaseId/tasks')
export class PhaseTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
    @Param('phaseId') phaseId: string,
    @Body(new ZodValidationPipe(createTaskSchema)) input: CreateTaskInput,
  ) {
    const data = await this.tasksService.createTask(accountId, projectId, phaseId, input);
    return { data };
  }
}

@Controller('v1/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Patch(':id')
  async update(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) input: UpdateTaskInput,
  ) {
    const data = await this.tasksService.updateTask(accountId, id, input);
    return { data };
  }

  // Ação dedicada (mesmo espírito de .../phases/:phaseId/approve) -- só
  // aqui a regra "não conclui com dependência pendente" é aplicada; um
  // PATCH genérico não deveria conseguir contornar isso.
  @Post(':id/status')
  @HttpCode(200)
  async updateStatus(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaskStatusSchema)) input: UpdateTaskStatusInput,
  ) {
    const data = await this.tasksService.updateStatus(accountId, id, input);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.tasksService.deleteTask(accountId, id);
  }
}
