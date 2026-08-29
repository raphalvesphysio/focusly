# Supabase — sync MyFocusly (PC + iPad)

## 1. SQL
No painel Supabase: **SQL Editor** → cole `supabase/schema.sql` → **Run**.

## 2. Auth
**Authentication → Providers**
- Ative **Google** (ou use só **Email** com magic link)
- **URL Configuration → Redirect URLs**, adicione:
  - `https://myfocusly.netlify.app/legacy/`
  - `http://localhost:3847/legacy/` (dev)

## 3. Config no projeto
Copie `supabase.config.example.json` → `supabase.config.json` e preencha **URL** e **anon key** (Settings → API).

Faça deploy de novo (push no GitHub).

**Netlify (recomendado):** Site settings → Environment variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 4. Uso
No app: **Backup → Entrar com Google** (ou e-mail). Depois disso sync automático.
