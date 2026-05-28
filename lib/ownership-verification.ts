import { promises as dns } from "node:dns";

export type OwnershipVerificationMethod = "dns_txt" | "nameserver" | "registrar" | "manual";

export interface OwnershipChallengeInput {
  domain: string;
  method: OwnershipVerificationMethod;
  expectedRecord?: string;
  expectedValue?: string;
  token?: string;
  actorRole?: "seller" | "admin";
}

export interface OwnershipChallengeResult {
  verified: boolean;
  method: OwnershipVerificationMethod;
  record?: string;
  checkedValue?: string;
  evidence: string[];
  reason?: string;
}

export async function verifyOwnershipChallenge(input: OwnershipChallengeInput): Promise<OwnershipChallengeResult> {
  if (input.method === "manual") {
    if (input.actorRole !== "admin") {
      return {
        verified: false,
        method: input.method,
        evidence: [],
        reason: "Manual verification requires an admin reviewer."
      };
    }

    return {
      verified: true,
      method: input.method,
      evidence: ["Admin manually approved ownership evidence."]
    };
  }

  if (input.method === "dns_txt") {
    return verifyDnsTxtChallenge(input);
  }

  if (input.method === "nameserver") {
    return verifyNameserverChallenge(input);
  }

  return verifyRegistrarChallenge(input);
}

async function verifyDnsTxtChallenge(input: OwnershipChallengeInput): Promise<OwnershipChallengeResult> {
  const record = input.expectedRecord ?? `_getthe-verify.${input.domain}`;
  const expectedValue = input.expectedValue ?? input.token;
  if (!expectedValue) {
    return {
      verified: false,
      method: input.method,
      record,
      evidence: [],
      reason: "DNS TXT verification is missing an expected challenge value."
    };
  }

  try {
    const txtRecords = (await dns.resolveTxt(record)).map((chunks) => chunks.join(""));
    const verified = txtRecords.some((value) => value.trim() === expectedValue);
    return {
      verified,
      method: input.method,
      record,
      checkedValue: expectedValue,
      evidence: txtRecords,
      reason: verified ? undefined : `TXT record ${record} did not include the expected challenge.`
    };
  } catch (error) {
    return {
      verified: false,
      method: input.method,
      record,
      checkedValue: expectedValue,
      evidence: [],
      reason: dnsErrorMessage(error, `TXT record ${record} could not be resolved.`)
    };
  }
}

async function verifyNameserverChallenge(input: OwnershipChallengeInput): Promise<OwnershipChallengeResult> {
  const expectedNameserver = normalizeHost(input.token ?? "");
  if (!expectedNameserver) {
    return {
      verified: false,
      method: input.method,
      evidence: [],
      reason: "Nameserver verification requires the expected nameserver hostname."
    };
  }

  try {
    const nameservers = await dns.resolveNs(input.domain);
    const verified = nameservers.some((nameserver) => {
      const normalized = normalizeHost(nameserver);
      return normalized === expectedNameserver || normalized.endsWith(`.${expectedNameserver}`);
    });

    return {
      verified,
      method: input.method,
      checkedValue: expectedNameserver,
      evidence: nameservers,
      reason: verified ? undefined : `${input.domain} does not point at the expected nameserver.`
    };
  } catch (error) {
    return {
      verified: false,
      method: input.method,
      checkedValue: expectedNameserver,
      evidence: [],
      reason: dnsErrorMessage(error, `Nameservers for ${input.domain} could not be resolved.`)
    };
  }
}

function verifyRegistrarChallenge(input: OwnershipChallengeInput): OwnershipChallengeResult {
  const expectedValue = input.expectedValue;
  const providedValue = input.token;
  const verified = Boolean(expectedValue && providedValue && expectedValue === providedValue);

  return {
    verified,
    method: input.method,
    checkedValue: expectedValue,
    evidence: providedValue ? ["Registrar connection token matched the listing challenge."] : [],
    reason: verified
      ? undefined
      : "Registrar verification requires a matching registrar connection token or admin manual review."
  };
}

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function dnsErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "code" in error) {
    return `${fallback} DNS returned ${(error as { code?: string }).code}.`;
  }

  return fallback;
}
