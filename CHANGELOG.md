# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] — first open-source release

### Added
- Personal time clock: punch in/out through a webhook (NFC tag, Tasker, iOS Shortcuts, any HTTP client), daily
  and weekly balance, estimated departure time, history editing, statistics and Excel/CSV export and import.
- **Multi-account**: one person or a small company on a single instance; per-user settings, webhook token and
  data isolation. Accounts are managed with the `npm run user` CLI and an admin REST API (no admin UI).
- **Three deployment targets**: Cloudflare Workers + D1, a Node server (built-in `node:sqlite`, no native
  dependency) and Docker.
- **Bilingual interface and messages** (French and English, chosen per user).
- Per-user **time zone**, configurable work days, daily target, starting balance and half-day absences.
- **Public holidays for 14 regions** (FR, FR-AM, BE, CA, CA-QC, CH, DE, ES, GB-ENG, IT, LU, NL, PT, US) plus
  manual day marks (leave, sick, holiday, comp time, forced workday).
- Demo data seeding for development, and documentation for deployment, configuration, API and integrations
  (`docs/`, `CLAUDE.md`, `AGENTS.md`) aimed at both humans and coding agents.
- GitHub Actions CI (typecheck, tests, both builds, Docker build), issue/PR templates, contributing and
  security policies.

### Security
- PBKDF2 password hashing, signed HttpOnly session cookies with server-side revocation (`session_version`),
  login and password-change throttling, constant-time token comparison, strict security headers.
- Account isolation enforced on every data route; the last active admin cannot be removed or demoted.
- Settings input sanitized (including prototype-pollution safe handling).
- Dev-dependency advisories (wrangler/miniflare, undici, sharp, source-map-js) fixed by non-breaking updates;
  `npm audit` reports 0 vulnerabilities.

[0.1.0]: https://github.com/<owner>/opointeuse/releases/tag/v0.1.0
