/**
 * Detection maps and constants for the documentation generator.
 */

// Maps manifest filenames to language/platform
export const MANIFEST_MAP = {
  'package.json': { language: 'javascript', runtime: 'node' },
  'pyproject.toml': { language: 'python', runtime: 'python' },
  'setup.py': { language: 'python', runtime: 'python' },
  'requirements.txt': { language: 'python', runtime: 'python' },
  'go.mod': { language: 'go', runtime: 'go' },
  'Cargo.toml': { language: 'rust', runtime: 'rust' },
  'Gemfile': { language: 'ruby', runtime: 'ruby' },
  'composer.json': { language: 'php', runtime: 'php' },
  'pom.xml': { language: 'java', runtime: 'jvm' },
  'build.gradle': { language: 'java', runtime: 'jvm' },
  'build.gradle.kts': { language: 'kotlin', runtime: 'jvm' },
  '*.csproj': { language: 'csharp', runtime: 'dotnet' },
  '*.sln': { language: 'csharp', runtime: 'dotnet' },
};

// TypeScript override — detected via tsconfig.json presence alongside package.json
export const TYPESCRIPT_INDICATORS = ['tsconfig.json', 'tsconfig.base.json'];

// Maps config filenames to frameworks
export const FRAMEWORK_MAP = {
  'next.config.js': 'next.js',
  'next.config.mjs': 'next.js',
  'next.config.ts': 'next.js',
  'nuxt.config.ts': 'nuxt',
  'nuxt.config.js': 'nuxt',
  'vite.config.js': 'vite',
  'vite.config.ts': 'vite',
  'vite.config.mts': 'vite',
  'svelte.config.js': 'sveltekit',
  'astro.config.mjs': 'astro',
  'astro.config.ts': 'astro',
  'remix.config.js': 'remix',
  'angular.json': 'angular',
  'vue.config.js': 'vue-cli',
  'gatsby-config.js': 'gatsby',
  'gatsby-config.ts': 'gatsby',
  'manage.py': 'django',
  'config/routes.rb': 'rails',
  'artisan': 'laravel',
  'symfony.lock': 'symfony',
  'application.properties': 'spring-boot',
  'application.yml': 'spring-boot',
};

// Maps lockfiles to package managers
export const PACKAGE_MANAGER_MAP = {
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
  'bun.lockb': 'bun',
  'bun.lock': 'bun',
  'poetry.lock': 'poetry',
  'Pipfile.lock': 'pipenv',
  'uv.lock': 'uv',
  'Gemfile.lock': 'bundler',
  'composer.lock': 'composer',
  'go.sum': 'go-modules',
  'Cargo.lock': 'cargo',
};

// Maps test config files or dependency names to test frameworks
export const TEST_FRAMEWORK_MAP = {
  // Config file indicators
  'jest.config.js': 'jest',
  'jest.config.ts': 'jest',
  'jest.config.mjs': 'jest',
  'vitest.config.js': 'vitest',
  'vitest.config.ts': 'vitest',
  'vitest.config.mts': 'vitest',
  '.mocharc.yml': 'mocha',
  '.mocharc.json': 'mocha',
  'cypress.config.js': 'cypress',
  'cypress.config.ts': 'cypress',
  'playwright.config.js': 'playwright',
  'playwright.config.ts': 'playwright',
  'pytest.ini': 'pytest',
  'conftest.py': 'pytest',
  'setup.cfg': 'pytest', // often contains [tool:pytest]
  '.rspec': 'rspec',
  'phpunit.xml': 'phpunit',
  'phpunit.xml.dist': 'phpunit',
};

// Dependency names that indicate test frameworks (for package.json/pyproject.toml parsing)
export const TEST_DEPENDENCY_MAP = {
  jest: 'jest',
  vitest: 'vitest',
  mocha: 'mocha',
  ava: 'ava',
  tap: 'tap',
  cypress: 'cypress',
  playwright: 'playwright',
  '@playwright/test': 'playwright',
  pytest: 'pytest',
  unittest: 'unittest',
  nose2: 'nose2',
};

// CI/CD file patterns
export const CI_PATTERNS = [
  { glob: '.github/workflows/*.yml', name: 'github-actions' },
  { glob: '.github/workflows/*.yaml', name: 'github-actions' },
  { glob: '.gitlab-ci.yml', name: 'gitlab-ci' },
  { glob: 'Jenkinsfile', name: 'jenkins' },
  { glob: '.circleci/config.yml', name: 'circleci' },
  { glob: 'bitbucket-pipelines.yml', name: 'bitbucket-pipelines' },
  { glob: '.travis.yml', name: 'travis-ci' },
  { glob: 'azure-pipelines.yml', name: 'azure-devops' },
];

