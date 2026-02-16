# Tech Stack Detection Patterns

Use these patterns to identify the project's tech stack by scanning for files.

## Language / Runtime Detection (check manifest files first)

| File | Language | Runtime |
|------|----------|---------|
| `package.json` | JavaScript/TypeScript | Node.js |
| `pyproject.toml`, `setup.py`, `requirements.txt` | Python | Python |
| `go.mod` | Go | Go |
| `Cargo.toml` | Rust | Rust |
| `Gemfile` | Ruby | Ruby |
| `composer.json` | PHP | PHP |
| `pom.xml`, `build.gradle`, `build.gradle.kts` | Java/Kotlin | JVM |
| `*.csproj`, `*.sln` | C# | .NET |

**TypeScript override**: If `tsconfig.json` exists alongside `package.json`, the language is TypeScript.

## Framework Detection (check config files)

| File | Framework |
|------|-----------|
| `next.config.js/mjs/ts` | Next.js |
| `nuxt.config.ts/js` | Nuxt |
| `vite.config.js/ts/mts` | Vite |
| `svelte.config.js` | SvelteKit |
| `astro.config.mjs/ts` | Astro |
| `angular.json` | Angular |
| `manage.py` | Django |
| `config/routes.rb` | Rails |
| `artisan` | Laravel |
| `application.properties/yml` | Spring Boot |

## Package Manager Detection (check lockfiles)

| File | Package Manager |
|------|----------------|
| `package-lock.json` | npm |
| `yarn.lock` | Yarn |
| `pnpm-lock.yaml` | pnpm |
| `bun.lockb`, `bun.lock` | Bun |
| `poetry.lock` | Poetry |
| `Pipfile.lock` | Pipenv |
| `uv.lock` | uv |

## Test Framework Detection

| File | Framework |
|------|-----------|
| `vitest.config.*` | Vitest |
| `jest.config.*` | Jest |
| `playwright.config.*` | Playwright |
| `cypress.config.*` | Cypress |
| `pytest.ini`, `conftest.py` | pytest |
| `.rspec` | RSpec |

Also check dependencies in `package.json` or `pyproject.toml`.

## CI/CD Detection

| Path | System |
|------|--------|
| `.github/workflows/*.yml` | GitHub Actions |
| `.gitlab-ci.yml` | GitLab CI |
| `Jenkinsfile` | Jenkins |
| `.circleci/config.yml` | CircleCI |

## Monorepo Detection

| File | Tool |
|------|------|
| `turbo.json` | Turborepo |
| `nx.json` | Nx |
| `lerna.json` | Lerna |
| `pnpm-workspace.yaml` | pnpm workspaces |
