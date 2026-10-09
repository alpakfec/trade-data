import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import dbConnect from '@/lib/mongodb';
import { extractGrade } from '@/lib/gradeExtraction';
import { mapHeaders } from '@/lib/import/mapHeaders';
import { derivePeriod, extractDateFromIGM, normalizeCell, normalizeHsCode, parseDate } from '@/lib/import/rowProcessor';
import ImportPeriod from '@/models/ImportPeriod';
import TradeData from '@/models/TradeData';

export const runtime = 'nodejs';

type Primitive = string | number | boolean | null | undefined;

type ImportIssue = {
  row: number;
  reason: string;
};

function detectDelimiter(sample: string): string {
  const candidates = [',', ';', '\t'];
  const stats = candidates.map((delimiter) => ({ delimiter, count: (sample.match(new RegExp(`\\${delimiter}`, 'g')) ?? []).length }));
  return stats.sort((left, right) => right.count - left.count)[0]?.delimiter ?? ',';
}

function coerceValue(value: Primitive): string | undefined {
  const normalized = normalizeCell(value);
  return normalized;
}

function makeRowHash(row: Record<string, Primitive>): string {
  const keys = [
    row['GD Number'],
    row['Item No'],
    row['IGM NO'],
    row['Importer Name'],
    row['Consignor Name'],
    row['CASH DATE'],
    row['HS CODE'],
  ].filter((value) => value !== undefined && value !== null && value !== '').join('|');

  if (keys) {
    return createHash('sha256').update(keys).digest('hex');
  }

  return createHash('sha256').update(JSON.stringify(row)).digest('hex');
}

function buildCanonicalDocument(row: Record<string, Primitive>, mappingReport: ReturnType<typeof mapHeaders>): Record<string, Primitive> {
  const normalized: Record<string, Primitive> = {};

  for (const [header, value] of Object.entries(row)) {
    const mappedField = mappingReport.mapped[header] ?? header;
    const cleaned = coerceValue(value);
    if (cleaned !== undefined) {
      normalized[mappedField] = cleaned;
    }
  }

  const description = coerceValue(normalized['Item Description'] ?? normalized['DESCRIPTION']) ?? '';
  const hs = normalizeHsCode(normalized['HS CODE'] ?? normalized['PCT'], description);
  const cashDate = parseDate(normalized['CASH DATE'] ?? normalized['Cash Date']);
  const igmDate = parseDate(normalized['IGM Date'] ?? normalized['IGM NO'] ?? normalized['IGM']);
  const beDate = parseDate(normalized['BE DATE'] ?? normalized['DATE']);
  const igmFallback = extractDateFromIGM(String(normalized['IGM NO'] ?? normalized['IGM'] ?? ''));
  const periodDate = cashDate ?? beDate ?? igmDate ?? igmFallback ?? null;
  const period = derivePeriod(periodDate, String(normalized['Month'] ?? ''), String(normalized['Year'] ?? ''));

  if (hs.hsCodeNormalized) {
    normalized.hsCodeNormalized = hs.hsCodeNormalized;
    normalized.hsChapter = hs.hsChapter;
    normalized.hsCodeConfidence = hs.hsCodeConfidence;
  }

  if (hs.hsChapter === '39') {
    const gradeInfo = extractGrade(description);
    normalized.isPolymer = true;
    normalized.polymerType = gradeInfo.polymerType;
    normalized.gradeCode = gradeInfo.gradeCode;
    normalized.normalizedGrade = gradeInfo.normalizedGrade;
    normalized.gradeExtractionConfidence = gradeInfo.confidence;
  } else {
    normalized.isPolymer = false;
    normalized.polymerType = null;
    normalized.gradeCode = null;
    normalized.normalizedGrade = null;
    normalized.gradeExtractionConfidence = null;
  }

  normalized.periodYear = period.periodYear;
  normalized.periodMonth = period.periodMonth;
  normalized.periodKey = period.periodKey;
  normalized.periodLabel = period.periodLabel;

  return normalized;
}

