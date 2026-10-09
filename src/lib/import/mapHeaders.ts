import { CANONICAL_KEYS, HG_FORMAT_PROFILES, SOURCE_ALIAS_TABLE, type SourceFormat } from './columnAliases';

export type MappingMethod = 'exact' | 'alias' | 'fuzzy' | 'passthrough';

export interface HeaderMeta {
  raw: string;
  base: string;
  normalizedKey: string;
  dupIndex: number;
}

export interface MappingReportEntry {
  sourceColumn: string;
  targetField: string;
  method: MappingMethod;
  confidence: number;
}

export interface MappingResult {
  sourceFormat: SourceFormat;
  mapped: Record<string, string>;
  report: MappingReportEntry[];
}

const FUZZY_THRESHOLD = 0.85;

export function normalizeHeader(value: string): string {
  const trimmed = (value ?? '').replace(/^\uFEFF/, '').trim();
  const withoutDup = trimmed.replace(/\.\d+$/, '');
  return withoutDup.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function extractHeaderMeta(raw: string): HeaderMeta {
  const cleanRaw = (raw ?? '').replace(/^\uFEFF/, '').trim();
  const match = cleanRaw.match(/^(.*?)(?:\.(\d+))?$/);
  const base = match ? match[1] : cleanRaw;
  const dupIndex = Number(match?.[2] ?? '0');

  return {
    raw: cleanRaw,
    base,
    normalizedKey: normalizeHeader(base),
    dupIndex: Number.isFinite(dupIndex) ? dupIndex : 0,
  };
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length, 1);
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

function findAliasTarget(header: HeaderMeta): { target: string | null; method: MappingMethod; confidence: number } {
  const aliasKey = `${header.normalizedKey}${header.dupIndex > 0 ? String(header.dupIndex) : ''}`;
  const direct = (header.dupIndex > 0 ? SOURCE_ALIAS_TABLE[aliasKey] : null) ?? SOURCE_ALIAS_TABLE[header.normalizedKey];
  if (direct) {
    return { target: direct, method: 'alias', confidence: 0.99 };
  }

  const contextTarget = resolveDuplicateContext(header);
  if (contextTarget) {
    return { target: contextTarget, method: 'exact', confidence: 0.96 };
  }

  const candidates = Array.from(new Set(Object.values(SOURCE_ALIAS_TABLE).concat(CANONICAL_KEYS)));
  let bestMatch: { target: string; score: number } | null = null;

  for (const candidate of candidates) {
    const candidateKey = normalizeHeader(candidate);
    const score = similarityScore(header.normalizedKey, candidateKey);
    if (score >= FUZZY_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { target: candidate, score };
    }
  }

  if (bestMatch) {
    return { target: bestMatch.target, method: 'fuzzy', confidence: Number(bestMatch.score.toFixed(2)) };
  }

  return { target: header.raw, method: 'passthrough', confidence: 0.2 };
}

function resolveDuplicateContext(header: HeaderMeta): string | null {
  const key = header.normalizedKey;
  if (key === 'address') {
    return header.dupIndex === 0 ? 'Importer ADDRESS' : 'Consignor Address';
  }
  if (key === 'date') {
    if (header.dupIndex === 0) return 'BE DATE';
    if (header.dupIndex === 1) return 'BL Date';
    if (header.dupIndex === 2) return 'LC Date';
  }
  if (key === 'unit') {
    return header.dupIndex === 0 ? 'Unit' : 'weightUnit';
  }
  if (key === 'curr') {
    return header.dupIndex === 0 ? 'DECL CURR' : 'Curr';
  }
  return null;
}

export function detectSourceFormat(headers: string[]): SourceFormat {
  const profiles: Record<SourceFormat, number> = { A: 0, C: 0, D: 0, unknown: 0 };
  const normalizedProfiles: Record<SourceFormat, Set<string>> = {
    A: new Set(HG_FORMAT_PROFILES.A.map(normalizeHeader)),
    C: new Set(HG_FORMAT_PROFILES.C.map(normalizeHeader)),
    D: new Set(HG_FORMAT_PROFILES.D.map(normalizeHeader)),
    unknown: new Set(),
  };

  for (const header of headers) {
    const key = normalizeHeader(header);
    for (const [format, profile] of Object.entries(normalizedProfiles) as Array<[SourceFormat, Set<string>]>) {
      if (profile.has(key)) {
        profiles[format] += 1;
      }
    }
  }

  const best = (Object.entries(profiles) as Array<[SourceFormat, number]>).sort(([, left], [, right]) => right - left)[0];
  return best && best[1] > 0 ? best[0] : 'unknown';
}

export function mapHeaders(headers: string[]): MappingResult {
  const sourceFormat = detectSourceFormat(headers);
  const mapped: Record<string, string> = {};
  const report: MappingReportEntry[] = [];

  for (const header of headers) {
    const meta = extractHeaderMeta(header);
    const match = findAliasTarget(meta);
    const target = match.target ?? meta.raw;
    mapped[header] = target;
    report.push({
      sourceColumn: header,
      targetField: target,
      method: match.method,
      confidence: Number(match.confidence.toFixed(2)),
    });
  }

  return { sourceFormat, mapped, report };
}
