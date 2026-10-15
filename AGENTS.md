# AGENTS.md

Instructions for AI coding agents working on Time clock live in **[CLAUDE.md](CLAUDE.md)**: repository map,
commands, invariants that must not break, conventions and step-by-step recipes (deploy, accounts, holiday
regions, settings, languages, API routes, the Team page, computation rules, theme, migrations).

Read it first. Then, as needed:

- [docs/architecture.md](docs/architecture.md) — data flow, data model, computation rules, auth, build targets,
  design decisions.
- [docs/customization.md](docs/customization.md) — the same recipes, explained in more detail.
- [.claude/skills/setup/SKILL.md](.claude/skills/setup/SKILL.md) — guided installation flow (questions to ask
  the user, then the commands for Cloudflare, Node or Docker).
- User documentation: [README.md](README.md) and [docs/](docs/).

Minimum checks before proposing a change: `npm test`, `npm run typecheck`, `npm run build`, `npm run build:node`.
