# Gloss, the family library

A self-hosted shelf for a family's homeschool work. Each book on it is one of two things:

- **An activity**, which opens another site in a new tab (a math arcade, a typing game, a map quiz).
- **A reading**, which opens in Gloss's reader. Select any line, ask a question, and an AI writes a cited answer in the margin.

There are no accounts. One passphrase unlocks the site, and each computer stays unlocked after that. The shelf (books, topics, covers) is shared by every computer. Reading progress, highlights and margin notes stay on the computer where they were made.

## What it uses

- Next.js and SQLite (Node's built-in `node:sqlite`), with no database server to run.
- [OpenRouter](https://openrouter.ai) for the AI. Each job (answers, sorting and summaries, scanned PDF pages, painted covers) can use a different model, chosen in Settings. This is optional.
- [Exa](https://exa.ai) for web search in answers. This is optional.
- The browser's own voices for read-aloud. [LiteParse](https://github.com/run-llama/liteparse) reads PDFs in the browser.

## Running it on your own computer (no Docker)

You need Node 24 or newer.

1. Copy `.env.example` to `.env.local` and fill in what you want. Everything is optional for local use. With no `FAMILY_PASSPHRASE` set, the site is open.
2. `npm install`
3. `npm run dev`, then open http://localhost:3100

For a production build without Docker, run `npm run build` and then `npm start`. The database is created on first use at `./data/gloss.db`, or under `DATA_DIR` if you set it.

## Self-hosting with Docker

On the server:

1. Copy `.env.example` to `.env` and set at least these:
   - `FAMILY_PASSPHRASE`: what the family types once on each computer.
   - `SESSION_SECRET`: a long random string. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
   - `OPENROUTER_API_KEY` and `EXA_API_KEY`, if you want the AI features.
2. `docker compose up -d --build`
3. Open `http://<server>:3100` and type the passphrase.

The database lives in the `gloss-data` volume, mounted at `/data`. Rebuilding or upgrading the container keeps it.

Some notes:

- **HTTPS.** Behind a reverse proxy that serves HTTPS (Caddy, Traefik, nginx), the unlock cookie is marked Secure automatically, as long as the proxy passes on `X-Forwarded-Proto`. On plain HTTP inside the home network it works as-is. Set `COOKIE_SECURE=true` to force Secure.
- **Staying unlocked.** Browsers cap a cookie's life at about 400 days, so every visit renews it. A computer used at least once a year stays unlocked.
- **Signing everyone out.** Change `FAMILY_PASSPHRASE` or `SESSION_SECRET` and restart. Every computer will ask for the passphrase again.
- **Upgrading.** `git pull`, then `docker compose up -d --build`.

### Backups

All of the shared library is in one SQLite file: books, the text of readings, topics, covers, settings and agent connections. Back up the volume with:

```sh
docker run --rm -v gloss-data:/data -v "$PWD":/backup node:24-slim \
  node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('/data/gloss.db').exec(\"vacuum into '/backup/gloss-$(date +%F).db'\")"
```

`vacuum into` writes a consistent copy while the library is running.

To restore, stop the container, copy a backup in as `gloss.db`, and start it again:

```sh
docker compose stop
docker run --rm -v gloss-data:/data -v "$PWD":/backup node:24-slim \
  sh -c "rm -f /data/gloss.db-wal /data/gloss.db-shm && cp /backup/gloss-YYYY-MM-DD.db /data/gloss.db && chown 1000:1000 /data/gloss.db"
docker compose start
```

Everything that stays on one computer (reading progress, highlights, notes) is in that browser's storage, not in the backup. Export highlights from the Highlights view if you want to keep them.

## Agents

Gloss has an MCP server at `/mcp`. Agents like Claude or Grok can use it to save articles to the shelf and search it. Make a connection from the shelf (**Add**, then **Agent**). Each connection has its own token, and the passphrase gate does not apply to `/mcp`.
