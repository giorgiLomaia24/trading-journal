const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accountName: { type: String, required: true },
  accountType: { type: String, enum: ['Live', 'Demo', 'Funded', 'Challenge', 'Backtest'], required: true },
  initialBalance: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  broker: { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  startingDate: { type: Date, default: Date.now },
  maxDrawdown: { type: Number, default: null },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Account', AccountSchema);
