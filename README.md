# Impactour

Sistema simples de gestão de passeios turísticos:

- **Passeios** — cadastro dos passeios (custo /pax)
- **Lançar** — por dia, quantas pessoas em cada passeio
- **Dashboard** — custo de operação, custo médio por pessoa e nº de pessoas, + gráficos

Stack: React + Vite + Tailwind, dados no **Supabase**, deploy via **Docker** (nginx).

## 1. Criar as tabelas no Supabase

No painel do Supabase → **SQL Editor** → cole e rode o conteúdo de
[`supabase/schema.sql`](supabase/schema.sql). Isso cria as tabelas `passeios` e
`lancamentos` e libera o acesso **apenas para usuários autenticados** (é preciso
fazer login no app).

## 1b. Criar o usuário de login

O app usa Supabase Auth (e-mail + senha). Como é single-user, crie o usuário pelo
painel em vez de abrir cadastro público:

1. **Authentication → Users → Add user** → informe e-mail e senha e marque
   **"Auto Confirm User"** (assim não precisa confirmar por e-mail).
2. **Authentication → Sign In / Providers → Email** → **desative** "Allow new
   users to sign up", para que ninguém mais consiga se cadastrar sozinho.

## 2. Configurar credenciais

Copie `.env.example` para `.env` e preencha com os dados do seu projeto
(Supabase → Project Settings → API):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

## 3. Rodar em desenvolvimento

```bash
npm install
npm run dev
```

Abre em http://localhost:5173

## 4. Rodar com Docker

As credenciais entram como variáveis de ambiente (não precisa rebuildar a imagem
pra trocar de projeto — o `config.js` é gerado quando o container sobe).

Com docker-compose (recomendado): crie um `.env` na raiz com `SUPABASE_URL` e
`SUPABASE_ANON_KEY` e rode:

```bash
docker compose up -d --build
```

App em http://localhost:8080

Ou com docker puro:

```bash
docker build -t impactour .
docker run -d -p 8080:80 \
  -e SUPABASE_URL="https://xxxx.supabase.co" \
  -e SUPABASE_ANON_KEY="eyJhbGciOi..." \
  impactour
```

## Como o cálculo funciona

- **Custo do dia** = Σ (pessoas × custo /pax)
- **Custo médio por pessoa** = custo total ÷ nº de pessoas
