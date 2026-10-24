require ('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function exigirAdmin(req, res, next) {
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) {
    return res.status(500).json({ erro: 'ADMIN_PASSWORD não configurada no servidor.' });  
  }
  if (req.get('x-admin-password') !== senha) {
    return res.status(401).json({ erro: 'Senha incorreta.' });
  }
  next();
}

app.get('/api/servicos', async (req, res) => {
  try {
    const result = await pool.query( 
      'SELECT id, nome, duracao_min, preco FROM servicos WHERE ativo ORDER BY id'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar serviços:', error);
    res.status(500).json({ erro: 'Erro ao buscar serviços' });
  }
})

app.post('/api/agendamentos', async (req, res) => {
  const { nome, telefone, servico_id, data, horario } = req.body;

  if (!nome?.trim() || !telefone?.trim() || !servico_id || !data?.trim() || !horario?.trim()) {
    return res.status(400).json({ erro: 'Preencha todos os campos' });
  }

  const tel = telefone.replace(/\D/g, '');
  if (tel.length < 10 || tel.length > 11) {
    return res.status(400).json({ erro: 'Telefone inválido. Use DDD + número.' });
  }

  try {
    const servico = await pool.query (
      'SELECT id FROM servicos WHERE id = $1 AND ativo',
      [servico_id]
    );
    if (!servico.rows.length) {
      return res.status(400).json({ erro: 'Serviço inválido' });
    }

    const cliente = await pool.query (`INSERT INTO clientes (nome, telefone) VALUES ($1, $2) 
      ON CONFLICT (telefone) DO UPDATE SET telefone = EXCLUDED.telefone RETURNING id`, 
      [nome.trim(), tel]);

    const agendamento = await pool.query( 
      `INSERT INTO agendamentos (cliente_id, servico_id, data, horario) 
      VALUES ($1, $2, $3, $4) RETURNING id`,
      [cliente.rows[0].id, servico_id, data, horario]
    );

    res.status(201).json({ id: agendamento.rows[0].id });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ erro: 'Esse horário já está ocupado. Escolha outro.'});
    }
    if (error.code === '22007' || error.code === '22008') {
      return res.status(400).json({ erro: 'Data ou horário inválido.' })
    }
    if (error.code === '22P02') {
      return res.status(400).json({ erro: 'Dados inválidos.'});
    }
    console.error('Erro ao criar agendamento:', error);
    res.status(500).json({ erro: 'Erro ao criar agendamento.' });
  }
});

app.get('/api/admin/agendamentos', exigirAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, c.nome, c.telefone, s.nome AS servico,
              to_char(a.data, 'YYYY-MM-DD') AS data,
              to_char(a.horario, 'HH24:MI') AS horario,
              a.status
       FROM agendamentos a
       JOIN clientes c ON c.id = a.cliente_id
       JOIN servicos s ON s.id = a.servico_id
       WHERE ($1::date IS NULL OR a.data = $1::date)
       ORDER BY a.data, a.horario`,
      [req.query.data || null]
    );
    res.json(result.rows);
  } catch (error) {
    if (error.code === '22007' || error.code === '22008') {
      return res.status(400).json({ erro: 'Data inválida.' });
    }
    console.error('Erro ao listar agendamentos:', error);
    res.status(500).json({ erro: 'Erro ao listar agendamentos.' });
  }
});

app.patch('/api/admin/agendamentos/:id/status', exigirAdmin, async (req, res) => {
  const { status } = req.body;
  const permitidos = ['pendente', 'confirmado', 'cancelado', 'concluido'];

  if (!permitidos.includes(status)) {
    return res.status(400).json({ erro: 'Status inválidos.' });
  }

  try {
    const result = await pool.query(
      'UPDATE agendamentos SET status = $1 WHERE id = $2 RETURNING id',
      [status, req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ erro: 'Agendamento não encontrado.' });
    }
    res.json({ ok: true });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ erro: 'Esse horário já foi ocupado por outro agendamento.' });
    }
    if (error.code === '22P02') {
      return res.status(400).json({ erro: 'ID inválido.' });
    }
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({ erro: 'Erro ao atualizar status.' });
  }
});

app.listen(PORT, () => {
  console.log(`Rodando em http://localhost:${PORT}`);
});