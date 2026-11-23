// Local development only. On Vercel, api/index.js runs as a serverless function.
const path = require('path');
const express = require('express');
const app = require('./api/index.js');

app.use(express.static(path.join(__dirname, 'public')));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Chordbook running at http://localhost:${port}`));
