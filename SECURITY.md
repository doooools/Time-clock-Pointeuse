# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately using GitHub's
"Report a vulnerability" feature (Security tab → Advisories) on this repository, or by email to
`<contact email>`.

Include a description, reproduction steps and the affected version. You can expect an acknowledgement
within a few days. Please allow reasonable time for a fix before any public disclosure.

## Scope

Authentication and sessions, the webhook token, account isolation between users, and the admin API are
especially sensitive. Deployers are responsible for setting a strong `SESSION_SECRET` (>= 32 characters)
and serving the app over HTTPS.
