# PATHWAYS Codex Guidance

**Status:** Control
**Last reconciled:** 2026-10-20

## Entry point and authority

All PATHWAYS docs live in the AI Memory Vault (`C:\AI Agentic Memory`), not in this repo. Read `AGENTS.md`, `docs/index.md` (the pointer to the vault), the vault project index `01_Projects/PATHWAYS/00_Project_Index.md`, and the relevant registered contracts before work. Create and edit docs only in the vault. `AGENTS.md` is generated from the vault note `build-pathways`; edit that note and run `python .vault/scripts/pathways_docs/materialize.py` from the vault when changing shared instructions. This file supplies Codex usage guidance and defers to the build guide and SAD. Follow the build guide read order for substantial implementation.

Codex discovers `AGENTS.md` as repository instructions. This `CODEX.md` is explicitly referenced by that guide; it is not a replacement or a second contract. Preserve user changes, inspect the working tree before editing, and keep task state and review evidence in ignored `.tmp/` or outside the repository. Report results in chat.

## Project agents

Project role definitions live in `.codex/agents/*.toml`. Each inherits the session model, reasoning effort, permissions and connections. Claude model names in the SAD apply to `.claude/agents/` only. Do not translate them into guessed Codex model IDs or increase permissions in an agent definition.

| Role | Purpose |
|---|---|
| `organization-isolation-checker` | Tenant, permission and project scope before retrieval |
| `migration-integrity-guardian` | Migration bytes, ledger integrity, replay and recovery |
| `beneficiary-privacy-guardian` | Authorized detail, aggregate protection and output boundaries |
| `metadata-import-validator` | Validation, staging, mappings, atomic promotion and idempotency |
| `rule-engine-determinism-checker` | Trusted metrics, deterministic evaluation and bounded execution |
| `restraint-guardian` | Dependencies, cohesion and necessary complexity |
| `design-qa-agent` | All eight SAD ISO/IEC 25010 pillars |
| `sad-orchestrator` | Main-session review coordination, routing and evidence validation |
| `requirements-qa-gate` | PRD criteria and QAD happy, sad and abuse coverage |
| `release-integrator` | Main-session R1 through R6 release coordination |

Route reviews using the vault SAD (`C:/AI Agentic Memory/03_Resources/Blueprints/PATHWAYS/sad-pathways.md`), not this summary. Use its section 4.2 packet and section 4.4 JSON envelope. Dispatch only matching specialists, in bounded batches within available slots. Specialists read and report; the main session implements. Run coordinators in the main session by reading their TOML instructions, rather than spawning them as children. If custom role selection is unavailable, give a normal subagent the exact role file and packet explicitly. Never claim a configured role has executed without its returned evidence.

Follow the complete SAD pre-review, block gate, implementation, final review and sign-off sequence. Run `pnpm sad:check` and relevant checks, then `pnpm sad:signoff -- --reviews <external-json-path>` before engineering sign-off. Changed content invalidates prior evidence. Documentation-only routing with no roles is not an engineering safety certification. Missing review capability or evidence must be reported, never replaced with invented PASS entries.

Examples of requests: "Use the SAD workflow to review this change" and "Use the release-integrator workflow for these approved feature branches." Release requests remain subject to all build guide gates and current approved phase scope.

## Connected services

- Repository: verify `git remote -v`; the PATHWAYS origin is `https://github.com/ceezey/PATHWAYS.git`.
- Supabase: verify project identity and current status through the connection before each hosted operation. `PATHWAYS-devV2` (`klbtoqdalmcsfjqophty`) was verified on 2026-10-15. Its healthy status does not authorize migrations, data changes or a release. Follow repository migration contracts even if a plugin suggests a different workflow. Never print keys, tokens, connection strings or confidential records.
- Figma: read the vault DSD (`C:/AI Agentic Memory/03_Resources/Blueprints/PATHWAYS/dsd-pathways.md`) first. Its reference file is `fQee5ydlhJPLFhj8yUx8pA`, page Branding, canvas `1344:2`, component inventory `1344:35`. The DSD governs tokens, layout, roles and copy; the board supplies anatomy, states and composition only. Load the applicable Figma skill before tool calls that require it.
- Verify each connection when needed. Installation and tool visibility alone do not prove authenticated access. Connector reads do not authorize external writes.

## Verification and boundaries

Reuse existing repository patterns and dependencies. Derive authorization server-side, scope sensitive queries before retrieval, preserve Beneficiary privacy and SADDD suppression, and keep deterministic rules under human control. Follow all build guide security and migration invariants.

Run checks appropriate to the changed scope. For documentation changes, run `python .vault/scripts/pathways_docs/check.py` in the vault; regenerate `AGENTS.md` when `build-pathways` changes. For engineering changes, include routed SAD reviews and relevant QAD coverage. Preserve the release sequence, conflict stop, schema authorization gate and exact-commit evidence requirements. Do not commit, push, deploy, publish designs or apply hosted changes merely to install agent guidance.

Format reference: https://learn.chatgpt.com/docs/agent-configuration/subagents
