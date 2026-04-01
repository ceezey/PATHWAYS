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
# STATUS SNAPSHOT - Updated 2026-04-01
# [x] Repository scaffold for sections 2 through 15 is in place in code, config, docs, Docker, and CI.
# [x] Verified commands so far: pnpm install, pnpm format, pnpm lint, pnpm typecheck, pnpm test, pnpm build.
# [x] Live environment setup verified: Supabase credentials load, auth responds, storage buckets are reachable, and Prisma connects to the hosted database.
# [x] Runtime confirmation completed: pnpm dev booted both apps, frontend routes loaded, and the API health/docs endpoints responded.
#
# ----------------------------------------------------------------------
# SECTION 0 - SUCCESS CRITERIA
# ----------------------------------------------------------------------
#
# By the end of this TODO, the repository must satisfy ALL of the following:
#
# [x] The repo exists and can be cloned successfully.
# [x] Node.js and pnpm are installed and working.
# [x] The monorepo structure exists.
# [x] apps/web runs locally.
# [x] apps/api runs locally.
# [x] Supabase project is created and reachable.
# [x] Prisma connects to Supabase Postgres successfully.
# [x] Root and app-level environment variables are documented.
# [x] Tailwind and shadcn/ui are installed in the web app.
# [x] Shared package structure exists.
# [x] Upload/import dependencies are installed.
# [x] Testing toolchain is installed.
# [x] Formatting/linting hooks are installed.
# [x] Docker baseline exists.
# [x] GitHub Actions baseline CI exists.
# [x] A new developer can clone the repo, install dependencies, set environment variables,
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
# [x] Confirm access to the following accounts/platforms:
#     - GitHub
#     - Supabase
#     - VS Code
#     - Docker Desktop
#     - Optional later: Vercel / Render / Railway / Sentry
#
# 1.2 Local Machine Requirements
# [x] Install Node.js LTS (recommended: latest LTS version)
# [x] Verify node is working:
#     command: node -v
# [x] Install pnpm via corepack:
#     commands:
#       corepack enable
#       corepack prepare pnpm@latest --activate
#       pnpm -v
# [x] Install Git
# [x] Verify git is working:
#     command: git --version
# [x] Configure git name and email:
#     commands:
#       git config --global user.name "Your Name"
#       git config --global user.email "you@example.com"
# [x] Install Docker Desktop
# [x] Verify docker is working:
#     commands:
#       docker --version
#       docker compose version
#
# 1.3 VS Code Recommended Setup
# [x] Install Visual Studio Code
# [x] Install these extensions manually in VS Code:
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
# [x] Create a GitHub repository for PATHWAYS
# [x] Decide whether the repo is:
#     - private (recommended while still developing)
#     - public (only if approved by the team/adviser)
# [x] Clone the empty repository locally
#
# 1.5 Create the Supabase Project
# [x] Create a new Supabase project
# [x] Save the following securely:
#     - Project URL
#     - Anon public key
#     - Service role key
#     - Database password
#     - Postgres connection string
# [x] Decide on project region
# [x] Create at least one admin user manually if needed later
#
# 1.6 Security and Secret Handling
# [x] Decide where secrets will be stored during development:
#     - local .env files
#     - password manager
# [x] DO NOT commit real secrets into the repo
# [x] Commit only `.env.example`
#
# ----------------------------------------------------------------------
# SECTION 2 - INITIALIZE THE REPOSITORY
# ----------------------------------------------------------------------
#
# Goal:
# Prepare the root repo as a pnpm monorepo and add base config files.
#
# 2.1 Create Base Monorepo Structure
# [x] Create these folders:
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
#     infra/
#       docker/
#
# [x] Ensure the folder structure exists before app generation
#
# 2.2 Create Root package.json
# [x] Create root package.json with:
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
# [x] Prefer recursive pnpm scripts where appropriate
#
# 2.3 Create pnpm-workspace.yaml
# [x] Include:
#     - apps/*
#     - packages/*
#
# 2.4 Create Root .gitignore
# [x] Include:
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
# [x] Standardize:
#     - UTF-8
#     - LF
#     - final newline
#     - 2 spaces
#
# 2.6 Create .nvmrc
# [x] Put the Node LTS version number used by the team
#
# ----------------------------------------------------------------------
# SECTION 3 - INSTALL GLOBAL DEV TOOLING IN THE REPO
# ----------------------------------------------------------------------
#
# 3.1 Biome
# [x] Add Biome to the root devDependencies
# [x] Initialize biome.json
# [x] Configure formatter and linter defaults
# [x] Ensure JSON, TS, TSX, JS, JSX, and Markdown are formatted
#
# 3.2 Husky and lint-staged
# [x] Install Husky
# [x] Install lint-staged
# [x] Initialize husky hooks
# [x] Add pre-commit hook to run lint-staged
# [x] Configure lint-staged to run:
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
# [x] Create apps/web using:
#     - Next.js
#     - TypeScript
#     - App Router
#     - ESLint optional (Biome will be primary)
#     - Tailwind support
# [x] Verify the app starts:
#     command: pnpm --filter web dev
#
# 4.2 Frontend Base Dependencies
# [x] Install in apps/web:
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
# [x] Confirm Tailwind is installed and working
# [x] Create clean global CSS
# [x] Define theme tokens/colors later; for now keep stable defaults
#
# 4.4 shadcn/ui Setup
# [x] Initialize shadcn/ui in apps/web
# [x] Install these initial components:
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
# [x] Verify component path aliases are configured correctly
#
# 4.5 Frontend Architecture Setup
# [x] Create initial folders in apps/web/src or app-based equivalent:
#     - components/
#     - features/
#     - lib/
#     - hooks/
#     - providers/
#     - types/
#     - constants/
# [x] Add QueryClientProvider wrapper
# [x] Add basic layout and route groups:
#     - (public)
#     - (auth)
#     - (dashboard)
#
# 4.6 Frontend Placeholder Screens
# [x] Create placeholders for:
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
# [x] Create apps/api using NestJS + TypeScript
# [x] Verify the app starts:
#     command: pnpm --filter api start:dev
#
# 5.2 Backend Base Dependencies
# [x] Install in apps/api:
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
# [x] Create initial Nest modules:
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
# [x] Keep them minimal for now; no heavy logic yet
#
# 5.4 API Baseline
# [x] Add:
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
# [x] Run prisma init in apps/api
# [x] Point DATABASE_URL to the Supabase Postgres connection string
#
# 6.2 Prepare Prisma Schema
# [x] Define initial models only; keep them enough for development scaffolding:
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
# [x] Add timestamps consistently:
#     - createdAt
#     - updatedAt
#
# [x] Add soft-delete fields only if truly needed later
#
# 6.3 Run First Migration
# [x] Create first migration
# [x] Push schema to Supabase Postgres
# [x] Verify tables appear in Supabase dashboard
#
# 6.4 Prisma Client
# [x] Generate Prisma Client
# [x] Create a reusable PrismaService in NestJS
#
# 6.5 Seed Script
# [x] Create a dev seed script for:
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
# [x] Decide auth flow:
#     - email/password for internal staff only
# [x] Enable necessary auth providers in Supabase
# [x] Create initial auth test account(s)
#
# 7.2 Role Model
# [x] Use app-level roles such as:
#     - admin
#     - m_and_e_staff
#     - project_officer
#     - project_manager
#     - program_manager
#
# 7.3 Backend Auth Flow
# [ ] Decide whether backend trusts Supabase JWT or exchanges session data
# [x] Add auth guard skeleton in Nest
# [x] Add role guard skeleton in Nest
#
# 7.4 Frontend Auth Handling
# [x] Add auth client utility for Supabase in web app
# [x] Add session provider
# [x] Protect dashboard routes
#
# ----------------------------------------------------------------------
# SECTION 8 - STORAGE AND FILE MANAGEMENT
# ----------------------------------------------------------------------
#
# Goal:
# Uploaded datasets, generated reports, and participant IDs must have a safe file home.
#
# 8.1 Supabase Storage Buckets
# [x] Create buckets for:
#     - uploads
#     - reports
#     - participant-cards
#     - optional assets
#
# 8.2 File Policy Plan
# [x] Decide which buckets are private
# [x] Recommended:
#     - uploads -> private
#     - reports -> private
#     - participant-cards -> private
#
# 8.3 Upload Utility Layer
# [x] Add helper functions in backend or shared layer for:
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
# [x] Add:
#     - papaparse
#     - xlsx or sheetjs
#
# 9.2 Create import package
# [x] In packages/imports create:
#     - parser/
#     - validators/
#     - mappers/
#     - templates/
#
# 9.3 Build Non-Business Boilerplate Only
# [x] Prepare utility placeholders for:
#     - CSV parse
#     - XLS/XLSX parse
#     - header extraction
#     - metadata comparison
#     - file summary output
# [x] DO NOT build final domain import rules yet
#
# 9.4 Export Utilities
# [x] Prepare placeholders for:
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
# [x] Create shared package for:
#     - common types
#     - DTO-like shared shapes
#     - enums
#     - constants
#     - zod schemas where appropriate
#
# 10.2 packages/ui
# [x] Optional shared UI package
# [x] Only add if multiple apps will consume common components
#
# 10.3 packages/config
# [x] Put reusable config constants here if needed
#
# ----------------------------------------------------------------------
# SECTION 11 - TESTING TOOLCHAIN
# ----------------------------------------------------------------------
#
# Goal:
# Make the project safe to change.
#
# 11.1 Unit / Integration Testing
# [x] Install Vitest at root or per app strategy
# [x] Configure TS support
# [x] Add basic test scripts
#
# 11.2 API and UI Mocking
# [x] Install MSW
# [x] Prepare mock handlers for:
#     - auth
#     - participants
#     - imports
#     - dashboards
#
# 11.3 End-to-End Testing
# [x] Install Playwright in apps/web or root
# [x] Generate initial config
# [x] Create smoke tests for:
#     - landing page loads
#     - login page loads
#     - dashboard shell loads after auth mock
#
# ----------------------------------------------------------------------
# SECTION 12 - DEVELOPER EXPERIENCE IMPROVEMENTS
# ----------------------------------------------------------------------
#
# 12.1 Absolute Imports and Path Aliases
# [x] Configure TS path aliases in:
#     - root tsconfig
#     - web tsconfig
#     - api tsconfig
#
# 12.2 Logging
# [x] Add structured logging to api
# [x] Keep it simple but consistent
#
# 12.3 Error Tracking
# [x] Install Sentry packages for web and api
# [x] Keep disabled in local unless configured
#
# 12.4 Script Hygiene
# [x] Ensure root scripts exist and work:
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
# [x] Add Dockerfile for web
# [x] Add Dockerfile for api
# [x] Add docker-compose.yml for local app execution if desired
#
# 13.2 Development Scope
# [x] Dockerize only what is useful now:
#     - web
#     - api
# [x] Since Supabase is hosted, do not force local Postgres unless needed later
#
# ----------------------------------------------------------------------
# SECTION 14 - CONTINUOUS INTEGRATION BASELINE
# ----------------------------------------------------------------------
#
# Goal:
# Ensure every push is checked.
#
# 14.1 GitHub Actions
# [x] Create workflow for:
#     - install
#     - typecheck
#     - lint
#     - test
#     - build
#
# 14.2 CI Constraints
# [x] Use example env where possible
# [x] Do not require secret-dependent jobs for every pull request
#
# ----------------------------------------------------------------------
# SECTION 15 - ENVIRONMENT VARIABLE MANAGEMENT
# ----------------------------------------------------------------------
#
# Goal:
# Make setup predictable for all developers.
#
# 15.1 Create root `.env.example`
# [x] Include clearly named variables such as:
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
# [x] Document which envs belong to:
#     - web
#     - api
#     - shared
#
# [x] Do NOT commit real .env files
#
# ----------------------------------------------------------------------
# SECTION 16 - FINAL DEVELOPMENT-READY CHECK
# ----------------------------------------------------------------------
#
# 16.1 Verify Local Commands
# [x] pnpm install works from root
# [x] pnpm dev starts web and api
# [x] web app loads in browser
# [x] api health endpoint responds
# [x] Prisma can connect
# [x] Supabase auth client initializes
# [x] Supabase storage helper initializes
#
# 16.2 Verify Code Quality Tooling
# [x] format command works
# [x] lint command works
# [x] typecheck command works
# [x] test command runs
#
# 16.3 Verify Repo Onboarding Experience
# [x] A teammate can:
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
# ----------------------------------------------------------------------
# SECTION 18 - WHAT YOU STILL NEED TO DO TO FINALIZE SETUP
# ----------------------------------------------------------------------
#
# These are the remaining human steps after the scaffold is finished.
#
# 18.1 Supabase Project and Secrets
# [x] Create or confirm the Supabase project
# [x] Copy the following into your local env files:
#     - NEXT_PUBLIC_SUPABASE_URL
#     - NEXT_PUBLIC_SUPABASE_ANON_KEY
#     - SUPABASE_URL
#     - SUPABASE_SERVICE_ROLE_KEY
#     - DATABASE_URL
#     - DIRECT_URL
# [x] Keep the real secrets only in local `.env` files or your password manager
#
# 18.2 Auth Dashboard Setup
# [x] In Supabase Auth, enable email/password sign-in
# [x] Set the Site URL to:
#     - http://localhost:3000
# [x] Add this redirect URL:
#     - http://localhost:3000/auth/callback
# [x] Create at least one test admin/staff account for development
#
# 18.3 Storage Buckets
# [x] Create these private buckets in Supabase Storage:
#     - uploads
#     - reports
#     - participant-cards
#     - assets (optional)
#
# 18.4 Local Env Files
# [x] Copy:
#     - `.env.example` -> `.env`
#     - `apps/web/.env.example` -> `apps/web/.env`
#     - `apps/api/.env.example` -> `apps/api/.env`
# [ ] Fill in any ports or DSNs you want to customize
# [x] Optional: set `NEXT_PUBLIC_ENABLE_DEV_AUTH_BYPASS=true` only if you want to preview the dashboard shell before auth is fully configured
#
# 18.5 Prisma and Seed
# [x] Run:
#     - pnpm --filter @pathways/api prisma:generate
#     - pnpm --filter @pathways/api prisma:migrate
#     - pnpm --filter @pathways/api prisma:seed
# [x] Confirm the tables appear in the Supabase dashboard
#
# 18.6 Final Runtime Check
# [x] Run:
#     - pnpm dev
# [x] Open:
#     - http://localhost:3000
#     - http://localhost:4000/api/health
#     - http://localhost:4000/api/docs
# [x] Confirm:
#     - the landing page loads
#     - the login page loads
#     - the API health endpoint returns status ok
#     - auth initializes with your real Supabase values
#     - storage helper works once buckets exist
#
# 18.7 Repository Finalization
# [x] Review the updated README and environment docs
# [x] Commit the scaffold
# [x] Push to your GitHub remote
# [ ] After all remaining boxes above are done, treat the repo as development-ready and start feature work
#
# End of TODO.md
