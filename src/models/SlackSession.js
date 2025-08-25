const mongoose = require('mongoose');

const SlackSessionSchema = new mongoose.Schema(
  {
    slackUserId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, required: false },
    role: { type: String, required: false },
  },
  { timestamps: true }
);  

// Ensure per-user-per-channel uniqueness
SlackSessionSchema.index({ slackUserId: 1, channelId: 1 }, { unique: true });

const SlackSessionModel = mongoose.model('SlackSession', SlackSessionSchema);
module.exports = SlackSessionModel;
