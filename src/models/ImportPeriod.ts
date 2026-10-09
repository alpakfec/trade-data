import mongoose from 'mongoose';

const ImportPeriodSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  year: { type: Number, required: true, index: true },
  month: { type: Number, required: true, index: true },
  label: { type: String, required: true },
  totalCount: { type: Number, default: 0 },
  polymerCount: { type: Number, default: 0 },
  nonPolymerCount: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

ImportPeriodSchema.index({ year: 1, month: 1 }, { unique: true });

export default mongoose.models.ImportPeriod || mongoose.model('ImportPeriod', ImportPeriodSchema);
