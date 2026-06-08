# Security Policy

## Supported versions

Security fixes target the latest published releases: `claudenv` on npm and
`claudenv-memory` on PyPI.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

Use GitHub's private vulnerability reporting:
**[Security → Report a vulnerability](https://github.com/AGoldian/claudenv/security/advisories/new)**.

We aim to acknowledge reports within 72 hours and to ship a fix or mitigation
for confirmed issues as quickly as practical, crediting reporters who wish it.

## Secrets handling

claudenv's design keeps credentials out of the repository: secrets live only in
each project's `.env.local` (gitignored), never in committed files or memory
records (which store env-var *names*, not values). CI enforces this with
[gitleaks](.github/workflows/gitleaks.yml) on every push and pull request.
