# Made in Heaven

A web performance monitoring dashboard that tracks [Google PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/get-started) scores over time for any set of URLs.

## Features

- Add and organize URLs with names and tags
- Run PageSpeed Insights analysis on demand (mobile + desktop)
- Schedule daily automatic analysis at 9 AM
- Bulk import URLs via CSV
- View performance trends with historical charts
- Track Core Web Vitals: LCP, FCP, CLS, TBT, TTI, Speed Index
- Grid and table view with drag-and-drop ordering
- Dark mode

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TanStack Query, Recharts, shadcn/ui, Tailwind CSS v4 |
| Backend | Hono, Drizzle ORM, Zod |
| Database | Cloudflare D1 (prod) / libsql SQLite (local) |
| Queue | Cloudflare Queues |
| Storage | Cloudflare R2 |
| Runtime | Cloudflare Workers (prod) / Node.js (local) |
| Monorepo | Turborepo + pnpm |

## Project Structure

```
made-in-heaven/
├── apps/
│   ├── client/          # React SPA (Vite)
│   └── server/          # Hono API (Cloudflare Workers + Node.js)
├── turbo.json
└── pnpm-workspace.yaml
```

## Local Development

### Prerequisites

- Node.js 18+
- pnpm 10+
- A [Google PageSpeed Insights API key](https://developers.google.com/speed/docs/insights/v5/get-started#APIKey)

### Setup

```bash
pnpm install
```

Copy the env example and fill in your values:

```bash
cp apps/server/.env.example apps/server/.env
```

### Run (Node.js)

```bash
# Start backend (port 3001) and frontend (port 5173) in watch mode
pnpm dev
```

Then open [http://localhost:5173](http://localhost:5173).

### Run (Wrangler Workers runtime)

```bash
cp apps/server/.dev.vars.example apps/server/.dev.vars
# Edit .dev.vars with your values
pnpm dev:worker
```

### Database migrations

```bash
pnpm db:generate   # Generate migrations from schema changes
pnpm db:migrate    # Apply migrations locally
pnpm db:studio     # Open Drizzle Studio
```

## Deployment (Cloudflare Workers)

### Prerequisites

- A Cloudflare account with Workers, D1, R2, and Queues enabled
- `wrangler` CLI authenticated (`wrangler login`)

### 1. Create Cloudflare resources

```bash
# D1 database
wrangler d1 create made-in-heaven

# R2 bucket
wrangler r2 bucket create mih-assets

# Queues
wrangler queues create mih-analysis
wrangler queues create mih-analysis-dlq
wrangler queues create mih-screenshots
wrangler queues create mih-screenshots-dlq
```

### 2. Add secrets

```bash
cd apps/server
wrangler secret put PAGESPEED_API_KEY
```

### 3. Apply migrations and deploy

```bash
pnpm db:migrate:remote
pnpm deploy
```

### Git-based deployment (Cloudflare CI)

Configure the following in the Cloudflare Workers dashboard under **Settings > Build**:

| Field | Value |
|---|---|
| Build command | `pnpm --filter @mih/client build` |
| Deploy command | `pnpm --filter @mih/server run deploy` |
| Root path | *(empty)* |

## Environment Variables

### Local (`.env` — Node.js dev server)

| Variable | Required | Description |
|---|---|---|
| `PAGESPEED_API_KEY` | Yes | Google PageSpeed Insights API key |
| `PORT` | No | Local server port (default: `3001`) |
| `D1_DATABASE_ID` | No | D1 database ID for local Node.js dev |

### Local (`.dev.vars` — Wrangler dev server)

| Variable | Required | Description |
|---|---|---|
| `PAGESPEED_API_KEY` | Yes | Google PageSpeed Insights API key |

### Production secrets (`wrangler secret put`)

| Variable | Description |
|---|---|
| `PAGESPEED_API_KEY` | Google PageSpeed Insights API key |

## Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start local dev server (Node.js + Vite) |
| `pnpm dev:worker` | Start Wrangler dev server (Workers runtime) |
| `pnpm build` | Build client and server |
| `pnpm deploy` | Build and deploy to Cloudflare Workers |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply migrations locally |
| `pnpm db:migrate:remote` | Apply migrations to remote D1 |
| `pnpm db:studio` | Open Drizzle Studio |
