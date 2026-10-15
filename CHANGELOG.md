# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] — first open-source release

### Added
- Personal time clock: punch in/out through a webhook (NFC tag, Tasker, iOS Shortcuts, any HTTP client), daily
  and weekly balance, estimated departure time, history editing, statistics and Excel/CSV export and import.
- **Multi-account**: one person or a small company on a single instance; per-user settings, webhook token and
  data isolation.
- **Team management**: roles superadmin (`owner`) / admin / user with per-account rights (edit own hours, see who is
  in, view colleagues' hours — the last two off by default); the first account created is the superadmin. A **Team
  page** (presence board, member list, account creation and administration), read-only views of a colleague's
  hours, and corrections by admins on `user` accounts. Accounts are also managed with the `npm run user` CLI
  (`add --owner|--admin`, `role`, `perm`) and the admin REST API.
- **Change log and notifications**: every correction of punches or marks, every import and every account
  administration action is recorded (who, when, before/after, web or command line), with a Journal page. The person
  whose hours were changed by someone else is notified by a persistent window closed only by "Got it";
  admins are notified when a user edits their own hours.
- `npm run user -- demo-team` creates a four-account demo team (superadmin, admin, user with presence, user without
  edit rights) with synthetic data and a pending notification.
- `docs/team.md`: team management guide, with a privacy section (inform employees, visibility off by default, limit
  access; not legal advice).
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
- Account isolation enforced on every data route; authorization decided on the server from role and rights; the last
  active superadmin cannot be removed, disabled or demoted.
- Settings input sanitized (including prototype-pollution safe handling).
- Dev-dependency advisories (wrangler/miniflare, undici, sharp, source-map-js) fixed by non-breaking updates;
  `npm audit` reports 0 vulnerabilities.

[0.1.0]: https://github.com/doooools/Time-clock-Pointeuse/releases/tag/v0.1.0
