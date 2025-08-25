const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Company',
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
    role: {
      type: String,
      required: true,
      enum: ['admin', 'user', 'owner', 'Admin', 'User', 'Owner'],
      default: 'user',
    },
    department: {
      type: String,
    },
    reportingManagerId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    reportingManagerName: String,
    reportingManagerEmail: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
    },
    createdByName: String,
    createdByEmail: String,
    designation: String,
  },
  { timestamps: true }
);

const MembersModel = mongoose.model('Members', MemberSchema);
module.exports = MembersModel;
