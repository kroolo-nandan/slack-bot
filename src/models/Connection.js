
// Minimal Connection Model
// Only essential fields for user-tool connection tracking

const mongoose = require('mongoose');


const connectionSchema = new mongoose.Schema({
  slackUserId: { type: String, required: true, index: true },
  appNames: { type: [String], default: [], required: true }, // Array of app names
  accountIds: { type: [String], default: [], required: true }, // Array of account IDs
  accountEmails: { type: String, default: "" }, // Optional: array of emails per account
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  connectedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  collection: 'connections'
});

const Connection = mongoose.model('Connection', connectionSchema);
module.exports = Connection;
