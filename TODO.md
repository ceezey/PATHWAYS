# TODO.md
# PATHWAYS Development Environment and Dependency Setup Plan
#
# Purpose:
# This document is a step-by-step setup checklist for preparing the PATHWAYS repository
# for active development. It is written for both humans and coding agents.
#
# Important:
# - Human intervention tasks MUST be completed first.
# - The goal of this checklist is to leave the repository "development-ready":
#   dependencies installed, project structure initialized, tooling configured,
#   environment variables prepared, database connected, and local dev commands working.
# - This checklist does NOT implement the core business modules yet.
# - This checklist assumes a monorepo structure using pnpm workspaces.
#
# System Summary:
# PATHWAYS is a web-based Digital Integrated Program Monitoring and Dashboard System
# with a metadata-driven mechanism. It is intended to support program-level monitoring
# by centralizing participant records, managing imported monitoring datasets, generating
# dashboards, supporting SADDD analysis, producing reports, and keeping exported data
# compatible with PMERL-oriented workflows.
#
# Recommended Stack:
# - Frontend: Next.js + TypeScript + Tailwind CSS + shadcn/ui
# - Backend: NestJS + TypeScript + Prisma
# - Database/Platform: Supabase (Postgres, Auth, Storage, RLS)
# - Forms/Validation: React Hook Form + Zod
# - Tables/Data Fetching/Charts: TanStack Table + TanStack Query + Apache ECharts
# - Import/Export: Papa Parse + SheetJS
# - Tooling: pnpm + Biome + Husky + lint-staged
# - Testing: Vitest + MSW + Playwright
# - DevOps: Docker + GitHub Actions
# - Monitoring: Sentry
#
# ----------------------------------------------------------------------
# SECTION 0 - SUCCESS CRITERIA
# ----------------------------------------------------------------------
#
# By the end of this TODO, the repository must satisfy ALL of the following:
#
# [ ] The repo exists and can be cloned successfully.
# [ ] Node.js and pnpm are installed and working.
# [ ] The monorepo structure exists.
# [ ] apps/web runs locally.
# [ ] apps/api runs locally.
# [ ] Supabase project is created and reachable.
# [ ] Prisma connects to Supabase Postgres successfully.
# [ ] Root and app-level environment variables are documented.
# [ ] Tailwind and shadcn/ui are installed in the web app.
# [ ] Shared package structure exists.
# [ ] Upload/import dependencies are installed.
# [ ] Testing toolchain is installed.
# [ ] Formatting/linting hooks are installed.
# [ ] Docker baseline exists.
# [ ] GitHub Actions baseline CI exists.
# [ ] A new developer can clone the repo, install dependencies, set environment variables,
#     and run the web and api apps without guessing missing setup steps.
#
# ----------------------------------------------------------------------
# SECTION 1 - HUMAN INTERVENTION TASKS (DO THESE FIRST)
# ----------------------------------------------------------------------
#
# These tasks require a real person. Do NOT skip these.
# A coding agent cannot safely complete some of these without credentials, browser auth,
# or human decisions.
#
# 1.1 Accounts and Access
# [ ] Confirm access to the following accounts/platforms:
#     - GitHub
#     - Supabase
#     - VS Code
#     - Docker Desktop
#     - Optional later: Vercel / Render / Railway / Sentry
#
# 1.2 Local Machine Requirements
# [ ] Install Node.js LTS (recommended: latest LTS version)
# [ ] Verify node is working:
#     command: node -v
# [ ] Install pnpm via corepack:
#     commands:
#       corepack enable
#       corepack prepare pnpm@latest --activate
#       pnpm -v
# [ ] Install Git
# [ ] Verify git is working:
#     command: git --version
# [ ] Configure git name and email:
#     commands:
#       git config --global user.name "Your Name"
#       git config --global user.email "you@example.com"
# [ ] Install Docker Desktop
# [ ] Verify docker is working:
#     commands:
#       docker --version
#       docker compose version
#
# 1.3 VS Code Recommended Setup
# [ ] Install Visual Studio Code
# [ ] Install these extensions manually in VS Code:
#     - Biome
#     - Prisma
#     - Tailwind CSS IntelliSense
#     - ES7+ React/TypeScript snippets
#     - GitLens
#     - Playwright Test for VS Code
#     - DotENV
#     - Docker
#
# 1.4 Create the Remote Repository
# [ ] Create a GitHub repository for PATHWAYS
# [ ] Decide whether the repo is:
#     - private (recommended while still developing)
#     - public (only if approved by the team/adviser)
# [ ] Clone the empty repository locally
#
# 1.5 Create the Supabase Project
# [ ] Create a new Supabase project
# [ ] Save the following securely:
#     - Project URL
#     - Anon public key
#     - Service role key
#     - Database password
#     - Postgres connection string
# [ ] Decide on project region
# [ ] Create at least one admin user manually if needed later
#
# 1.6 Security and Secret Handling
# [ ] Decide where secrets will be stored during development:
#     - local .env files
#     - password manager
# [ ] DO NOT commit real secrets into the repo
# [ ] Commit only `.env.example`
#
# ----------------------------------------------------------------------
# SECTION 2 - INITIALIZE THE REPOSITORY
# ----------------------------------------------------------------------
#
# Goal:
# Prepare the root repo as a pnpm monorepo and add base config files.
#
# 2.1 Create Base Monorepo Structure
# [ ] Create these folders:
#
#     apps/
#       web/
#       api/
#
#     packages/
#       shared/
#       ui/
#       config/
#       imports/
#
#     .github/
#       workflows/
#
#     docker/
#
# [ ] Ensure the folder structure exists before app generation
#
# 2.2 Create Root package.json
# [ ] Create root package.json with:
#     - private: true
#     - packageManager: pnpm
#     - scripts for:
#       - dev
#       - dev:web
#       - dev:api
#       - build
#       - lint
#       - format
#       - test
#       - typecheck
# [ ] Prefer recursive pnpm scripts where appropriate
#
# 2.3 Create pnpm-workspace.yaml
# [ ] Include:
#     - apps/*
#     - packages/*
#
# 2.4 Create Root .gitignore
# [ ] Include:
#     - node_modules
#     - .next
#     - dist
#     - coverage
#     - .env
#     - .env.local
#     - .env.*.local
#     - .turbo (if later used)
#     - pnpm-lock.yaml? -> DO NOT ignore; commit lockfile
#     - generated files if necessary
#
# 2.5 Create .editorconfig
# [ ] Standardize:
#     - UTF-8
#     - LF
#     - final newline
#     - 2 spaces
#
# 2.6 Create .nvmrc
# [ ] Put the Node LTS version number used by the team
#
# ----------------------------------------------------------------------
# SECTION 3 - INSTALL GLOBAL DEV TOOLING IN THE REPO
# ----------------------------------------------------------------------
#
# 3.1 Biome
# [ ] Add Biome to the root devDependencies
# [ ] Initialize biome.json
# [ ] Configure formatter and linter defaults
# [ ] Ensure JSON, TS, TSX, JS, JSX, and Markdown are formatted
#
# 3.2 Husky and lint-staged
# [ ] Install Husky
# [ ] Install lint-staged
# [ ] Initialize husky hooks
# [ ] Add pre-commit hook to run lint-staged
# [ ] Configure lint-staged to run:
#     - biome check --write
#     - optional tests for changed files later
#
# Purpose:
# This prevents messy commits and reduces avoidable formatting errors.
#
# ----------------------------------------------------------------------
# SECTION 4 - CREATE THE FRONTEND APP
# ----------------------------------------------------------------------
#
# Goal:
# Prepare the Next.js app that will serve as the web client.
#
# 4.1 Generate Next.js App
# [ ] Create apps/web using:
#     - Next.js
#     - TypeScript
#     - App Router
#     - ESLint optional (Biome will be primary)
#     - Tailwind support
# [ ] Verify the app starts:
#     command: pnpm --filter web dev
#
# 4.2 Frontend Base Dependencies
# [ ] Install in apps/web:
#     - @supabase/supabase-js
#     - @tanstack/react-query
#     - @tanstack/react-query-devtools
#     - @tanstack/react-table
#     - echarts
#     - echarts-for-react (or wrapper of choice)
#     - react-hook-form
#     - zod
#     - @hookform/resolvers
#     - lucide-react
#     - clsx
#     - tailwind-merge
#
# 4.3 Tailwind and Global Styles
# [ ] Confirm Tailwind is installed and working
# [ ] Create clean global CSS
# [ ] Define theme tokens/colors later; for now keep stable defaults
#
# 4.4 shadcn/ui Setup
# [ ] Initialize shadcn/ui in apps/web
# [ ] Install these initial components:
#     - button
#     - card
#     - input
#     - form
#     - label
#     - table
#     - dialog
#     - dropdown-menu
#     - select
#     - tabs
#     - sheet
#     - toast / sonner (if using)
#     - command
# [ ] Verify component path aliases are configured correctly
#
# 4.5 Frontend Architecture Setup
# [ ] Create initial folders in apps/web/src or app-based equivalent:
#     - components/
#     - features/
#     - lib/
#     - hooks/
#     - providers/
#     - types/
#     - constants/
# [ ] Add QueryClientProvider wrapper
# [ ] Add basic layout and route groups:
#     - (public)
#     - (auth)
#     - (dashboard)
#
# 4.6 Frontend Placeholder Screens
# [ ] Create placeholders for:
#     - login
#     - dashboard home
#     - participant registry
#     - imports
#     - reports
#     - settings
#
# ----------------------------------------------------------------------
# SECTION 5 - CREATE THE BACKEND APP
# ----------------------------------------------------------------------
#
# Goal:
# Prepare the NestJS backend that will own business logic.
#
# 5.1 Generate NestJS App
# [ ] Create apps/api using NestJS + TypeScript
# [ ] Verify the app starts:
#     command: pnpm --filter api start:dev
#
# 5.2 Backend Base Dependencies
# [ ] Install in apps/api:
#     - @nestjs/config
#     - @nestjs/swagger
#     - class-validator (optional)
#     - class-transformer (optional)
#     - zod (if shared validation strategy is used)
#     - prisma
#     - @prisma/client
#     - @supabase/supabase-js (only if needed for admin/auth/storage actions)
#     - cookie-parser
#     - helmet
#     - compression
#     - pino or nestjs-pino for logging
#
# 5.3 Backend Module Scaffolding
# [ ] Create initial Nest modules:
#     - health
#     - auth
#     - users
#     - participants
#     - programs
#     - projects
#     - metadata
#     - imports
#     - dashboards
#     - reports
#     - audit
# [ ] Keep them minimal for now; no heavy logic yet
#
# 5.4 API Baseline
# [ ] Add:
#     - /health route
#     - global validation pipe strategy (if chosen)
#     - global prefix (e.g. /api)
#     - Swagger/OpenAPI bootstrap for dev
#
# ----------------------------------------------------------------------
# SECTION 6 - CONNECT TO SUPABASE DATABASE
# ----------------------------------------------------------------------
#
# Goal:
# Make Supabase the data platform and Prisma the ORM.
#
# 6.1 Add Prisma to apps/api
# [ ] Run prisma init in apps/api
# [ ] Point DATABASE_URL to the Supabase Postgres connection string
#
# 6.2 Prepare Prisma Schema
# [ ] Define initial models only; keep them enough for development scaffolding:
#     - User
#     - Role
#     - UserRole
#     - Participant
#     - ParticipantJourney
#     - Program
#     - Project
#     - FormMetadata
#     - MetadataField
#     - UploadBatch
#     - UploadRow
#     - UploadRowError
#     - Report
#     - AuditLog
#     - ParticipantCard
#
# [ ] Add timestamps consistently:
#     - createdAt
#     - updatedAt
#
# [ ] Add soft-delete fields only if truly needed later
#
# 6.3 Run First Migration
# [ ] Create first migration
# [ ] Push schema to Supabase Postgres
# [ ] Verify tables appear in Supabase dashboard
#
# 6.4 Prisma Client
# [ ] Generate Prisma Client
# [ ] Create a reusable PrismaService in NestJS
#
# 6.5 Seed Script
# [ ] Create a dev seed script for:
#     - roles
#     - test admin
#     - sample program/project placeholders
#
# ----------------------------------------------------------------------
# SECTION 7 - AUTHENTICATION AND AUTHORIZATION BASELINE
# ----------------------------------------------------------------------
#
# Goal:
# Identity comes from Supabase Auth; business roles come from our own tables.
#
# 7.1 Supabase Auth
# [ ] Decide auth flow:
#     - email/password for internal staff only
# [ ] Enable necessary auth providers in Supabase
# [ ] Create initial auth test account(s)
#
# 7.2 Role Model
# [ ] Use app-level roles such as:
#     - admin
#     - m_and_e_staff
#     - project_officer
#     - project_manager
#     - program_manager
#
# 7.3 Backend Auth Flow
# [ ] Decide whether backend trusts Supabase JWT or exchanges session data
# [ ] Add auth guard skeleton in Nest
# [ ] Add role guard skeleton in Nest
#
# 7.4 Frontend Auth Handling
# [ ] Add auth client utility for Supabase in web app
# [ ] Add session provider
# [ ] Protect dashboard routes
#
# ----------------------------------------------------------------------
# SECTION 8 - STORAGE AND FILE MANAGEMENT
# ----------------------------------------------------------------------
#
# Goal:
# Uploaded datasets, generated reports, and participant IDs must have a safe file home.
#
# 8.1 Supabase Storage Buckets
# [ ] Create buckets for:
#     - uploads
#     - reports
#     - participant-cards
#     - optional assets
#
# 8.2 File Policy Plan
# [ ] Decide which buckets are private
# [ ] Recommended:
#     - uploads -> private
#     - reports -> private
#     - participant-cards -> private
#
# 8.3 Upload Utility Layer
# [ ] Add helper functions in backend or shared layer for:
#     - upload file
#     - delete file
#     - generate signed URL
#
# ----------------------------------------------------------------------
# SECTION 9 - IMPORT / EXPORT TOOLCHAIN
# ----------------------------------------------------------------------
#
# Goal:
# Prepare the stack for metadata-driven bulk upload and spreadsheet handling.
#
# 9.1 Install Libraries
# [ ] Add:
#     - papaparse
#     - xlsx or sheetjs
#
# 9.2 Create import package
# [ ] In packages/imports create:
#     - parser/
#     - validators/
#     - mappers/
#     - templates/
#
# 9.3 Build Non-Business Boilerplate Only
# [ ] Prepare utility placeholders for:
#     - CSV parse
#     - XLS/XLSX parse
#     - header extraction
#     - metadata comparison
#     - file summary output
# [ ] DO NOT build final domain import rules yet
#
# 9.4 Export Utilities
# [ ] Prepare placeholders for:
#     - CSV export
#     - XLSX export
#     - PMERL-compatible output formatting
#
# ----------------------------------------------------------------------
# SECTION 10 - SHARED PACKAGES
# ----------------------------------------------------------------------
#
# Goal:
# Avoid repeating types and schemas across web and api.
#
# 10.1 packages/shared
# [ ] Create shared package for:
#     - common types
#     - DTO-like shared shapes
#     - enums
#     - constants
#     - zod schemas where appropriate
#
# 10.2 packages/ui
# [ ] Optional shared UI package
# [ ] Only add if multiple apps will consume common components
#
# 10.3 packages/config
# [ ] Put reusable config constants here if needed
#
# ----------------------------------------------------------------------
# SECTION 11 - TESTING TOOLCHAIN
# ----------------------------------------------------------------------
#
# Goal:
# Make the project safe to change.
#
# 11.1 Unit / Integration Testing
# [ ] Install Vitest at root or per app strategy
# [ ] Configure TS support
# [ ] Add basic test scripts
#
# 11.2 API and UI Mocking
# [ ] Install MSW
# [ ] Prepare mock handlers for:
#     - auth
#     - participants
#     - imports
#     - dashboards
#
# 11.3 End-to-End Testing
# [ ] Install Playwright in apps/web or root
# [ ] Generate initial config
# [ ] Create smoke tests for:
#     - landing page loads
#     - login page loads
#     - dashboard shell loads after auth mock
#
# ----------------------------------------------------------------------
# SECTION 12 - DEVELOPER EXPERIENCE IMPROVEMENTS
# ----------------------------------------------------------------------
#
# 12.1 Absolute Imports and Path Aliases
# [ ] Configure TS path aliases in:
#     - root tsconfig
#     - web tsconfig
#     - api tsconfig
#
# 12.2 Logging
# [ ] Add structured logging to api
# [ ] Keep it simple but consistent
#
# 12.3 Error Tracking
# [ ] Install Sentry packages for web and api
# [ ] Keep disabled in local unless configured
#
# 12.4 Script Hygiene
# [ ] Ensure root scripts exist and work:
#     - pnpm dev
#     - pnpm build
#     - pnpm lint
#     - pnpm format
#     - pnpm test
#     - pnpm typecheck
#
# ----------------------------------------------------------------------
# SECTION 13 - DOCKER BASELINE
# ----------------------------------------------------------------------
#
# Goal:
# Provide reproducible local development helpers.
#
# 13.1 Docker Files
# [ ] Add Dockerfile for web
# [ ] Add Dockerfile for api
# [ ] Add docker-compose.yml for local app execution if desired
#
# 13.2 Development Scope
# [ ] Dockerize only what is useful now:
#     - web
#     - api
# [ ] Since Supabase is hosted, do not force local Postgres unless needed later
#
# ----------------------------------------------------------------------
# SECTION 14 - CONTINUOUS INTEGRATION BASELINE
# ----------------------------------------------------------------------
#
# Goal:
# Ensure every push is checked.
#
# 14.1 GitHub Actions
# [ ] Create workflow for:
#     - install
#     - typecheck
#     - lint
#     - test
#     - build
#
# 14.2 CI Constraints
# [ ] Use example env where possible
# [ ] Do not require secret-dependent jobs for every pull request
#
# ----------------------------------------------------------------------
# SECTION 15 - ENVIRONMENT VARIABLE MANAGEMENT
# ----------------------------------------------------------------------
#
# Goal:
# Make setup predictable for all developers.
#
# 15.1 Create root `.env.example`
# [ ] Include clearly named variables such as:
#     - NEXT_PUBLIC_SUPABASE_URL=
#     - NEXT_PUBLIC_SUPABASE_ANON_KEY=
#     - SUPABASE_SERVICE_ROLE_KEY=
#     - DATABASE_URL=
#     - DIRECT_URL=
#     - API_PORT=
#     - WEB_PORT=
#     - SENTRY_DSN_WEB=
#     - SENTRY_DSN_API=
#
# 15.2 Create app-specific env documentation
# [ ] Document which envs belong to:
#     - web
#     - api
#     - shared
#
# 15.3 Do NOT commit real .env files
#
# ----------------------------------------------------------------------
# SECTION 16 - FINAL DEVELOPMENT-READY CHECK
# ----------------------------------------------------------------------
#
# 16.1 Verify Local Commands
# [ ] pnpm install works from root
# [ ] pnpm dev starts web and api
# [ ] web app loads in browser
# [ ] api health endpoint responds
# [ ] Prisma can connect
# [ ] Supabase auth client initializes
# [ ] Supabase storage helper initializes
#
# 16.2 Verify Code Quality Tooling
# [ ] format command works
# [ ] lint command works
# [ ] typecheck command works
# [ ] test command runs
#
# 16.3 Verify Repo Onboarding Experience
# [ ] A teammate can:
#     - clone repo
#     - copy .env.example to their local env
#     - install dependencies
#     - run the apps
#     - understand the structure
#
# ----------------------------------------------------------------------
# SECTION 17 - DO NOT START CORE MODULE DEVELOPMENT UNTIL ALL ABOVE IS DONE
# ----------------------------------------------------------------------
#
# Once everything above is complete, the repository is considered "development-ready".
#
# Only after this point should actual feature implementation begin, such as:
# - participant registry logic
# - metadata-driven bulk upload rules
# - dashboard metrics
# - SADDD analytics
# - report generation
# - participant ID generation
#
# End of TODO.md