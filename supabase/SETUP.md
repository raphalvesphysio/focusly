# Supabase — MyFocusly multiplataforma (branch `personal`)

## 1. SQL
Supabase → **SQL Editor** → cole `supabase/schema.sql` → **Run**.

## 2. Auth
**Authentication → Providers** → Google e/ou Email.

**Redirect URLs** (use a URL do site desta branch, não a `main`):
- `https://SEU-SITE-PERSONAL.netlify.app/legacy/`
- `http://localhost:3847/legacy/`

## 3. Config
Copie `cloud/config.example.json` → `cloud/config.json` (local).

**Netlify (branch personal):** variáveis de ambiente:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Build gera `dist/legacy/cloud/config.json` automaticamente.

## 4. Uso
App → **Backup** → **Entrar com Google** (ou e-mail).

Veja também `docs/VERSIONS.txt`.
