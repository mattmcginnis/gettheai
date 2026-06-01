import { Prisma } from "@prisma/client";
import { runGuardedAiDraft } from "@/lib/ai";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import type { SupportCaseItem } from "@/lib/types";
import { mapSupportCase } from "@/lib/repository/internal/mappers";
import { ensureUser } from "@/lib/repository/internal/prisma";

export async function createSupportCase(input: {
  requesterEmail: string;
  subject: string;
  transactionId?: string;
  context: string;
}): Promise<SupportCaseItem> {
  const draft = await runGuardedAiDraft({
    kind: "support",
    subject: input.subject,
    context: input.context
  });
  const createdAt = new Date().toISOString();

  if (!isDatabaseConfigured()) {
    return {
      id: `case_${Date.now()}`,
      requesterEmail: input.requesterEmail,
      subject: input.subject,
      status: "open",
      transactionId: input.transactionId,
      aiDraftResponses: [draft],
      createdAt
    };
  }

  const user = await ensureUser(input.requesterEmail, "BUYER");
  const row = await getPrisma().supportCase.create({
    data: {
      requesterId: user.id,
      subject: input.subject,
      transactionId: input.transactionId,
      status: "OPEN",
      aiDraftResponses: [draft] as unknown as Prisma.InputJsonValue
    },
    include: {
      requester: true
    }
  });

  return mapSupportCase(row);
}


export async function listSupportCases() {
  if (!isDatabaseConfigured()) {
    return [] satisfies SupportCaseItem[];
  }

  const rows = await getPrisma().supportCase.findMany({
    include: { requester: true },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return rows.map(mapSupportCase);
}

