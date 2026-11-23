const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String, required: [true, 'Username is required'], unique: true, trim: true,
      minlength: [3, 'Username needs at least 3 characters'], maxlength: 30,
      match: [/^[\w.\-]+$/, 'Username can use letters, numbers, . _ and -']
    },
    email: {
      type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email']
    },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
