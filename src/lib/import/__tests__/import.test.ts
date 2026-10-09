import { describe, expect, it } from 'vitest';
import { mapHeaders, normalizeHeader, detectSourceFormat } from '../mapHeaders';
import { parseDate, extractDateFromIGM, normalizeHsCode, derivePeriod, buildNormalizedTradeRow } from '../rowProcessor';

describe('header alias resolution', () => {
  it('maps format A canonical headers', () => {
    const headers = ['HS CODE', 'Item Description', 'Importer Name', 'Importer ADDRESS', 'Consignor Name', 'Consignor Address', 'CASH DATE', 'IGM Date'];
    const result = mapHeaders(headers);

    expect(result.sourceFormat).toBe('A');
    expect(result.mapped['HS CODE']).toBe('HS CODE');
    expect(result.mapped['Importer ADDRESS']).toBe('Importer ADDRESS');
    expect(result.mapped['Consignor Address']).toBe('Consignor Address');
  });

  it('handles format C duplicate headers', () => {
    const headers = ['ADDRESS', 'DATE', 'PCT', 'DESCRIPTION', 'EXPORTER', 'ADDRESS.1', 'DATE.1', 'DATE.2', 'UNIT', 'UNIT.1', 'CURR', 'CURR.1'];
    const result = mapHeaders(headers);

    expect(result.mapped['ADDRESS']).toBe('Importer ADDRESS');
    expect(result.mapped['ADDRESS.1']).toBe('Consignor Address');
    expect(result.mapped['DATE']).toBe('BE DATE');
    expect(result.mapped['DATE.1']).toBe('BL Date');
    expect(result.mapped['DATE.2']).toBe('LC Date');
    expect(result.mapped['UNIT']).toBe('Unit');
    expect(result.mapped['UNIT.1']).toBe('weightUnit');
    expect(result.mapped['CURR']).toBe('DECL CURR');
    expect(result.mapped['CURR.1']).toBe('Curr');
  });

  it('maps format D aliases without colliding the short Consignor Name', () => {
    const headers = ['Actual Importer Name', 'Importer Address', 'Actual Consignor Name', 'Consignor Name', 'Cash Date', 'Cash No', 'Machine No.', 'PT DUTY', 'PT STAX', 'PTSTAX'];
    const result = mapHeaders(headers);

    expect(result.mapped['Actual Importer Name']).toBe('Importer Name');
    expect(result.mapped['Actual Consignor Name']).toBe('Consignor Name');
    expect(result.mapped['Consignor Name']).toBe('consignorShortName');
    expect(result.mapped['Cash Date']).toBe('CASH DATE');
  });

  it('normalizes odd header characters and preserves duplicates', () => {
    expect(normalizeHeader('B/E TYPE')).toBe('betype');
    expect(normalizeHeader('ADDRESS.1')).toBe('address');
    expect(normalizeHeader('DATE.2')).toBe('date');
  });
});

describe('date parsing and HS normalization', () => {
  it('rejects the Excel corrupted time artifact', () => {
    expect(parseDate('45:55.6')).toBeNull();
  });

  it('normalizes low-confidence HS codes from description fallback', () => {
    const normalized = normalizeHsCode('8504.409', 'HS: 8504409990');

    expect(normalized.hsCodeNormalized).toBe('8504409990');
    expect(normalized.hsChapter).toBe('85');
    expect(normalized.hsCodeConfidence).toBe('low');
  });

  it('extracts ddMMyyyy from IGM numbers', () => {
    const date = extractDateFromIGM('KPAF-10801-01112025');
    expect(date).not.toBeNull();
    expect(date?.getUTCFullYear()).toBe(2025);
    expect(date?.getUTCMonth()).toBe(10);
    expect(date?.getUTCDate()).toBe(1);
  });

  it('derives period data from cash date and month/year fields', () => {
    const period = derivePeriod(new Date(Date.UTC(2026, 0, 9)), 'Jan', '2026');
    expect(period).toMatchObject({ periodYear: 2026, periodMonth: 1, periodKey: '2026-01', periodLabel: 'January, 2026' });
  });
});

describe('row processing and polymer logic', () => {
  it('skips grade extraction for non-polymer rows', () => {
    const row = buildNormalizedTradeRow({
      'HS CODE': '2601.0000',
      'Item Description': 'Copper ore',
      'Importer Name': 'Alpha',
      'CASH DATE': '09-Jan-26',
      'BE DATE': '20260109',
      'IGM NO': 'ABC-123',
    }, 'A');

    expect(row.isPolymer).toBe(false);
    expect(row.polymerType).toBeNull();
    expect(row.gradeCode).toBeNull();
    expect(row.normalizedGrade).toBeNull();
    expect(row.gradeExtractionConfidence).toBeNull();
    expect(row.periodKey).toBe('2026-01');
  });

  it('keeps sourceFormat detection aware of known layouts', () => {
    expect(detectSourceFormat(['HS CODE', 'Item Description', 'Importer Name', 'CASH DATE', 'PAID DUTY'])).toBe('A');
    expect(detectSourceFormat(['TERMINAL / SHED', 'TYPE', 'GD', 'DATE', 'PCT', 'DESCRIPTION'])).toBe('C');
    expect(detectSourceFormat(['Actual Importer Name', 'Cash Date', 'Assessed Value', 'PT DUTY'])).toBe('D');
  });
});
