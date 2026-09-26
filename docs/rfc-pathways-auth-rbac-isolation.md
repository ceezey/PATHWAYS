# RFC: Authentication, RBAC, Organization and Project Isolation

## Decision

Supabase Auth validates identity/session.

PATHWAYS DB records authorize application behavior.

```text
auth_user_id
→ system_user
→ account status
→ organization
→ canonical role
→ permissions
→ project assignments
```

## Six Roles

System Administrator, Program Manager, Grant Manager, Project Manager, Monitoring and Evaluation (M&E) Officer, Project Officer.

Program Manager and Grant Manager are aggregate-only for Beneficiary information.

## Security Rules

- no email-only authorization linking;
- no app/user metadata as PATHWAYS role authority;
- no client-authoritative scope/actor;
- no frontend-only security;
- no broad retrieval then in-memory filtering;
- reject cross-org/project relations;
- runtime DB identity not privileged migration/table owner.

## Failure

Deny missing/invalid identity, unlinked profile, forbidden lifecycle state, missing permission, missing assignment, or cross-scope target.

## Required Tests

Cross-org, cross-project, unassigned project, aggregate-only Beneficiary detail denial, privilege escalation, forged actor/scope, suspended/deactivated account, direct API attempt.
