-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "pathways";

-- CreateEnum
CREATE TYPE "pathways"."organization_status" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "pathways"."account_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "pathways"."organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization_type" TEXT NOT NULL DEFAULT 'Humanitarian and Development Organization',
    "description" TEXT,
    "contact_email" TEXT,
    "contact_number" TEXT,
    "address" TEXT,
    "status" "pathways"."organization_status" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id")
);

-- CreateTable
CREATE TABLE "pathways"."system_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "auth_user_id" UUID,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "position_title" TEXT,
    "contact_number" TEXT,
    "account_status" "pathways"."account_status" NOT NULL DEFAULT 'INVITED',
    "invited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(3),
    "suspended_at" TIMESTAMPTZ(3),
    "deactivated_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "project_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "changes" JSONB,
    "ip_address" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "pathways"."organizations"("code");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "pathways"."organizations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "pathways"."roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "pathways"."roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "pathways"."permissions"("code");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "pathways"."role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_users_auth_user_id_key" ON "pathways"."system_users"("auth_user_id");

-- CreateIndex
CREATE INDEX "system_users_organization_id_account_status_idx" ON "pathways"."system_users"("organization_id", "account_status");

-- CreateIndex
CREATE INDEX "system_users_role_id_idx" ON "pathways"."system_users"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_users_organization_id_id_key" ON "pathways"."system_users"("organization_id", "id");

-- CreateIndex
CREATE INDEX "audit_logs_org_occurred_idx" ON "pathways"."audit_logs"("organization_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_org_project_occurred_idx" ON "pathways"."audit_logs"("organization_id", "project_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_org_entity_occurred_idx" ON "pathways"."audit_logs"("organization_id", "entity_type", "entity_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_org_actor_occurred_idx" ON "pathways"."audit_logs"("organization_id", "actor_user_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "pathways"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "pathways"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pathways"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "pathways"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pathways"."system_users" ADD CONSTRAINT "system_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pathways"."system_users" ADD CONSTRAINT "system_users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "pathways"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pathways"."audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pathways"."audit_logs" ADD CONSTRAINT "audit_logs_organization_id_actor_user_id_fkey" FOREIGN KEY ("organization_id", "actor_user_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reviewed PostgreSQL constraints not representable in Prisma Schema Language.
ALTER TABLE "pathways"."organizations"
    ADD CONSTRAINT "organizations_code_not_blank_check" CHECK (btrim("code") <> ''),
    ADD CONSTRAINT "organizations_name_not_blank_check" CHECK (btrim("name") <> ''),
    ADD CONSTRAINT "organizations_archival_state_check" CHECK (
        ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
        OR ("status" <> 'ARCHIVED' AND "archived_at" IS NULL)
    );

ALTER TABLE "pathways"."roles"
    ADD CONSTRAINT "roles_code_not_blank_check" CHECK (btrim("code") <> ''),
    ADD CONSTRAINT "roles_name_not_blank_check" CHECK (btrim("name") <> '');

ALTER TABLE "pathways"."permissions"
    ADD CONSTRAINT "permissions_code_not_blank_check" CHECK (btrim("code") <> ''),
    ADD CONSTRAINT "permissions_name_not_blank_check" CHECK (btrim("name") <> '');

ALTER TABLE "pathways"."system_users"
    ADD CONSTRAINT "system_users_full_name_not_blank_check" CHECK (btrim("full_name") <> ''),
    ADD CONSTRAINT "system_users_email_not_blank_check" CHECK (btrim("email") <> ''),
    ADD CONSTRAINT "system_users_lifecycle_state_check" CHECK (
        ("account_status" = 'INVITED'
            AND "activated_at" IS NULL
            AND "suspended_at" IS NULL
            AND "deactivated_at" IS NULL
            AND "archived_at" IS NULL)
        OR ("account_status" = 'ACTIVE'
            AND "activated_at" IS NOT NULL
            AND "deactivated_at" IS NULL
            AND "archived_at" IS NULL)
        OR ("account_status" = 'SUSPENDED'
            AND "activated_at" IS NOT NULL
            AND "suspended_at" IS NOT NULL
            AND "deactivated_at" IS NULL
            AND "archived_at" IS NULL)
        OR ("account_status" = 'DEACTIVATED'
            AND "deactivated_at" IS NOT NULL
            AND "archived_at" IS NULL)
        OR ("account_status" = 'ARCHIVED'
            AND "archived_at" IS NOT NULL)
    ),
    ADD CONSTRAINT "system_users_lifecycle_order_check" CHECK (
        ("activated_at" IS NULL OR "activated_at" >= "invited_at")
        AND ("suspended_at" IS NULL OR ("activated_at" IS NOT NULL AND "suspended_at" >= "activated_at"))
        AND ("deactivated_at" IS NULL OR "deactivated_at" >= "invited_at")
        AND ("archived_at" IS NULL OR "archived_at" >= "invited_at")
        AND ("last_login_at" IS NULL OR "activated_at" IS NOT NULL)
    );

ALTER TABLE "pathways"."audit_logs"
    ADD CONSTRAINT "audit_logs_action_not_blank_check" CHECK (btrim("action") <> ''),
    ADD CONSTRAINT "audit_logs_entity_type_not_blank_check" CHECK (btrim("entity_type") <> ''),
    ADD CONSTRAINT "audit_logs_changes_object_check" CHECK (
        "changes" IS NULL OR jsonb_typeof("changes") = 'object'
    );

-- Case-insensitive email uniqueness is scoped to one organization.
CREATE UNIQUE INDEX "system_users_organization_email_key"
    ON "pathways"."system_users" ("organization_id", lower(btrim("email")));
