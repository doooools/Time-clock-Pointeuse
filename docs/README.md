# Time clock documentation

Start with the [README](../README.md) (also in French: [README.fr.md](../README.fr.md)) for the overview and the quick
start.

## Install and run

| Guide | Contents |
|---|---|
| [deploy-cloudflare.md](deploy-cloudflare.md) | Cloudflare Workers + D1: account, database, secret, deploy, custom domain, updates, costs |
| [deploy-node.md](deploy-node.md) | Node ≥ 22.13: build, `.env`, systemd, Caddy / nginx, SQLite backups, updates |
| [deploy-docker.md](deploy-docker.md) | Docker Compose: volume, first account, health check, backups, reverse proxy |

## Use and configure

| Guide | Contents |
|---|---|
| [configuration.md](configuration.md) | Environment variables, account settings, how defaults combine, calculation rules, holiday regions |
| [team.md](team.md) | Team management: roles and rights, Team page, change log and notifications, privacy |
| [users.md](users.md) | Creating and managing accounts, importing history, from the command line |
| [integrations/](integrations/README.md) | Punching from [Android + NFC](integrations/android-tasker.md), [iPhone Shortcuts](integrations/ios-shortcuts.md), [HTTP / scripts / Home Assistant](integrations/http.md), a [shared badge reader](integrations/shared-badge-reader.md) |
| [api.md](api.md) | REST API reference (auth, data, settings, webhook, team, journal, admin) |

## Understand and modify

| Document | Contents |
|---|---|
| [../CLAUDE.md](../CLAUDE.md) | Entry point for Claude Code (and other AI assistants, via [../AGENTS.md](../AGENTS.md)): project map, commands, invariants, recipes |
| [../.claude/skills/setup/SKILL.md](../.claude/skills/setup/SKILL.md) | Guided installation skill for Claude Code (questions, then the steps for each target) |
| [architecture.md](architecture.md) | How it works: data flow, data model, calculation rules, sessions and security, build targets, design decisions |
| [customization.md](customization.md) | Settings vs code, adding a holiday region, a setting, a language, an API route or the Team page, adapting the rules, changing the look or the schema |
| [../shared/holidays/README.md](../shared/holidays/README.md) | Holiday regions and how to add one |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Contributing: setup, tests, conventions |
| [../SECURITY.md](../SECURITY.md) | Reporting a vulnerability |

## Which guide do I need?

- *"I want to try it on my computer."* → [deploy-node.md](deploy-node.md) (or [deploy-docker.md](deploy-docker.md)),
  then `seed-demo` ([users.md](users.md#seed-demo-username-options)) for demo data.
- *"I want it online for free."* → [deploy-cloudflare.md](deploy-cloudflare.md).
- *"My team needs accounts."* → [team.md](team.md) and [users.md](users.md).
- *"How do I punch with my phone?"* → [integrations/](integrations/README.md).
- *"I want to change how it looks or behaves."* → [customization.md](customization.md), or ask Claude Code.
