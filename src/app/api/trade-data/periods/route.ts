import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ImportPeriod from '@/models/ImportPeriod';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const dataType = searchParams.get('dataType') ?? 'all';

    const query: Record<string, unknown> = {};
    if (dataType === 'polymer') {
      query.polymerCount = { $gt: 0 };
    }
    if (dataType === 'non-polymer') {
      query.nonPolymerCount = { $gt: 0 };
    }

    const periods = await ImportPeriod.find(query).sort({ year: -1, month: -1 }).lean();
    return NextResponse.json({ periods });
  } catch (error) {
    console.error('Error fetching ImportPeriod list:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
