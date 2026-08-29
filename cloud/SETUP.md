# Google Drive — MyFocusly multiplataforma (branch `personal`)

Seus dados ficam no **Google Drive da conta que entrar** — não em banco de terceiros.

## 1. Google Cloud (uma vez)

1. [Google Cloud Console](https://console.cloud.google.com/) → novo projeto (ex.: MyFocusly)
2. **APIs & Services → Library** → ative **Google Drive API** e **Google Calendar API**
3. **OAuth consent screen** → External → preencha nome do app → adicione seu e-mail como test user (modo teste)
4. **Credentials → Create credentials → OAuth client ID** → tipo **Web application**
5. **Authorized JavaScript origins:**
   - `https://SEU-SITE.netlify.app`
   - `http://localhost:3847` (teste local)
6. Copie o **Client ID** (termina em `.apps.googleusercontent.com`)

## 2. Config

Copie `cloud/config.example.json` → `cloud/config.json` e cole o Client ID.

**Netlify:** variável `GOOGLE_CLIENT_ID` (o build gera `config.json` sozinho).

## 3. Uso

App → **Backup** → **Entrar com Google** → mesmo login no iPad.

Arquivo: `myfocusly-backup.json` (área privada do app no Drive — não aparece na pasta normal).

**Google Agenda:** após entrar, marque *Mostrar Google Agenda no calendário* em Backup. Eventos aparecem em azul (só leitura; não vão pro backup). Se já estava logado antes, saia e entre de novo para autorizar o Calendar.

Veja `docs/VERSIONS.txt`.