async function refreshPeriodsForKeys(periodKeys: string[]): Promise<void> {
  const uniqueKeys = Array.from(new Set(periodKeys.filter((value) => value && value.length > 0)));
  if (uniqueKeys.length === 0) return;

  const periods = await TradeData.aggregate([
    { $match: { periodKey: { $in: uniqueKeys } } },
    {
      $group: {
        _id: '$periodKey',
        year: { $first: '$periodYear' },
        month: { $first: '$periodMonth' },
        totalCount: { $sum: 1 },
        polymerCount: { $sum: { $cond: [{ $eq: ['$isPolymer', true] }, 1, 0] } },
        nonPolymerCount: { $sum: { $cond: [{ $eq: ['$isPolymer', false] }, 1, 0] } },
      },
    },
  ]);

  for (const item of periods) {
    const year = Number(item.year);
    const month = Number(item.month);
    const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
    await ImportPeriod.updateOne(
      { key: item._id },
      {
        $set: {
          key: item._id,
          year,
          month,
          label,
          totalCount: Number(item.totalCount ?? 0),
          polymerCount: Number(item.polymerCount ?? 0),
          nonPolymerCount: Number(item.nonPolymerCount ?? 0),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const formData = await request.formData();
    const uploadedFile = formData.get('file');
    const dryRun = formData.get('dryRun') === 'true' || formData.get('dryRun') === '1';
    const sourceFile = typeof formData.get('sourceFile') === 'string' ? String(formData.get('sourceFile')) : 'uploaded.csv';

    if (!(uploadedFile instanceof File)) {
      return NextResponse.json({ error: 'A CSV file is required' }, { status: 400 });
    }

    const csvText = Buffer.from(await uploadedFile.arrayBuffer()).toString('utf8').replace(/^\uFEFF/, '');
    const delimiter = detectDelimiter(csvText.slice(0, 5000) || csvText);
    const parsed = Papa.parse<string[]>(csvText, {
      delimiter,
      header: false,
      skipEmptyLines: true,
      transformHeader: (value) => value ?? '',
    });

    const rows = Array.isArray(parsed.data) ? (parsed.data as string[][]) : [];
    if (rows.length < 2) {
      return NextResponse.json({ error: 'CSV file does not contain data rows', status: 400 });
    }

    const headers = rows[0].map((value) => String(value ?? '').trim());
    const sourceFormat = mapHeaders(headers).sourceFormat;
    const mapping = mapHeaders(headers);
    const mappedRows: Record<string, Primitive>[] = [];
    const issues: ImportIssue[] = [];
    const touchedPeriods = new Set<string>();
    const previewRows: Record<string, Primitive>[] = [];

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const rawRow = rows[rowIndex];
      if (!rawRow || rawRow.length === 0 || rawRow.every((value) => (value ?? '').trim() === '')) {
        continue;
      }

      const rowObject: Record<string, Primitive> = {};
      for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
        const fieldName = headers[columnIndex] ?? `column_${columnIndex}`;
        const value = rawRow[columnIndex];
        rowObject[fieldName] = value;
      }

      try {
        const normalizedRow = buildCanonicalDocument(rowObject, mapping);
        if (normalizedRow.periodKey) touchedPeriods.add(String(normalizedRow.periodKey));
        if (normalizedRow.periodKey === null || normalizedRow.periodKey === undefined) {
          issues.push({ row: rowIndex + 1, reason: 'No usable period date' });
        }

        mappedRows.push(normalizedRow);
        if (previewRows.length < 20) previewRows.push(normalizedRow);
      } catch (error) {
        issues.push({ row: rowIndex + 1, reason: error instanceof Error ? error.message : 'Unknown row processing error' });
      }
    }

    if (dryRun) {
      return NextResponse.json({
        sourceFormat,
        rowsRead: mappedRows.length,
        inserted: 0,
        updated: 0,
        skipped: issues.length,
        errors: issues,
        rowsWithoutPeriod: issues.filter((issue) => issue.reason === 'No usable period date').length,
        periodsTouched: Array.from(touchedPeriods),
        polymerRows: mappedRows.filter((row) => row.isPolymer === true).length,
        nonPolymerRows: mappedRows.filter((row) => row.isPolymer === false).length,
        mappingReport: mapping.report,
        preview: previewRows,
      });
    }

    if (mappedRows.length === 0) {
      return NextResponse.json({
        sourceFormat,
        rowsRead: 0,
        inserted: 0,
        updated: 0,
        skipped: issues.length,
        errors: issues,
        rowsWithoutPeriod: 0,
        periodsTouched: [],
        polymerRows: 0,
        nonPolymerRows: 0,
        mappingReport: mapping.report,
      });
    }

    const bulkOps: Array<{ updateOne: { filter: Record<string, unknown>; update: Record<string, unknown>; upsert: true } }> = [];
    for (const row of mappedRows) {
      const keyFields = [row['GD Number'], row['Item No']];
      const dedupeKey = keyFields.some((value) => value && String(value).trim() !== '')
        ? keyFields.map((value) => String(value ?? '')).join('|')
        : makeRowHash(row);

      const filter = {
        $or: [
          { 'GD Number': row['GD Number'], 'Item No': row['Item No'] },
          { importBatchId: dedupeKey },
        ],
      };

      bulkOps.push({
        updateOne: {
          filter,
          update: {
            $set: {
              ...row,
              importBatchId: dedupeKey,
              sourceFile,
              sourceFormat,
            },
          },
          upsert: true,
        },
      });
    }

    const bulkResult = await TradeData.collection.bulkWrite(bulkOps, { ordered: false });
    await refreshPeriodsForKeys(Array.from(touchedPeriods));

    const inserted = Number(bulkResult.insertedCount ?? 0);
    const updated = Number(bulkResult.modifiedCount ?? 0);
    const skipped = issues.length;

    return NextResponse.json({
      sourceFormat,
      rowsRead: mappedRows.length,
      inserted,
      updated,
      skipped,
      errors: issues,
      rowsWithoutPeriod: issues.filter((issue) => issue.reason === 'No usable period date').length,
      periodsTouched: Array.from(touchedPeriods),
      polymerRows: mappedRows.filter((row) => row.isPolymer === true).length,
      nonPolymerRows: mappedRows.filter((row) => row.isPolymer === false).length,
      mappingReport: mapping.report,
    });
  } catch (error) {
    console.error('Error importing trade CSV:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
