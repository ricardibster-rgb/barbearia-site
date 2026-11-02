require ('dotenv').config();
if (!process.env.JWT_SECRET) {
  console.error('Defina JWT_SECRET no arquivo .env');
  process.exit(1);
}
const express = require('express');
const path = require('path');
const pool = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// --------- Regras de funcionamento ---------
const ABERTURA = '09:00';
const FECHAMENTO = '19:00';       // o último horário começa 30 min antes
const INTERVALO_MIN = 30;
const DIAS_ABERTOS = [1, 2, 3, 4, 5, 6];    // 0 = domingo, 1 = segunda ... 6 = sábado.

// Data e hora atuais no Brasil, independentemente do fuso do servidor
function agoraBrasil() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const p = Object.fromEntries(partes.map(x => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

// Confere se a data existe de verdade
function dataValida(data) {
  const [hi, mi] = ABERTURA.split(':').map(Number);
  const [hf, mf] = FECHAMENTO.split(':').map(Number);
  const lista = [];
  for (let m = hi * 60 + mi; m < hf * 60 + mf; m += INTERVALO_MIN) {
    lista.push(
      String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
    );
  }
  return lista;
}

// Horários do dia que ainda estão livres.
function gerarHorarios() {
  const [hi, mi] = ABERTURA.split(':').map(Number);
  const [hf, mf] = FECHAMENTO.split(':').map(Number);
  const lista = [];
  for (let m = hi * 60 + mi; m < hf * 60 + mf; m += INTERVALO_MIN) {
    lista.push(
      String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
    );
  }
  return lista;
}

async function horariosLivres(data) {
  const diaSemana = new Date(data + 'T12:00:00Z').getUTCDay();
  if (!DIAS_ABERTOS.includes(diaSemana)) return [];

  const agora = agoraBrasil();
  if (data < agora.data) return [];

  const ocupados = await pool.query(
    `SELECT to_char(horario, 'HH24:MI') AS horario FROM agendamentos
    WHERE data = $1 AND status <> 'cancelado'`,
    [data]
  );
  const set = new Set(ocupados.rows.map(r => r.horario));

  return gerarHorarios().filter(
    h => !set.has(h) && !(data === agora.data && h <= agora.hora)
  );
}

const COOKIE = 'sessao';
const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

function criarSessao(res, clienteId) {
  const token = jwt.sign({ id: clienteId }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SETE_DIAS,
  });
}

function lerSessao(req, res, next) {
  try {
    req.clienteId = jwt.verify(req.cookies[COOKIE], process.env.JWT_SECRET).id;
  } catch {
    req.clienteId = null; 
  }
  next();
}
app.use(lerSessao);

function exigirLogin (req, res, next) {
  if (!req.clienteId) return res.status(401).json({ erro: 'Faça login para continuar.' });
  next()
}



app.use(express.json());
app.use(cookieParser());
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

  if (!dataValida(data)) {
    return res.status(400).json({ erro: 'Data inválida.'});
  }

  try {
    const livres = await horariosLivres(data);
    if (!livres.includes(horario)) {
      return res.status(409).json({ erro: 'Esse horário não está disponível. Escolha outro.'});
    }
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

app.get('/api/horarios', async (req, res) => {
  const { data } = req.query;
  if (!dataValida(data)) {
    return res.status(400).json({ erro: 'Data inválida.' });
  }
  try {
    res.json(await horariosLivres(data));
  } catch (error) {
    console.error('Erro ao buscar horários:', error);
    res.status(500).json({ erro: 'Erro ao buscar horários.' });
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

const CAMPOS_CONFIG = [
  'nome', 'slogan', 'telefone', 'whatsapp', 'endereco', 'horarios',
  'instagram', 'facebook', 'foto_url', 'lat', 'lng'
];
const CAMPOS_URL = ['instagram', 'facebook', 'foto_url'];

app.get('/api/config', async (req, res) => {
  try {
    const r = await pool.query('SELECT chave, valor FROM configuracoes');
    res.json(Object.fromEntries(r.rows.map(x => [x.chave, x.valor])))
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    res.status(500).json({ erro: 'Erro ao buscar configurações.' })
  }
})

app.put('/api/admin/config', exigirAdmin, async (req, res) => {
  const corpo = req.body || {};
  const chaves = [];
  const valores = [];

  for (const k of CAMPOS_CONFIG) {
    if (!(k in corpo)) continue;
    const v = String(corpo[k] ?? '').trim().slice(0, 500);

    if (CAMPOS_URL.includes(k) && v && !/^https?:\/\//i.test(v)) {
      return res.status(400).json({ erro: `O campo ${k} deve começar com http:// ou https://`})
    }
    if (k === 'lat' && v && !(Math.abs(Number(v)) <= 90)) {
      return res.status(400).json({ erro: 'Latitude inválida' });
    }
    if (k === 'lng' && v && !(Math.abs(Number(v)) <= 180)) {
      return res.status(400).json({ erro: 'Longitude inválida' });
    }

    chaves.push(k);
    valores.push(v);
  }

  try {
    await pool.query(
      `INSERT INTO configuracoes (chave, valor) SELECT * FROM unnest($1::text[], $2::text[])
      ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
      [chaves, valores]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    res.status(500).json({ erro: 'Erro ao salvar configurações.' });
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+/;
const HASH_FALSO = bcrypt.hashSync('senha-falsa-para-igualar-o-tempo', 10);

app.post('/api/auth/cadastro', async (req, res) => {
  const { nome, telefone, email, senha } = req.body || {};
  const nomeOk = typeof nome === 'string' ? nome.trim() : '';
  const tel = typeof telefone === 'string' ? telefone.replace(/\D/g, '') : '';
  const mail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!nomeOk || !tel || !mail || typeof senha !== 'string') {
    return res.status(400).json({ erro: 'Preencha todos os campos.' });
  }
  if (tel.length < 10 || tel.length > 11) {
    return res.status(400).json({ erro: 'Telefone inválido. Use DDD + número.' });
  }
  if (!EMAIL_RE.test(mail) || mail.length > 120) {
    return res.status(400).json({ erro: 'E-mail inválido.' });
  }
  if (senha.length < 8 || senha.length > 15) {
    return res.status(400).json({ erro: 'A senha deve ter de 8 a 15 caracteres.' });
  }
  try {
    const hash = await bcrypt.hash(senha, 10);

    const r = await pool.query(
      `INSERT INTO clientes (nome, telefone, email, senha_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telefone) DO UPDATE
         SET nome = EXCLUDED.nome, email = EXCLUDED.email, senha_hash = EXCLUDED.senha_hash
         WHERE clientes.senha_hash IS NULL
       RETURNING id`,
      [nomeOk.slice(0, 100), tel, mail, hash]
    );

    if (r.rowCount === 0) {
      return res.status(409).json({ erro: 'Já existe uma conta com esse telefone.' });
    }
    criarSessao(res, r.rows[0].id);
    res.status(201).json({ ok: true });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ erro: 'Esse e-mail já está cadastrado.' });
    }
    console.error('Erro no cadastro:', error);
    res.status(500).json({ erro: 'Erro ao criar conta.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, senha } = req.body || {};
  if (typeof email !== 'string' || typeof senha !== 'string' || !email.trim() || !senha) {
    return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  }

  try {
    const r = await pool.query(
      'SELECT id, nome, senha_hash FROM clientes WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    const cliente = r.rows[0];
    const confere = await bcrypt.compare(senha, cliente?.senha_hash || HASH_FALSO);

    if (!cliente || !cliente.senha_hash || !confere) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }
    criarSessao(res, cliente.id);
    res.json({ nome: cliente.nome });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ erro: 'Erro ao entrar.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get('/api/auth/eu', async (req, res) => {
  if (!req.clienteId) return res.status(401).json({ erro: 'Não autenticado.' });
  try {
    const r = await pool.query(
      'SELECT id, nome, telefone, email FROM clientes WHERE id = $1',
      [req.clienteId]
    );
    if (r.rowCount === 0) {
      res.clearCookie(COOKIE);
      return res.status(401).json({ erro: 'Não autenticado.' });
    }
    res.json(r.rows[0]);
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
    res.status(500).json({ erro: 'Erro ao buscar dados.' });
  }
});

app.listen(PORT, () => {
  console.log(`Rodando em http://localhost:${PORT}`);
});