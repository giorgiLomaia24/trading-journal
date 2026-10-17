const mongoose = require('mongoose');

const TradeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true }, // სავაჭრო ანგარიშის ID
  symbol: { type: String, required: true }, // მაგ: "MNQ", "EUR/USD"
  type: { type: String, enum: ['buy', 'sell'], required: true },
  quantity: { type: Number, required: true },
  
  entryPrice: { type: Number, default: null },
  exitPrice: { type: Number, default: null },
  entryDate: { type: Date, required: true },
  exitDate: { type: Date, required: true },
  
  pnl: { type: Number, required: true }, // მოგება/ზარალი
  risk: { type: Number, required: true },
  riskType: { type: String, default: 'usd' },
  riskRewardRatio: { type: Number, required: true }, // R-Multiple
  
  session: { type: String, required: true }, // მაგ: "NY AM", "LONDON"
  status: { type: String, enum: ['open', 'closed'], default: 'closed' },
  strategy: { type: String, required: true }, // სტრატეგიის სახელი
  
  checkedRules: { type: [String], default: [] }, // შესრულებული წესების ID-ები ("item-123")
  result: { type: [String], enum: ['Win', 'Loss', 'Breakeven'], required: true },
  
  tags: { type: [String], default: [] },
  notes: { type: String, default: '' },
  emotions: { type: [String], default: [] }, // მაგ: ["confident", "focused"]
  reflection: { type: String, default: null },
  
  // სურათების ლინკების მასივი (მაქსიმუმ 6)
  images: {
    type: [String],
    validate: [arrayLimit, '{PATH} აჭარბებს მაქსიმუმ 6 სურათის ლიმიტს']
  },
  
  fees: {
    entry: { type: Number, default: 0 },
    exit: { type: Number, default: null }
  },
  
  metadata: {
    importedAt: { type: Date, default: null }
  }
}, { timestamps: true });

// ვალიდატორი სურათების რაოდენობის შეზღუდვისთვის
function arrayLimit(val) {
  return val.length <= 6;
}

module.exports = mongoose.model('Trade', TradeSchema);
