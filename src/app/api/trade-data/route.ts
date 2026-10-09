import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import TradeData from '@/models/TradeData';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSortField(value: string | null): string {
  const safe = value ?? 'parsedCashDate';
  const map: Record<string, string> = {
    cashDate: 'parsedCashDate',
    'CASH DATE': 'parsedCashDate',
    'Item Description': 'Item Description',
    'Importer Name': 'Importer Name',
    'Consignor Name': 'Consignor Name',
    'HS CODE': 'HS CODE',
    'GD Number': 'GD Number',
    'periodKey': 'periodKey',
  };

  return map[safe] ?? 'parsedCashDate';
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(Math.max(1, Number.parseInt(searchParams.get('limit') ?? '20', 10) || 20), 200);
    const search = searchParams.get('search') ?? '';
    const dataType = searchParams.get('dataType') ?? 'all';
    const period = searchParams.get('period') ?? '';
    const sort = normalizeSortField(searchParams.get('sort') ?? 'parsedCashDate');
    const sortDirection = searchParams.get('sortDirection') === 'asc' ? 1 : -1;

    const query: Record<string, unknown> = {};
    if (dataType === 'polymer') query.isPolymer = true;
    if (dataType === 'non-polymer') query.isPolymer = false;
    if (period) query.periodKey = period;

    if (search.trim()) {
      const escaped = escapeRegex(search.trim());
      query.$or = [
        { 'Item Description': { $regex: escaped, $options: 'i' } },
        { 'Importer Name': { $regex: escaped, $options: 'i' } },
        { 'Consignor Name': { $regex: escaped, $options: 'i' } },
        { 'HS CODE': { $regex: escaped, $options: 'i' } },
        { 'GD Number': { $regex: escaped, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [records, total] = await Promise.all([
      TradeData.find(query).sort({ [sort]: sortDirection }).skip(skip).limit(limit),
      TradeData.countDocuments(query),
    ]);

    return NextResponse.json({
      data: records.map((record) => record.toObject()),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching trade-data rows:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
