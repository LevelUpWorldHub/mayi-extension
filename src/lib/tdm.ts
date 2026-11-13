export interface TdmRecord {
  reservation: 0 | 1 | null;
  policyUrl: string | null;
}

export interface TdmSignal extends TdmRecord {
  source: string | null;
  disagreement: boolean;
  sources: { source: string; reservation: 0 | 1; policyUrl: string | null }[];
}

export function parseTdmReservation(value: string | number | null | undefined): 0 | 1 | null {
  if (value === 1 || value === "1") return 1;
  if (value === 0 || value === "0") return 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "1") return 1;
    if (trimmed === "0") return 0;
  }
  return null;
}

export function parseTdmRepJson(text: string): TdmRecord {
  try {
    const data: unknown = JSON.parse(text);
    const item = Array.isArray(data) ? data[0] : data;
    if (!item || typeof item !== "object") return { reservation: null, policyUrl: null };
    const record = item as Record<string, unknown>;
    return {
      reservation: parseTdmReservation(record["tdm-reservation"] as string | number | null),
      policyUrl: typeof record["tdm-policy"] === "string" ? record["tdm-policy"] : null,
    };
  } catch {
    return { reservation: null, policyUrl: null };
  }
}

export function mergeTdm(
  parts: { source: string; reservation: 0 | 1 | null; policyUrl?: string | null }[],
): TdmSignal {
  const present = parts.filter((part): part is { source: string; reservation: 0 | 1; policyUrl?: string | null } =>
    part.reservation === 0 || part.reservation === 1,
  );
  if (!present.length) {
    return { reservation: null, policyUrl: null, source: null, disagreement: false, sources: [] };
  }
  const values = new Set(present.map((part) => part.reservation));
  return {
    reservation: values.has(1) ? 1 : 0,
    policyUrl: present.find((part) => part.policyUrl)?.policyUrl ?? null,
    source: present.map((part) => part.source).join(", "),
    disagreement: values.size > 1,
    sources: present.map((part) => ({
      source: part.source,
      reservation: part.reservation,
      policyUrl: part.policyUrl ?? null,
    })),
  };
}

export interface RobotsMeta {
  noai: boolean;
  noimageai: boolean;
  noindex: boolean;
  raw: string | null;
}

export function parseRobotsDirectives(content: string | null | undefined): RobotsMeta {
  if (!content) return { noai: false, noimageai: false, noindex: false, raw: null };
  const parts = content
    .toLowerCase()
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    noai: parts.includes("noai"),
    noimageai: parts.includes("noimageai"),
    noindex: parts.includes("noindex"),
    raw: content,
  };
}
