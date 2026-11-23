const mongoose = require('mongoose');

const GENRES = ['Jazz', 'R&B', 'Pop', 'Rock', 'Blues', 'Soul', 'Hip-Hop', 'Folk', 'Gospel', 'Classical', 'Other'];
const TIMES = ['4/4', '3/4', '2/4', '6/8', '5/4', '7/8', '12/8'];
// Root note, then the modifier tokens from the builder: M m # b digits / add sus ø +
const CHORD = /^[A-G]([#b]|M|m|add|sus|ø|\+|\d|\/[A-G][#b]?)*$/;

const chordSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, maxlength: 20, match: [CHORD, 'Unrecognised chord symbol'] },
    beats: { type: Number, min: 1, max: 8, default: 2 } // spacing after the chord
  },
  { _id: false }
);
const lineSchema = new mongoose.Schema({ chords: [chordSchema] }, { _id: false });

const songSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Give your song a name'], trim: true, maxlength: 100 },
    key: { type: String, required: [true, 'Choose a key'], match: [/^[A-G][#b]?$/, 'Key must look like C, F# or Bb'] },
    timeSignature: { type: String, enum: TIMES, default: '4/4' },
    genre: { type: String, enum: GENRES },
    lines: {
      type: [lineSchema],
      validate: [(v) => v.some((l) => l.chords.length > 0), 'Add at least one chord']
    },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ownerName: { type: String, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.models.Song || mongoose.model('Song', songSchema);
