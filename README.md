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

Create `apps/server/.env`:

```env
PAGESPEED_API_KEY=your_api_key_here
PORT=3001
```

### Run

```bash
# Start backend (port 3001) and frontend (port 5173) in watch mode
pnpm dev
```

Then open [http://localhost:5173](http://localhost:5173).

### Database migrations

```bash
pnpm db:generate   # Generate migrations from schema changes
pnpm db:migrate    # Apply migrations locally
pnpm db:studio     # Open Drizzle Studio
```

## Deployment (Cloudflare Workers)

### Prerequisites

- A Cloudflare account with Workers and D1 enabled
- `wrangler` CLI authenticated (`wrangler login`)

### 1. Create Cloudflare resources

```bash
# D1 database
wrangler d1 create made-in-heaven

# Queues
wrangler queues create mih-analysis
wrangler queues create mih-analysis-dlq
```

### 2. Configure wrangler

```bash
cp apps/server/wrangler.example.jsonc apps/server/wrangler.jsonc
```

Edit `apps/server/wrangler.jsonc` and replace `YOUR_D1_DATABASE_ID` with the ID returned in the previous step.

### 3. Add secrets

```bash
cd apps/server
wrangler secret put PAGESPEED_API_KEY
```

### 4. Apply migrations and deploy

```bash
pnpm db:migrate:remote
pnpm deploy
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PAGESPEED_API_KEY` | Yes | Google PageSpeed Insights API key |
| `PORT` | No | Local server port (default: `3001`) |

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
