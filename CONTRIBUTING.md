# Contributing to Opointeuse

Thanks for your interest! Opointeuse is a self-hosted time clock that runs on Cloudflare Workers + D1,
on a Node server, or in Docker.

## Setup

Requirements: Node.js >= 22.13 (uses the built-in `node:sqlite`).

```bash
npm ci
npm run dev        # Vite + Cloudflare plugin (workerd, local D1)
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server (Vite + Cloudflare plugin) |
| `npm run build` | Typecheck and build for Cloudflare |
| `npm run build:node` | Build the front end and bundle the Node server |
| `npm start` | Run the Node bundle |
| `npm test` | Run the vitest suite |
| `npm run typecheck` | `tsc -b` |
| `npm run db:migrate:local` / `db:migrate:remote` | Apply D1 migrations |

## Conventions

- Code, identifiers, comments and commit messages are in **English**.
- User-visible text is never hard-coded: front-end strings live in `src/i18n` and server messages are
  localized from the user's `locale` setting. Every new string needs **both FR and EN**.
- Add or update **vitest** tests for logic changes.
- **No native dependencies** (e.g. no `better-sqlite3`); the project must run on Workers and plain Node.
- Keep the project free of personal data: no real punches, tokens, account IDs or personal URLs.

## Pull requests

Keep PRs focused, make sure typecheck, tests and both builds pass, and fill in the PR template.
