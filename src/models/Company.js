const mongoose = require('mongoose');

const CompanySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    enableKnowledgeBase: {
      type: Boolean,
      default: false,
    },
    media: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Media',
      },
    ],
  },
  { timestamps: true }
);

const CompanyModel = mongoose.model('Company', CompanySchema);
module.exports = CompanyModel;
