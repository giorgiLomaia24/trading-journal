const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    sessionName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30
    },
    // მცირე ასოებით გასაღები, რომ "NY AM" და "ny am" ერთ სესიად ჩაითვალოს
    nameKey: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

// ერთ მომხმარებელს ერთი და იგივე სახელის ორი სესია ვერ ექნება
sessionSchema.index({ userId: 1, nameKey: 1 }, { unique: true });

module.exports = mongoose.model('Session', sessionSchema);