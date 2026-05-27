import { appraiseDomain } from "@/lib/appraisal";

export interface AiDraftRequest {
  kind: "listing" | "support" | "negotiation" | "outreach";
  subject: string;
  context: string;
}

export async function runGuardedAiDraft(request: AiDraftRequest) {
  if (process.env.AI_PROVIDER === "openai" && process.env.OPENAI_API_KEY) {
    return runOpenAiDraft(request);
  }

  const prefix = {
    listing: "Listing draft",
    support: "Support response draft",
    negotiation: "Negotiation suggestion",
    outreach: "Buyer outreach draft"
  }[request.kind];

  return {
    title: `${prefix}: ${request.subject}`,
    body:
      `${request.subject} is a strong fit for GetThe's mid-market marketplace. ` +
      `Use transparent pricing, Escrow.com handoff, and clear next steps. Context: ${request.context}`,
    requiresHumanApproval: request.kind === "outreach" || request.kind === "negotiation",
    provider: process.env.AI_PROVIDER || "local",
    modelVersion: "getthe-copilot-v1"
  };
}

export async function runAppraisal(domain: string) {
  const appraisal = appraiseDomain(domain);

  if (process.env.AI_PROVIDER !== "openai" || !process.env.OPENAI_API_KEY) {
    return appraisal;
  }

  const draft = await runOpenAiDraft({
    kind: "listing",
    subject: `Appraisal narrative for ${appraisal.domain}`,
    context: JSON.stringify({
      range: [appraisal.lowEstimate, appraisal.highEstimate],
      confidence: appraisal.confidence,
      signals: appraisal.keywordSignals,
      comparableSales: appraisal.comparableSales
    })
  }).catch(() => null);

  if (!draft) {
    return appraisal;
  }

  return {
    ...appraisal,
    generatedSummary: draft.body,
    modelVersion: draft.modelVersion
  };
}

async function runOpenAiDraft(request: AiDraftRequest) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      instructions:
        "You are GetThe's guarded marketplace copilot. Be concise, transparent, and never imply a domain appraisal is guaranteed. Require human approval for external outreach, negotiation, money-sensitive, or legal-sensitive actions.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Kind: ${request.kind}\nSubject: ${request.subject}\nContext: ${request.context}`
            }
          ]
        }
      ],
      store: false
    })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`OpenAI draft failed: ${response.status}`);
  }

  return {
    title: `${request.kind} draft: ${request.subject}`,
    body: extractOutputText(payload),
    requiresHumanApproval: request.kind === "outreach" || request.kind === "negotiation",
    provider: "openai",
    modelVersion: String(payload.model ?? process.env.OPENAI_MODEL ?? "openai-responses")
  };
}

function extractOutputText(payload: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }) {
  if (payload.output_text) {
    return payload.output_text;
  }

  const text = payload.output?.flatMap((item) => item.content ?? []).map((content) => content.text).filter(Boolean).join("\n");
  return text || "AI draft unavailable.";
}
