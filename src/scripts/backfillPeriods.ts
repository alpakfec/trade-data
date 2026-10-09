import dbConnect from '../lib/mongodb';
import ImportPeriod from '../models/ImportPeriod';
import TradeData from '../models/TradeData';
import { extractGrade } from '../lib/gradeExtraction';
import { derivePeriod, extractDateFromIGM, normalizeHsCode, parseDate } from '../lib/import/rowProcessor';

async function main() {
  await dbConnect();

  const documents = await TradeData.find({});

  for (const document of documents) {
    const description = typeof document['Item Description'] === 'string' ? document['Item Description'] : '';
    const hsValue = document['HS CODE'] ?? document['PCT'];
    const hs = normalizeHsCode(String(hsValue ?? ''), description);

    const cashDate = parseDate(document['CASH DATE'] ?? document['Cash Date']);
    const beDate = parseDate(document['BE DATE'] ?? document['DATE']);
    const igmDate = parseDate(document['IGM Date'] ?? document['IGM NO'] ?? document['IGM']);
    const fallbackIgm = extractDateFromIGM(String(document['IGM NO'] ?? document['IGM'] ?? ''));
    const periodDate = cashDate ?? beDate ?? igmDate ?? fallbackIgm ?? null;
    const period = derivePeriod(periodDate, String(document['Month'] ?? ''), String(document['Year'] ?? ''));

    const rowIsPolymer = hs.hsChapter === '39';
    const gradeInfo = rowIsPolymer ? extractGrade(description) : { polymerType: null, gradeCode: null, normalizedGrade: null, confidence: 'low' as const };

    await TradeData.updateOne(
      { _id: document._id },
      {
        $set: {
          hsCodeNormalized: hs.hsCodeNormalized ?? null,
          hsChapter: hs.hsChapter ?? null,
          hsCodeConfidence: hs.hsCodeConfidence ?? null,
          isPolymer: rowIsPolymer,
          polymerType: rowIsPolymer ? gradeInfo.polymerType : null,
          gradeCode: rowIsPolymer ? gradeInfo.gradeCode : null,
          normalizedGrade: rowIsPolymer ? gradeInfo.normalizedGrade : null,
          gradeExtractionConfidence: rowIsPolymer ? gradeInfo.confidence : null,
          parsedCashDate: cashDate ?? undefined,
          parsedIGMDate: igmDate ?? fallbackIgm ?? undefined,
          periodYear: period.periodYear,
          periodMonth: period.periodMonth,
          periodKey: period.periodKey,
          periodLabel: period.periodLabel,
          sourceFormat: document.sourceFormat ?? 'unknown',
        },
      },
    );
  }

  const periodRollup = await TradeData.aggregate([
    { $match: { periodKey: { $ne: null } } },
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

  for (const group of periodRollup) {
    const key = String(group._id);
    const year = Number(group.year);
    const month = Number(group.month);
    const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));

    await ImportPeriod.updateOne(
      { key },
      {
        $set: {
          key,
          year,
          month,
          label,
          totalCount: Number(group.totalCount ?? 0),
          polymerCount: Number(group.polymerCount ?? 0),
          nonPolymerCount: Number(group.nonPolymerCount ?? 0),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  console.log(`Backfilled ${documents.length} trade rows and ${periodRollup.length} periods.`);
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exitCode = 1;
});
