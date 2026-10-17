const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  normalizedEmail: { type: String, required: true },
  password: { type: String, required: true }, // ამას რეგისტრაციისას დავამატებთ
  avatar: { type: String, default: null },
  role: { type: String, default: 'user' },
  tradingSessions: { 
    type: [String], 
    default: [] 
  },
  lastLoginAt: { type: Date, default: Date.now },
  
  // მომხმარებლის პარამეტრები
  settings: {
    notifications: {
      email: { trades: { type: Boolean, default: true }, weekly: { type: Boolean, default: true }, marketing: { type: Boolean, default: false } },
      push: { trades: { type: Boolean, default: true }, goals: { type: Boolean, default: true } }
    },
    trading: {
      defaultAccount: { type: String, default: "Main Account" },
      weekStart: { type: String, default: "Monday" }
    },
    theme: { type: String, default: "dark" },
    currency: { type: String, default: "USD" },
    timezone: { type: String, default: "America/New_York" }
  },
  
  // აქტივობის სტრეიკები
  streaks: {
    loginStreak: { type: Number, default: 0 },
    loginStreakLastUpdated: { type: Date, default: null },
    tradingStreak: { type: Number, default: 0 },
    tradingStreakLastUpdated: { type: Date, default: null },
    lastTradingDate: { type: Date, default: null }
  },

  passwordResetToken: { type: String, default: null },
  passwordResetExpires: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