// Linter config files
export const LINTER_MAP = {
  '.eslintrc': 'eslint',
  '.eslintrc.js': 'eslint',
  '.eslintrc.json': 'eslint',
  '.eslintrc.yml': 'eslint',
  'eslint.config.js': 'eslint',
  'eslint.config.mjs': 'eslint',
  'eslint.config.ts': 'eslint',
  'biome.json': 'biome',
  'biome.jsonc': 'biome',
  '.pylintrc': 'pylint',
  'ruff.toml': 'ruff',
  '.rubocop.yml': 'rubocop',
  '.golangci.yml': 'golangci-lint',
  '.golangci.yaml': 'golangci-lint',
  'clippy.toml': 'clippy',
};

// Formatter config files
export const FORMATTER_MAP = {
  '.prettierrc': 'prettier',
  '.prettierrc.js': 'prettier',
  '.prettierrc.json': 'prettier',
  '.prettierrc.yml': 'prettier',
  'prettier.config.js': 'prettier',
  'prettier.config.mjs': 'prettier',
  '.editorconfig': 'editorconfig',
  'rustfmt.toml': 'rustfmt',
  '.style.yapf': 'yapf',
  'pyproject.toml': null, // checked separately for [tool.black] or [tool.ruff.format]
};

// Monorepo indicators
export const MONOREPO_MAP = {
  'turbo.json': 'turborepo',
  'nx.json': 'nx',
  'lerna.json': 'lerna',
  'pnpm-workspace.yaml': 'pnpm-workspaces',
  'rush.json': 'rush',
};

// Infrastructure files
export const INFRA_MAP = {
  'Dockerfile': 'docker',
  'docker-compose.yml': 'docker-compose',
  'docker-compose.yaml': 'docker-compose',
  'terraform/': 'terraform',
  '*.tf': 'terraform',
  'cdk.json': 'aws-cdk',
  'serverless.yml': 'serverless',
  'serverless.ts': 'serverless',
  'fly.toml': 'fly-io',
  'vercel.json': 'vercel',
  'netlify.toml': 'netlify',
  'render.yaml': 'render',
  'railway.json': 'railway',
  'Procfile': 'heroku',
};

// Required sections in CLAUDE.md for validation
export const REQUIRED_SECTIONS = ['## Commands', '## Architecture'];

// Suggested commands by framework
export const SUGGESTED_COMMANDS = {
  'next.js': {
    dev: '{pm} next dev',
    build: '{pm} next build',
    test: '{pm} vitest run',
    lint: '{pm} next lint',
  },
  vite: {
    dev: '{pm} vite',
    build: '{pm} vite build',
    test: '{pm} vitest run',
  },
  django: {
    dev: 'python manage.py runserver',
    test: 'python manage.py test',
    migrate: 'python manage.py migrate',
  },
  rails: {
    dev: 'bin/rails server',
    test: 'bin/rails test',
    migrate: 'bin/rails db:migrate',
  },
  'spring-boot': {
    dev: './mvnw spring-boot:run',
    build: './mvnw package',
    test: './mvnw test',
  },
  laravel: {
    dev: 'php artisan serve',
    test: 'php artisan test',
    migrate: 'php artisan migrate',
  },
  go: {
    build: 'go build ./...',
    test: 'go test ./...',
    lint: 'golangci-lint run',
  },
  rust: {
    build: 'cargo build',
    test: 'cargo test',
    lint: 'cargo clippy',
  },
};

// Framework choices by language for cold-start prompts
export const FRAMEWORKS_BY_LANGUAGE = {
  typescript: ['Next.js', 'Vite + React', 'Vite + Vue', 'SvelteKit', 'Astro', 'Express', 'Fastify', 'NestJS', 'None'],
  javascript: ['Next.js', 'Vite + React', 'Vite + Vue', 'Express', 'Fastify', 'None'],
  python: ['Django', 'FastAPI', 'Flask', 'None'],
  go: ['Gin', 'Echo', 'Fiber', 'Chi', 'Standard library', 'None'],
  rust: ['Actix Web', 'Axum', 'Rocket', 'None'],
  ruby: ['Rails', 'Sinatra', 'None'],
  php: ['Laravel', 'Symfony', 'None'],
  java: ['Spring Boot', 'Quarkus', 'Micronaut', 'None'],
  kotlin: ['Spring Boot', 'Ktor', 'None'],
  csharp: ['ASP.NET Core', 'Blazor', 'None'],
};
