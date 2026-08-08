import { z } from "zod";
import { prisma } from "@araci/db";
import { ApiError, NotFoundError } from "@/lib/api";
import { getProject } from "./projects";
import { getUser } from "./users";

export const addMemberSchema = z.object({
  userId: z.string().min(1),
  roleOnProject: z.string().min(1).optional(),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;

export function listMembers(accountId: string, projectId: string) {
  return getProject(accountId, projectId).then(() =>
    prisma.projectMember.findMany({ where: { projectId }, include: { user: true } })
  );
}

export async function addMember(accountId: string, projectId: string, input: AddMemberInput) {
  await getProject(accountId, projectId);
  await getUser(accountId, input.userId); // 404 se o usuário não é desta conta

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: input.userId } },
  });
  if (existing) {
    throw new ApiError("ALREADY_MEMBER", "Este colaborador já está na equipe deste projeto.", 409);
  }

  return prisma.projectMember.create({
    data: { projectId, userId: input.userId, roleOnProject: input.roleOnProject },
    include: { user: true },
  });
}

export async function removeMember(accountId: string, projectId: string, userId: string) {
  await getProject(accountId, projectId);
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) {
    throw new NotFoundError("Membro do projeto");
  }
  await prisma.projectMember.delete({ where: { id: member.id } });
}
