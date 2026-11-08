# Security Policy

## Maintainer

| Role | Name | GitHub |
| --- | --- | --- |
| Lead Security Maintainer | Duarte Deslandes | [@duartedeslandes86-boop](https://github.com/duartedeslandes86-boop) |

Duarte Deslandes is the owner of this repository and the named security maintainer responsible for triaging, fixing and disclosing vulnerabilities in it.

## Project overview

Radar Descontos & Tech PT is an affiliate deals bot and companion tooling for a Portuguese Telegram channel. The repository contains:

- **Telegram bot and scheduled runner**: `main.py`, `cron-runner.mjs`, `awin.mjs`, `content.mjs`, `brands.mjs`, `collage.mjs`, `verify-price.mjs`, `amazon_scraper.py`, `browser_bridge.py`, `historico.py`
- **Web dashboard and API (Express + React/Vite)**: `server.ts`, `src/`
- **Telegram Mini App (static site)**: `miniapp-live/`
- **CI/CD and deployment**: `.github/workflows/`, `Dockerfile` (container image published to GHCR and deployed to a self-managed Oracle Cloud host)

## Scope

The following are in scope for security research and reports:

- Source code in this repository on the `main` branch
- Handling of secrets and credentials (Telegram bot token, Awin and Firecrawl keys, deployment keys) in code, workflows and container images
- Authentication, authorization and input validation of the HTTP API in `server.ts`
- Injection and cross-site scripting issues in the Mini App and in messages generated for Telegram (HTML formatting, link and image handling)
- Server-side request forgery, unsafe URL handling and unsafe redirects in the scrapers and link resolvers
- GitHub Actions workflow security (script injection, excessive token permissions, secret exposure)
- Vulnerable or malicious dependencies in `package.json`, `bun.lock` and `requirements.txt`

## Out of scope

- Third-party services and platforms (Telegram, Amazon, Awin, Firecrawl, Cloudflare, Oracle Cloud, GitHub). Please report those to the respective vendor.
- Social engineering, phishing, or physical attacks against the maintainer or channel members
- Denial-of-service and volumetric load testing
- Automated scanner output without a demonstrated impact
- Content accuracy issues such as wrong prices or product data (open a normal issue instead)
- Any testing against the live Telegram channel, production host or other people's accounts. Please test only against your own local copy of the code.

## Supported versions

This project uses a single rolling release. Only the latest commit on the `main` branch is supported, and fixes are applied there.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub Security Advisories:

**[Report a vulnerability](https://github.com/duartedeslandes86-boop/Radardescontospt/security/advisories/new)**

Please include, where possible:

- A clear description of the issue and its impact
- The affected file(s), endpoint(s) or workflow(s), and the commit you tested
- Steps to reproduce or a minimal proof of concept
- Any suggested mitigation

If you cannot use GitHub Security Advisories, open a minimal public issue asking for a private contact channel, without including any technical details.

## What to expect

- **Acknowledgement** within 7 days of the report
- **Initial assessment** (valid / not valid, severity) within 14 days
- **Fix or mitigation** timeline communicated after triage, depending on severity and complexity
- **Coordinated disclosure**: once a fix is available, a GitHub Security Advisory is published, crediting the reporter unless they ask to remain anonymous

This is a small, maintained-by-one-person project, so these times are best-effort targets rather than guarantees.

## Safe harbor

Good-faith research that follows this policy, avoids privacy violations, data destruction and service disruption, and stays within the scope above will not be pursued legally by the maintainer. Please stop testing and report immediately if you encounter personal data or credentials.

## Secrets hygiene

No real secrets should ever be committed. Configuration values are provided through environment variables and GitHub Actions secrets, and `.env.example` contains placeholders for all credentials. If you find a live credential in the repository or its history, report it privately as described above so it can be revoked and rotated.
