const mongoose = require('mongoose');

const StrategySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  strategyName: { type: String, required: true }, // მაგ: "BREAKEOUT"
  description: { type: String, default: '' },
  color: { type: String, default: '#3b82f6' }, // ნაგულისხმევი ლურჯი ფერი
  
  // მომხმარებლის მიერ შექმნილი დინამიური წესები
  rules: [
    {
      ruleId: { type: String, required: true }, // მაგ: "item-1791857853865"
      text: { type: String, required: true }    // მაგ: "დაველოდე 5 წუთიან სანთელს"
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Strategy', StrategySchema);
