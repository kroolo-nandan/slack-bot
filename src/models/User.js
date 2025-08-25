const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
              // Recommended: emails should be unique
      lowercase: true,        // Normalize emails to lowercase
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      // Optional: if this references another model, add ref:
      // ref: 'User', 
    },
    status: {
      type: String,
      required: true,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    country: {
      type: String,
      required: false,
    },
    dob: {
      type: String,
      required: false,
    },
    mobile: {
      type: String,
      required: false,
    },
    profileImage: {
      type: String,
      required: false,
    },
    profileCreatedOn: {
      type: String,
      required: false,
    },
    about: {
      type: String,
      required: false,
    },
    banner: {
      image: {
        type: String,
        required: false,
      },
      color: {
        type: String,
        required: false,
      },
      type: {
        type: String,
        required: false,
      },
      yOffset: {
        type: Number,
        required: false,
      },
    },
  },
  {
    timestamps: true,
    autoIndex: true,  // Ensure indexes are created automatically
  }
);

const UserModel = mongoose.model("User", UserSchema);

module.exports = UserModel;
