CREATE TABLE IF NOT EXISTS servicos (
    id              SERIAL PRIMARY KEY,
    nome            VARCHAR(80) NOT NULL UNIQUE,
    duracao_min     INTEGER NOT NULL DEFAULT 30 CHECK (duracao_min > 0),
    preco           NUMERIC(8, 2) NOT NULL CHECK (preco >= 0),
    ativo           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS clientes (
    id              SERIAL PRIMARY KEY,
    nome            VARCHAR(100) NOT NULL,
    telefone        VARCHAR(20) UNIQUE NOT NULL,
    email           VARCHAR(120) UNIQUE,
    senha_hash      TEXT,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamentos (
    id              SERIAL PRIMARY KEY,
    cliente_id      INTEGER NOT NULL REFERENCES clientes(id),
    servico_id      INTEGER NOT NULL REFERENCES servicos(id),
    data            DATE NOT NULL,
    horario         TIME NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pendente' 
                    CHECK (status IN ('pendente', 'confirmado', 'cancelado', 'concluido')),
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Impede dois agendamentos ativos no mesmo dia e horário
CREATE UNIQUE INDEX IF NOT EXISTS agendamento_horario_unico
  ON agendamentos (data, horario)
  WHERE status <> 'cancelado';

-- Serviços iniciais (ajuste os preços)
INSERT INTO servicos (nome, duracao_min, preco) VALUES
  ('Corte', 30, 40.00),
  ('Barba', 30, 30.00),
  ('Corte + Barba', 60, 65.00)
ON CONFLICT (nome) DO NOTHING;