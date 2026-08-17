"use server";

import { revalidatePath } from "next/cache";
import { updatePublicSpecification } from "@/lib/publicApi";

export async function setSpecificationApproval(token: string, specId: string, approved: boolean) {
  await updatePublicSpecification(token, specId, { clientApproved: approved });
  revalidatePath(`/present/${token}`);
}

export async function submitSpecificationComment(token: string, specId: string, formData: FormData) {
  const comment = String(formData.get("comment") ?? "").trim();
  await updatePublicSpecification(token, specId, { clientComment: comment });
  revalidatePath(`/present/${token}`);
}
