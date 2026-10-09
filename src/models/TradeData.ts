import mongoose from 'mongoose';

const TradeDataSchema = new mongoose.Schema({
  // Original CSV fields
  'HS CODE': { type: String },
  'Item Description': { type: String },
  'Origin': { type: String },
  'Importer Name': { type: String },
  'Importer ADDRESS': { type: String },
  'Consignor Name': { type: String },
  'Consignor Address': { type: String },
  'Agent Name': { type: String },
  'CASH DATE': { type: String },
  'IGM Date': { type: String },
  'Curr': { type: String },
  'USA RATE': { type: String },
  'USA VAL': { type: String },
  'DECL CURR': { type: String },
  'DECL RATE': { type: String },
  'DECL VAL': { type: String },
  'ASSESSED RATE': { type: String },
  'TOTAL PKR VALU ASSESSED': { type: String },
  'Cash NO': { type: String },
  'Quantity': { type: String },
  'Unit': { type: String },
  'Agent NO': { type: String },
  'PAID A STAX': { type: String },
  'PAID STAX': { type: String },
  'PAID DUTY': { type: String },
  'Additional Customs Duty': { type: String },
  'INCOME TAX': { type: String },
  'Federal Excise Duty': { type: String },
  'AntiDumping Duty': { type: String },
  'SRO-1': { type: String },
  'SRO-2': { type: String },
  'SRO-3': { type: String },
  'SRO-4': { type: String },
  'Regulatory Duty': { type: String },
  'Gross Weight': { type: String },
  'Net Weight': { type: String },
  'LC No': { type: String },
  'LC Date': { type: String },
  'BL Number': { type: String },
  'BL Date': { type: String },
  'PORT': { type: String },
  'B/E TYPE': { type: String },
  'Machine No': { type: String },
  'GD Number': { type: String },
  'BE DATE': { type: String },
  'Item No': { type: String },
  'IGM NO': { type: String },
  'INDEX NO': { type: String },
  'NTN': { type: String },
  'Port of Shipment': { type: String },
  'Terminal/Sheds': { type: String },
  'Vessel Name': { type: String },
  'ShippingLines': { type: String },
  
  // Extracted/normalized grade fields (for reliable grouping)
  polymerType: { 
    type: String, 
    enum: ['LLDPE', 'LDPE', 'HDPE', 'MDPE', 'PP', 'OFFGRADE', null],
    index: true 
  },

  gradeCode: { 
    type: String, 
    index: true 
  },
  normalizedGrade: { 
    type: String, 
    index: true  // Primary field for grouping queries
  },
  gradeExtractionConfidence: {
    type: String,
    enum: ['high', 'medium', 'low', null],
    index: true
  },
  
  // Parsed dates and period metadata
  parsedIGMDate: { 
    type: Date, 
    index: true 
  },
  parsedCashDate: {
    type: Date,
    index: true
  },
  hsCodeNormalized: { type: String, index: true },
  hsChapter: { type: String, index: true },
  hsCodeConfidence: { type: String, enum: ['high', 'low', null] },
  isPolymer: { type: Boolean, index: true },
  periodYear: { type: Number, index: true },
  periodMonth: { type: Number, index: true },
  periodKey: { type: String, index: true },
  periodLabel: { type: String },
  sourceFormat: { type: String, enum: ['A', 'C', 'D', 'unknown', null] },
  sourceFile: { type: String },
  importBatchId: { type: String },
  gdSerial: { type: String },
  weightUnit: { type: String },
  consignorShortName: { type: String },
  assessedUnitValue: { type: String },
  declaredUnitValue: { type: String },
  splFed: { type: String },
  gst: { type: String },
  others: { type: String },
  channel: { type: String },
  chapter: { type: String },
}, {
  timestamps: true,
  strict: false, // Allow custom fields
});

// Compound indexes for common query patterns
TradeDataSchema.index({ normalizedGrade: 1, 'CASH DATE': -1 });
TradeDataSchema.index({ polymerType: 1, gradeCode: 1 });
TradeDataSchema.index({ normalizedGrade: 1, 'Importer Name': 1 });
TradeDataSchema.index({ 'Importer Name': 1, normalizedGrade: 1 });
TradeDataSchema.index({ isPolymer: 1, periodYear: 1, periodMonth: 1 });
TradeDataSchema.index({ periodKey: 1 });

export default mongoose.models.TradeData || mongoose.model('TradeData', TradeDataSchema);
