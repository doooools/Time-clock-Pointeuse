# Opointeuse documentation

Start with the [README](../README.md) (also in French: [README.fr.md](../README.fr.md)) for the overview and the quick
start.

## Install and run

| Guide | Contents |
|---|---|
| [deploy-cloudflare.md](deploy-cloudflare.md) | Cloudflare Workers + D1: account, database, secret, deploy, custom domain, updates, costs |
| [deploy-node.md](deploy-node.md) | Node ≥ 22.13: build, `.env`, systemd, Caddy / nginx, SQLite backups, updates |
| [deploy-docker.md](deploy-docker.md) | Docker Compose: volume, first admin, health check, backups, reverse proxy |

## Use and configure

| Guide | Contents |
|---|---|
| [configuration.md](configuration.md) | Environment variables, account settings, how defaults combine, calculation rules, holiday regions |
| [users.md](users.md) | Creating and managing accounts, importing history, from the command line |
| [integrations/](integrations/README.md) | Punching from [Android + NFC](integrations/android-tasker.md), [iPhone Shortcuts](integrations/ios-shortcuts.md), [HTTP / scripts / Home Assistant](integrations/http.md), a [shared badge reader](integrations/shared-badge-reader.md) |
| [api.md](api.md) | REST API reference (auth, data, settings, webhook, admin) |

## Understand and modify

| Document | Contents |
|---|---|
| [../CLAUDE.md](../CLAUDE.md) | Entry point for Claude Code (and other AI assistants): project map, conventions, commands |
| [architecture.md](architecture.md) | How the code is organised: shared engine, server, front end, runtimes |
| [customization.md](customization.md) | Changing colours and texts, adding a language or a holiday region, adapting the rules |
| [../shared/holidays/README.md](../shared/holidays/README.md) | Holiday regions and how to add one |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Contributing: setup, tests, conventions |
| [../SECURITY.md](../SECURITY.md) | Reporting a vulnerability |

## Which guide do I need?

- *"I want to try it on my computer."* → [deploy-node.md](deploy-node.md) (or [deploy-docker.md](deploy-docker.md)).
- *"I want it online for free."* → [deploy-cloudflare.md](deploy-cloudflare.md).
- *"My team needs accounts."* → [users.md](users.md).
- *"How do I punch with my phone?"* → [integrations/](integrations/README.md).
- *"I want to change how it looks or behaves."* → [customization.md](customization.md), or ask Claude Code.
