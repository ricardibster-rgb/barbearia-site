require ('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/db-teste', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS agora');
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao consultar o banco de dados:', error);
    res.status(500).json({ error: 'Erro ao consultar o banco de dados' });
  }
});

app.listen(PORT, () => {
  console.log(`Rodando em http://localhost:${PORT}`);
});