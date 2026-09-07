-- Phase 2 only. Generated Prisma structure followed by reviewed PostgreSQL guards.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- CreateEnum
CREATE TYPE "pathways"."program_status" AS ENUM ('PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "pathways"."project_status" AS ENUM ('PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "pathways"."activity_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'FOR_REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "pathways"."assignment_status" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "pathways"."activity_assignment_status" AS ENUM ('ACTIVE', 'COMPLETED', 'REMOVED');

-- CreateEnum
CREATE TYPE "pathways"."milestone_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "pathways"."indicator_type" AS ENUM ('OUTPUT', 'OUTCOME', 'ACTIVITY', 'BUDGET', 'TIMELINE', 'PARTICIPATION', 'SURVEY_SCORE');

-- CreateEnum
CREATE TYPE "pathways"."indicator_unit" AS ENUM ('COUNT', 'PERCENTAGE', 'SCORE', 'AMOUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "pathways"."indicator_status" AS ENUM ('NOT_STARTED', 'ON_TRACK', 'AT_RISK', 'UNDERPERFORMING', 'ACHIEVED');

-- CreateEnum
CREATE TYPE "pathways"."public_visibility_status" AS ENUM ('PRIVATE', 'FOR_REVIEW', 'APPROVED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "pathways"."form_type" AS ENUM ('BENEFICIARY_REGISTRATION', 'TRAINING_SURVEY', 'PRE_TEST', 'POST_TEST', 'OUTCOME_MONITORING', 'ACTIVITY_MONITORING', 'OTHER');

-- CreateEnum
CREATE TYPE "pathways"."form_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "pathways"."field_data_type" AS ENUM ('TEXT', 'INTEGER', 'DECIMAL', 'DATE', 'BOOLEAN', 'SELECT', 'MULTIPLE_SELECT', 'LONG_TEXT');

-- CreateEnum
CREATE TYPE "pathways"."import_source" AS ENUM ('KOBO', 'SPREADSHEET', 'MANUAL_UPLOAD', 'OTHER');

-- CreateEnum
CREATE TYPE "pathways"."import_file_type" AS ENUM ('CSV', 'XLSX', 'XLS', 'JSON', 'OTHER');

-- CreateEnum
CREATE TYPE "pathways"."import_status" AS ENUM ('UPLOADED', 'MAPPED', 'VALIDATED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "pathways"."import_row_status" AS ENUM ('PENDING', 'VALID', 'INVALID', 'PROCESSED');

-- CreateEnum
CREATE TYPE "pathways"."mapping_status" AS ENUM ('PENDING', 'MAPPED', 'INVALID', 'IGNORED');

-- CreateEnum
CREATE TYPE "pathways"."submission_source" AS ENUM ('DIRECT_ENCODING', 'IMPORTED_DATASET');

-- CreateEnum
CREATE TYPE "pathways"."submission_status" AS ENUM ('DRAFT', 'VALIDATED', 'PROCESSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "pathways"."beneficiary_sex" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED');

-- CreateEnum
CREATE TYPE "pathways"."disability_status" AS ENUM ('WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED');

-- CreateEnum
CREATE TYPE "pathways"."profile_status" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "pathways"."enrollment_status" AS ENUM ('ACTIVE', 'COMPLETED', 'DROPPED', 'TRANSFERRED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "pathways"."journey_stage_type" AS ENUM ('ENTRY', 'CORE', 'BRANCH', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "pathways"."attendance_status" AS ENUM ('PRESENT', 'ABSENT', 'COMPLETED', 'NOT_COMPLETED', 'EXCUSED');

-- CreateEnum
CREATE TYPE "pathways"."progress_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_FOLLOW_UP');

-- CreateEnum
CREATE TYPE "pathways"."journey_event_type" AS ENUM ('ENROLLMENT', 'PARTICIPATION', 'PROGRESS_UPDATE', 'COMPLETION', 'FOLLOW_UP', 'DROPOUT', 'TRANSFER');

-- CreateTable
CREATE TABLE "pathways"."programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "manager_user_id" UUID,
    "start_date" DATE,
    "end_date" DATE,
    "status" "pathways"."program_status" NOT NULL DEFAULT 'PLANNED',
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "program_id" UUID,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "objectives" TEXT,
    "implementation_area" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "status" "pathways"."project_status" NOT NULL DEFAULT 'PLANNED',
    "created_by_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "public_visibility_status" "pathways"."public_visibility_status" NOT NULL DEFAULT 'PRIVATE',
    "public_summary" TEXT,
    "public_submitted_by_id" UUID,
    "public_submitted_at" TIMESTAMPTZ(3),
    "public_approved_by_id" UUID,
    "public_approved_at" TIMESTAMPTZ(3),
    "published_by_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."user_project_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_by_id" UUID NOT NULL,
    "status" "pathways"."assignment_status" NOT NULL DEFAULT 'ACTIVE',
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_project_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."project_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "activity_type" TEXT,
    "planned_start_date" DATE,
    "planned_end_date" DATE,
    "actual_start_date" DATE,
    "actual_end_date" DATE,
    "status" "pathways"."activity_status" NOT NULL DEFAULT 'NOT_STARTED',
    "created_by_id" UUID,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."project_activity_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "project_assignment_id" UUID NOT NULL,
    "assigned_by_id" UUID NOT NULL,
    "status" "pathways"."activity_assignment_status" NOT NULL DEFAULT 'ACTIVE',
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activity_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."project_milestones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "target_date" DATE,
    "completion_date" DATE,
    "status" "pathways"."milestone_status" NOT NULL DEFAULT 'PENDING',
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."project_indicators" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "indicator_type" "pathways"."indicator_type" NOT NULL DEFAULT 'OUTPUT',
    "unit" "pathways"."indicator_unit" NOT NULL DEFAULT 'COUNT',
    "unit_label" TEXT,
    "data_source" TEXT,
    "is_saddd_related" BOOLEAN NOT NULL DEFAULT false,
    "baseline_value" DECIMAL(18,4),
    "current_value" DECIMAL(18,4),
    "target_value" DECIMAL(18,4),
    "actual_value" DECIMAL(18,4),
    "minimum_value" DECIMAL(18,4),
    "maximum_value" DECIMAL(18,4),
    "target_date" DATE,
    "status" "pathways"."indicator_status" NOT NULL DEFAULT 'NOT_STARTED',
    "created_by_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."digital_forms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "form_type" "pathways"."form_type" NOT NULL DEFAULT 'OTHER',
    "status" "pathways"."form_status" NOT NULL DEFAULT 'DRAFT',
    "activity_id" UUID,
    "journey_stage_id" UUID,
    "created_by_id" UUID,
    "published_by_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digital_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."form_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data_type" "pathways"."field_data_type" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_metadata_key" BOOLEAN NOT NULL DEFAULT false,
    "is_saddd_field" BOOLEAN NOT NULL DEFAULT false,
    "allowed_values" JSONB,
    "minimum_value" DECIMAL(18,4),
    "maximum_value" DECIMAL(18,4),
    "sequence_no" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."data_import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "source_system" "pathways"."import_source" NOT NULL DEFAULT 'SPREADSHEET',
    "original_file_name" TEXT NOT NULL,
    "file_type" "pathways"."import_file_type" NOT NULL DEFAULT 'CSV',
    "uploaded_by_id" UUID NOT NULL,
    "status" "pathways"."import_status" NOT NULL DEFAULT 'UPLOADED',
    "validation_notes" TEXT,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" TIMESTAMPTZ(3),
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."data_import_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "import_batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "status" "pathways"."import_row_status" NOT NULL DEFAULT 'PENDING',
    "validation_errors" JSONB NOT NULL DEFAULT '[]',
    "validated_by_id" UUID,
    "validated_at" TIMESTAMPTZ(3),
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."metadata_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "import_batch_id" UUID NOT NULL,
    "source_field_name" TEXT NOT NULL,
    "target_field_id" UUID,
    "target_system_field" TEXT,
    "status" "pathways"."mapping_status" NOT NULL DEFAULT 'PENDING',
    "validation_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metadata_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."form_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "import_batch_id" UUID,
    "import_row_id" UUID,
    "enrollment_id" UUID,
    "submitted_by_id" UUID NOT NULL,
    "source" "pathways"."submission_source" NOT NULL DEFAULT 'DIRECT_ENCODING',
    "status" "pathways"."submission_status" NOT NULL DEFAULT 'DRAFT',
    "is_dummy_record" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_by_id" UUID,
    "validated_at" TIMESTAMPTZ(3),
    "processed_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."form_response_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_response_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."beneficiaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "first_name" TEXT,
    "middle_name" TEXT,
    "last_name" TEXT,
    "sex" "pathways"."beneficiary_sex" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "birth_date" DATE,
    "age_at_registration" INTEGER,
    "disability_status" "pathways"."disability_status" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "location_barangay" TEXT,
    "location_city_municipality" TEXT,
    "location_province" TEXT,
    "status" "pathways"."profile_status" NOT NULL DEFAULT 'ACTIVE',
    "consent_recorded" BOOLEAN NOT NULL DEFAULT false,
    "is_minor" BOOLEAN NOT NULL DEFAULT false,
    "guardian_consent_recorded" BOOLEAN NOT NULL DEFAULT false,
    "is_dummy_record" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."beneficiary_project_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "enrollment_date" DATE NOT NULL,
    "status" "pathways"."enrollment_status" NOT NULL DEFAULT 'ACTIVE',
    "ended_date" DATE,
    "end_reason" TEXT,
    "remarks" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beneficiary_project_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."journey_stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage_order" INTEGER NOT NULL,
    "parent_stage_id" UUID,
    "stage_type" "pathways"."journey_stage_type" NOT NULL DEFAULT 'CORE',
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_by_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journey_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."activity_journey_stage_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "sequence_order" INTEGER NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_journey_stage_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."beneficiary_activity_participations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "attendance_status" "pathways"."attendance_status" NOT NULL DEFAULT 'PRESENT',
    "participation_date" DATE NOT NULL,
    "progress_status" "pathways"."progress_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "progress_notes" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beneficiary_activity_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."beneficiary_journey_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "activity_id" UUID,
    "stage_id" UUID,
    "participation_id" UUID,
    "event_type" "pathways"."journey_event_type" NOT NULL,
    "event_date" DATE NOT NULL,
    "description" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beneficiary_journey_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "programs_org_status_idx" ON "pathways"."programs"("organization_id", "status");

-- CreateIndex
CREATE INDEX "programs_manager_user_idx" ON "pathways"."programs"("organization_id", "manager_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "programs_scope_key" ON "pathways"."programs"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "programs_org_code_key" ON "pathways"."programs"("organization_id", "code");

-- CreateIndex
CREATE INDEX "projects_org_status_idx" ON "pathways"."projects"("organization_id", "status");

-- CreateIndex
CREATE INDEX "projects_org_public_idx" ON "pathways"."projects"("organization_id", "public_visibility_status");

-- CreateIndex
CREATE INDEX "projects_created_by_idx" ON "pathways"."projects"("organization_id", "created_by_id");

-- CreateIndex
CREATE INDEX "projects_public_submitted_by_idx" ON "pathways"."projects"("organization_id", "public_submitted_by_id");

-- CreateIndex
CREATE INDEX "projects_public_approved_by_idx" ON "pathways"."projects"("organization_id", "public_approved_by_id");

-- CreateIndex
CREATE INDEX "projects_published_by_idx" ON "pathways"."projects"("organization_id", "published_by_id");

-- CreateIndex
CREATE INDEX "projects_program_idx" ON "pathways"."projects"("organization_id", "program_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_scope_key" ON "pathways"."projects"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_org_code_key" ON "pathways"."projects"("organization_id", "code");

-- CreateIndex
CREATE INDEX "user_project_assignments_project_status_idx" ON "pathways"."user_project_assignments"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "user_project_assignments_user_status_idx" ON "pathways"."user_project_assignments"("organization_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "user_project_assignments_assigned_by_idx" ON "pathways"."user_project_assignments"("organization_id", "assigned_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_project_assignments_scope_key" ON "pathways"."user_project_assignments"("organization_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "project_activities_status_due_idx" ON "pathways"."project_activities"("organization_id", "project_id", "status", "planned_end_date");

-- CreateIndex
CREATE INDEX "project_activities_created_by_idx" ON "pathways"."project_activities"("organization_id", "created_by_id");

-- CreateIndex
CREATE INDEX "project_activities_reviewed_by_idx" ON "pathways"."project_activities"("organization_id", "reviewed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_activities_scope_key" ON "pathways"."project_activities"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_activities_project_code_key" ON "pathways"."project_activities"("organization_id", "project_id", "code");

-- CreateIndex
CREATE INDEX "project_activity_assignments_activity_status_idx" ON "pathways"."project_activity_assignments"("organization_id", "project_id", "activity_id", "status");

-- CreateIndex
CREATE INDEX "project_activity_assignments_assigned_by_idx" ON "pathways"."project_activity_assignments"("organization_id", "assigned_by_id");

-- CreateIndex
CREATE INDEX "project_activity_assignments_project_assignment_idx" ON "pathways"."project_activity_assignments"("organization_id", "project_id", "project_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_activity_assignments_scope_key" ON "pathways"."project_activity_assignments"("organization_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "project_milestones_status_target_idx" ON "pathways"."project_milestones"("organization_id", "project_id", "status", "target_date");

-- CreateIndex
CREATE UNIQUE INDEX "project_milestones_scope_key" ON "pathways"."project_milestones"("organization_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "project_indicators_project_status_idx" ON "pathways"."project_indicators"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "project_indicators_created_by_idx" ON "pathways"."project_indicators"("organization_id", "created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_indicators_scope_key" ON "pathways"."project_indicators"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_indicators_project_code_key" ON "pathways"."project_indicators"("organization_id", "project_id", "code");

-- CreateIndex
CREATE INDEX "digital_forms_project_status_idx" ON "pathways"."digital_forms"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "digital_forms_created_by_idx" ON "pathways"."digital_forms"("organization_id", "created_by_id");

-- CreateIndex
CREATE INDEX "digital_forms_published_by_idx" ON "pathways"."digital_forms"("organization_id", "published_by_id");

-- CreateIndex
CREATE INDEX "digital_forms_activity_idx" ON "pathways"."digital_forms"("organization_id", "project_id", "activity_id");

-- CreateIndex
CREATE INDEX "digital_forms_journey_stage_idx" ON "pathways"."digital_forms"("organization_id", "project_id", "journey_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "digital_forms_scope_key" ON "pathways"."digital_forms"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "digital_forms_project_version_key" ON "pathways"."digital_forms"("organization_id", "project_id", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "form_fields_scope_key" ON "pathways"."form_fields"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_fields_form_scope_key" ON "pathways"."form_fields"("organization_id", "project_id", "form_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_fields_form_code_key" ON "pathways"."form_fields"("form_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "form_fields_form_sequence_key" ON "pathways"."form_fields"("form_id", "sequence_no");

-- CreateIndex
CREATE INDEX "data_import_batches_project_status_idx" ON "pathways"."data_import_batches"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "data_import_batches_uploaded_by_idx" ON "pathways"."data_import_batches"("organization_id", "uploaded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_import_batches_scope_key" ON "pathways"."data_import_batches"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "data_import_batches_form_scope_key" ON "pathways"."data_import_batches"("organization_id", "project_id", "form_id", "id");

-- CreateIndex
CREATE INDEX "data_import_rows_batch_status_idx" ON "pathways"."data_import_rows"("import_batch_id", "status");

-- CreateIndex
CREATE INDEX "data_import_rows_validated_by_idx" ON "pathways"."data_import_rows"("organization_id", "validated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_import_rows_scope_key" ON "pathways"."data_import_rows"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "data_import_rows_batch_scope_key" ON "pathways"."data_import_rows"("organization_id", "project_id", "form_id", "import_batch_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "data_import_rows_batch_number_key" ON "pathways"."data_import_rows"("import_batch_id", "row_number");

-- CreateIndex
CREATE INDEX "metadata_mappings_form_idx" ON "pathways"."metadata_mappings"("organization_id", "project_id", "form_id");

-- CreateIndex
CREATE INDEX "metadata_mappings_import_batch_idx" ON "pathways"."metadata_mappings"("organization_id", "project_id", "form_id", "import_batch_id");

-- CreateIndex
CREATE INDEX "metadata_mappings_target_field_idx" ON "pathways"."metadata_mappings"("organization_id", "project_id", "form_id", "target_field_id");

-- CreateIndex
CREATE UNIQUE INDEX "metadata_mappings_scope_key" ON "pathways"."metadata_mappings"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "metadata_mappings_batch_source_key" ON "pathways"."metadata_mappings"("import_batch_id", "source_field_name");

-- CreateIndex
CREATE INDEX "form_submissions_status_submitted_idx" ON "pathways"."form_submissions"("organization_id", "project_id", "status", "submitted_at");

-- CreateIndex
CREATE INDEX "form_submissions_submitted_by_idx" ON "pathways"."form_submissions"("organization_id", "submitted_by_id");

-- CreateIndex
CREATE INDEX "form_submissions_validated_by_idx" ON "pathways"."form_submissions"("organization_id", "validated_by_id");

-- CreateIndex
CREATE INDEX "form_submissions_import_batch_idx" ON "pathways"."form_submissions"("organization_id", "project_id", "form_id", "import_batch_id");

-- CreateIndex
CREATE INDEX "form_submissions_import_row_idx" ON "pathways"."form_submissions"("organization_id", "project_id", "form_id", "import_batch_id", "import_row_id");

-- CreateIndex
CREATE INDEX "form_submissions_enrollment_idx" ON "pathways"."form_submissions"("organization_id", "project_id", "enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_submissions_scope_key" ON "pathways"."form_submissions"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_submissions_form_scope_key" ON "pathways"."form_submissions"("organization_id", "project_id", "form_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_submissions_import_row_key" ON "pathways"."form_submissions"("import_row_id");

-- CreateIndex
CREATE INDEX "form_response_values_form_idx" ON "pathways"."form_response_values"("organization_id", "project_id", "form_id");

-- CreateIndex
CREATE INDEX "form_response_values_submission_idx" ON "pathways"."form_response_values"("organization_id", "project_id", "form_id", "submission_id");

-- CreateIndex
CREATE INDEX "form_response_values_field_idx" ON "pathways"."form_response_values"("organization_id", "project_id", "form_id", "field_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_response_values_scope_key" ON "pathways"."form_response_values"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_response_values_submission_field_key" ON "pathways"."form_response_values"("submission_id", "field_id");

-- CreateIndex
CREATE INDEX "beneficiaries_org_status_idx" ON "pathways"."beneficiaries"("organization_id", "status");

-- CreateIndex
CREATE INDEX "beneficiaries_created_by_idx" ON "pathways"."beneficiaries"("organization_id", "created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiaries_scope_key" ON "pathways"."beneficiaries"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiaries_org_code_key" ON "pathways"."beneficiaries"("organization_id", "code");

-- CreateIndex
CREATE INDEX "beneficiary_project_enrollments_project_status_idx" ON "pathways"."beneficiary_project_enrollments"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "beneficiary_project_enrollments_recorded_by_idx" ON "pathways"."beneficiary_project_enrollments"("organization_id", "recorded_by_id");

-- CreateIndex
CREATE INDEX "beneficiary_project_enrollments_beneficiary_idx" ON "pathways"."beneficiary_project_enrollments"("organization_id", "beneficiary_id");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiary_project_enrollments_scope_key" ON "pathways"."beneficiary_project_enrollments"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiary_project_enrollments_beneficiary_project_key" ON "pathways"."beneficiary_project_enrollments"("organization_id", "project_id", "beneficiary_id");

-- CreateIndex
CREATE INDEX "journey_stages_created_by_idx" ON "pathways"."journey_stages"("organization_id", "created_by_id");

-- CreateIndex
CREATE INDEX "journey_stages_parent_stage_idx" ON "pathways"."journey_stages"("organization_id", "project_id", "parent_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "journey_stages_scope_key" ON "pathways"."journey_stages"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "journey_stages_project_code_key" ON "pathways"."journey_stages"("organization_id", "project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "journey_stages_project_order_key" ON "pathways"."journey_stages"("organization_id", "project_id", "stage_order");

-- CreateIndex
CREATE INDEX "activity_journey_stage_mappings_stage_sequence_idx" ON "pathways"."activity_journey_stage_mappings"("organization_id", "project_id", "stage_id", "sequence_order");

-- CreateIndex
CREATE INDEX "activity_journey_stage_mappings_created_by_idx" ON "pathways"."activity_journey_stage_mappings"("organization_id", "created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_journey_stage_mappings_scope_key" ON "pathways"."activity_journey_stage_mappings"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_journey_stage_mappings_activity_stage_key" ON "pathways"."activity_journey_stage_mappings"("organization_id", "project_id", "activity_id", "stage_id");

-- CreateIndex
CREATE INDEX "beneficiary_activity_participations_activity_date_idx" ON "pathways"."beneficiary_activity_participations"("organization_id", "project_id", "activity_id", "participation_date");

-- CreateIndex
CREATE INDEX "beneficiary_activity_participations_recorded_by_idx" ON "pathways"."beneficiary_activity_participations"("organization_id", "recorded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiary_activity_participations_scope_key" ON "pathways"."beneficiary_activity_participations"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiary_activity_participations_event_scope_key" ON "pathways"."beneficiary_activity_participations"("organization_id", "project_id", "enrollment_id", "activity_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiary_activity_participations_attendance_key" ON "pathways"."beneficiary_activity_participations"("enrollment_id", "activity_id", "participation_date");

-- CreateIndex
CREATE INDEX "beneficiary_journey_events_enrollment_date_idx" ON "pathways"."beneficiary_journey_events"("organization_id", "project_id", "enrollment_id", "event_date");

-- CreateIndex
CREATE INDEX "beneficiary_journey_events_recorded_by_idx" ON "pathways"."beneficiary_journey_events"("organization_id", "recorded_by_id");

-- CreateIndex
CREATE INDEX "beneficiary_journey_events_activity_idx" ON "pathways"."beneficiary_journey_events"("organization_id", "project_id", "activity_id");

-- CreateIndex
CREATE INDEX "beneficiary_journey_events_stage_idx" ON "pathways"."beneficiary_journey_events"("organization_id", "project_id", "stage_id");

-- CreateIndex
CREATE INDEX "beneficiary_journey_events_participation_idx" ON "pathways"."beneficiary_journey_events"("organization_id", "project_id", "enrollment_id", "activity_id", "participation_id");

-- CreateIndex
CREATE INDEX "beneficiary_journey_events_activity_stage_idx" ON "pathways"."beneficiary_journey_events"("organization_id", "project_id", "activity_id", "stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiary_journey_events_scope_key" ON "pathways"."beneficiary_journey_events"("organization_id", "project_id", "id");

-- AddForeignKey
ALTER TABLE "pathways"."programs" ADD CONSTRAINT "programs_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."programs" ADD CONSTRAINT "programs_manager_user_fk" FOREIGN KEY ("organization_id", "manager_user_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."projects" ADD CONSTRAINT "projects_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."projects" ADD CONSTRAINT "projects_created_by_fk" FOREIGN KEY ("organization_id", "created_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."projects" ADD CONSTRAINT "projects_public_submitted_by_fk" FOREIGN KEY ("organization_id", "public_submitted_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."projects" ADD CONSTRAINT "projects_public_approved_by_fk" FOREIGN KEY ("organization_id", "public_approved_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."projects" ADD CONSTRAINT "projects_published_by_fk" FOREIGN KEY ("organization_id", "published_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."projects" ADD CONSTRAINT "projects_program_fk" FOREIGN KEY ("organization_id", "program_id") REFERENCES "pathways"."programs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."user_project_assignments" ADD CONSTRAINT "user_project_assignments_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."user_project_assignments" ADD CONSTRAINT "user_project_assignments_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."user_project_assignments" ADD CONSTRAINT "user_project_assignments_assigned_by_fk" FOREIGN KEY ("organization_id", "assigned_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."user_project_assignments" ADD CONSTRAINT "user_project_assignments_user_fk" FOREIGN KEY ("organization_id", "user_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_activities" ADD CONSTRAINT "project_activities_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_activities" ADD CONSTRAINT "project_activities_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_activities" ADD CONSTRAINT "project_activities_created_by_fk" FOREIGN KEY ("organization_id", "created_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_activities" ADD CONSTRAINT "project_activities_reviewed_by_fk" FOREIGN KEY ("organization_id", "reviewed_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_activity_assignments" ADD CONSTRAINT "project_activity_assignments_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_activity_assignments" ADD CONSTRAINT "project_activity_assignments_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_activity_assignments" ADD CONSTRAINT "project_activity_assignments_assigned_by_fk" FOREIGN KEY ("organization_id", "assigned_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_activity_assignments" ADD CONSTRAINT "project_activity_assignments_activity_fk" FOREIGN KEY ("organization_id", "project_id", "activity_id") REFERENCES "pathways"."project_activities"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_activity_assignments" ADD CONSTRAINT "project_activity_assignments_project_assignment_fk" FOREIGN KEY ("organization_id", "project_id", "project_assignment_id") REFERENCES "pathways"."user_project_assignments"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_milestones" ADD CONSTRAINT "project_milestones_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_milestones" ADD CONSTRAINT "project_milestones_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_indicators" ADD CONSTRAINT "project_indicators_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_indicators" ADD CONSTRAINT "project_indicators_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_indicators" ADD CONSTRAINT "project_indicators_created_by_fk" FOREIGN KEY ("organization_id", "created_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."digital_forms" ADD CONSTRAINT "digital_forms_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."digital_forms" ADD CONSTRAINT "digital_forms_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."digital_forms" ADD CONSTRAINT "digital_forms_created_by_fk" FOREIGN KEY ("organization_id", "created_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."digital_forms" ADD CONSTRAINT "digital_forms_published_by_fk" FOREIGN KEY ("organization_id", "published_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."digital_forms" ADD CONSTRAINT "digital_forms_activity_fk" FOREIGN KEY ("organization_id", "project_id", "activity_id") REFERENCES "pathways"."project_activities"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."digital_forms" ADD CONSTRAINT "digital_forms_journey_stage_fk" FOREIGN KEY ("organization_id", "project_id", "journey_stage_id") REFERENCES "pathways"."journey_stages"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_fields" ADD CONSTRAINT "form_fields_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_fields" ADD CONSTRAINT "form_fields_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_fields" ADD CONSTRAINT "form_fields_form_fk" FOREIGN KEY ("organization_id", "project_id", "form_id") REFERENCES "pathways"."digital_forms"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."data_import_batches" ADD CONSTRAINT "data_import_batches_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."data_import_batches" ADD CONSTRAINT "data_import_batches_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."data_import_batches" ADD CONSTRAINT "data_import_batches_uploaded_by_fk" FOREIGN KEY ("organization_id", "uploaded_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."data_import_batches" ADD CONSTRAINT "data_import_batches_form_fk" FOREIGN KEY ("organization_id", "project_id", "form_id") REFERENCES "pathways"."digital_forms"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."data_import_rows" ADD CONSTRAINT "data_import_rows_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."data_import_rows" ADD CONSTRAINT "data_import_rows_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."data_import_rows" ADD CONSTRAINT "data_import_rows_validated_by_fk" FOREIGN KEY ("organization_id", "validated_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."data_import_rows" ADD CONSTRAINT "data_import_rows_form_fk" FOREIGN KEY ("organization_id", "project_id", "form_id") REFERENCES "pathways"."digital_forms"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."data_import_rows" ADD CONSTRAINT "data_import_rows_import_batch_fk" FOREIGN KEY ("organization_id", "project_id", "form_id", "import_batch_id") REFERENCES "pathways"."data_import_batches"("organization_id", "project_id", "form_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."metadata_mappings" ADD CONSTRAINT "metadata_mappings_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."metadata_mappings" ADD CONSTRAINT "metadata_mappings_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."metadata_mappings" ADD CONSTRAINT "metadata_mappings_form_fk" FOREIGN KEY ("organization_id", "project_id", "form_id") REFERENCES "pathways"."digital_forms"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."metadata_mappings" ADD CONSTRAINT "metadata_mappings_import_batch_fk" FOREIGN KEY ("organization_id", "project_id", "form_id", "import_batch_id") REFERENCES "pathways"."data_import_batches"("organization_id", "project_id", "form_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."metadata_mappings" ADD CONSTRAINT "metadata_mappings_target_field_fk" FOREIGN KEY ("organization_id", "project_id", "form_id", "target_field_id") REFERENCES "pathways"."form_fields"("organization_id", "project_id", "form_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_submissions" ADD CONSTRAINT "form_submissions_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_submissions" ADD CONSTRAINT "form_submissions_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_submissions" ADD CONSTRAINT "form_submissions_submitted_by_fk" FOREIGN KEY ("organization_id", "submitted_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_submissions" ADD CONSTRAINT "form_submissions_validated_by_fk" FOREIGN KEY ("organization_id", "validated_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_submissions" ADD CONSTRAINT "form_submissions_form_fk" FOREIGN KEY ("organization_id", "project_id", "form_id") REFERENCES "pathways"."digital_forms"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_submissions" ADD CONSTRAINT "form_submissions_import_batch_fk" FOREIGN KEY ("organization_id", "project_id", "form_id", "import_batch_id") REFERENCES "pathways"."data_import_batches"("organization_id", "project_id", "form_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_submissions" ADD CONSTRAINT "form_submissions_import_row_fk" FOREIGN KEY ("organization_id", "project_id", "form_id", "import_batch_id", "import_row_id") REFERENCES "pathways"."data_import_rows"("organization_id", "project_id", "form_id", "import_batch_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_submissions" ADD CONSTRAINT "form_submissions_enrollment_fk" FOREIGN KEY ("organization_id", "project_id", "enrollment_id") REFERENCES "pathways"."beneficiary_project_enrollments"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_response_values" ADD CONSTRAINT "form_response_values_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_response_values" ADD CONSTRAINT "form_response_values_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_response_values" ADD CONSTRAINT "form_response_values_form_fk" FOREIGN KEY ("organization_id", "project_id", "form_id") REFERENCES "pathways"."digital_forms"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_response_values" ADD CONSTRAINT "form_response_values_submission_fk" FOREIGN KEY ("organization_id", "project_id", "form_id", "submission_id") REFERENCES "pathways"."form_submissions"("organization_id", "project_id", "form_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."form_response_values" ADD CONSTRAINT "form_response_values_field_fk" FOREIGN KEY ("organization_id", "project_id", "form_id", "field_id") REFERENCES "pathways"."form_fields"("organization_id", "project_id", "form_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiaries" ADD CONSTRAINT "beneficiaries_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiaries" ADD CONSTRAINT "beneficiaries_created_by_fk" FOREIGN KEY ("organization_id", "created_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_project_enrollments" ADD CONSTRAINT "beneficiary_project_enrollments_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_project_enrollments" ADD CONSTRAINT "beneficiary_project_enrollments_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_project_enrollments" ADD CONSTRAINT "beneficiary_project_enrollments_recorded_by_fk" FOREIGN KEY ("organization_id", "recorded_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_project_enrollments" ADD CONSTRAINT "beneficiary_project_enrollments_beneficiary_fk" FOREIGN KEY ("organization_id", "beneficiary_id") REFERENCES "pathways"."beneficiaries"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."journey_stages" ADD CONSTRAINT "journey_stages_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."journey_stages" ADD CONSTRAINT "journey_stages_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."journey_stages" ADD CONSTRAINT "journey_stages_created_by_fk" FOREIGN KEY ("organization_id", "created_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."journey_stages" ADD CONSTRAINT "journey_stages_parent_stage_fk" FOREIGN KEY ("organization_id", "project_id", "parent_stage_id") REFERENCES "pathways"."journey_stages"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."activity_journey_stage_mappings" ADD CONSTRAINT "activity_journey_stage_mappings_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."activity_journey_stage_mappings" ADD CONSTRAINT "activity_journey_stage_mappings_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."activity_journey_stage_mappings" ADD CONSTRAINT "activity_journey_stage_mappings_created_by_fk" FOREIGN KEY ("organization_id", "created_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."activity_journey_stage_mappings" ADD CONSTRAINT "activity_journey_stage_mappings_activity_fk" FOREIGN KEY ("organization_id", "project_id", "activity_id") REFERENCES "pathways"."project_activities"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."activity_journey_stage_mappings" ADD CONSTRAINT "activity_journey_stage_mappings_stage_fk" FOREIGN KEY ("organization_id", "project_id", "stage_id") REFERENCES "pathways"."journey_stages"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_activity_participations" ADD CONSTRAINT "beneficiary_activity_participations_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_activity_participations" ADD CONSTRAINT "beneficiary_activity_participations_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_activity_participations" ADD CONSTRAINT "beneficiary_activity_participations_recorded_by_fk" FOREIGN KEY ("organization_id", "recorded_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_activity_participations" ADD CONSTRAINT "beneficiary_activity_participations_enrollment_fk" FOREIGN KEY ("organization_id", "project_id", "enrollment_id") REFERENCES "pathways"."beneficiary_project_enrollments"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_activity_participations" ADD CONSTRAINT "beneficiary_activity_participations_activity_fk" FOREIGN KEY ("organization_id", "project_id", "activity_id") REFERENCES "pathways"."project_activities"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_journey_events" ADD CONSTRAINT "beneficiary_journey_events_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_journey_events" ADD CONSTRAINT "beneficiary_journey_events_project_fk" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_journey_events" ADD CONSTRAINT "beneficiary_journey_events_recorded_by_fk" FOREIGN KEY ("organization_id", "recorded_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_journey_events" ADD CONSTRAINT "beneficiary_journey_events_enrollment_fk" FOREIGN KEY ("organization_id", "project_id", "enrollment_id") REFERENCES "pathways"."beneficiary_project_enrollments"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_journey_events" ADD CONSTRAINT "beneficiary_journey_events_activity_fk" FOREIGN KEY ("organization_id", "project_id", "activity_id") REFERENCES "pathways"."project_activities"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_journey_events" ADD CONSTRAINT "beneficiary_journey_events_stage_fk" FOREIGN KEY ("organization_id", "project_id", "stage_id") REFERENCES "pathways"."journey_stages"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_journey_events" ADD CONSTRAINT "beneficiary_journey_events_participation_fk" FOREIGN KEY ("organization_id", "project_id", "enrollment_id", "activity_id", "participation_id") REFERENCES "pathways"."beneficiary_activity_participations"("organization_id", "project_id", "enrollment_id", "activity_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."beneficiary_journey_events" ADD CONSTRAINT "beneficiary_journey_events_activity_stage_fk" FOREIGN KEY ("organization_id", "project_id", "activity_id", "stage_id") REFERENCES "pathways"."activity_journey_stage_mappings"("organization_id", "project_id", "activity_id", "stage_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE pathways.programs ADD CONSTRAINT programs_code_not_blank CHECK (btrim(code) <> '');

ALTER TABLE pathways.programs ADD CONSTRAINT programs_name_not_blank CHECK (btrim(name) <> '');

ALTER TABLE pathways.programs ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.projects ADD CONSTRAINT projects_code_not_blank CHECK (btrim(code) <> '');

ALTER TABLE pathways.projects ADD CONSTRAINT projects_title_not_blank CHECK (btrim(title) <> '');

ALTER TABLE pathways.projects ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.user_project_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_activities ADD CONSTRAINT project_activities_code_not_blank CHECK (btrim(code) <> '');

ALTER TABLE pathways.project_activities ADD CONSTRAINT project_activities_title_not_blank CHECK (btrim(title) <> '');

ALTER TABLE pathways.project_activities ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_activity_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_milestones ADD CONSTRAINT project_milestones_title_not_blank CHECK (btrim(title) <> '');

ALTER TABLE pathways.project_milestones ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.project_indicators ADD CONSTRAINT project_indicators_code_not_blank CHECK (btrim(code) <> '');

ALTER TABLE pathways.project_indicators ADD CONSTRAINT project_indicators_name_not_blank CHECK (btrim(name) <> '');

ALTER TABLE pathways.project_indicators ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.digital_forms ADD CONSTRAINT digital_forms_code_not_blank CHECK (btrim(code) <> '');

ALTER TABLE pathways.digital_forms ADD CONSTRAINT digital_forms_name_not_blank CHECK (btrim(name) <> '');

ALTER TABLE pathways.digital_forms ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.form_fields ADD CONSTRAINT form_fields_code_not_blank CHECK (btrim(code) <> '');

ALTER TABLE pathways.form_fields ADD CONSTRAINT form_fields_label_not_blank CHECK (btrim(label) <> '');

ALTER TABLE pathways.form_fields ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.data_import_batches ADD CONSTRAINT data_import_batches_original_file_name_not_blank CHECK (btrim(original_file_name) <> '');

ALTER TABLE pathways.data_import_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.data_import_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.metadata_mappings ADD CONSTRAINT metadata_mappings_source_field_name_not_blank CHECK (btrim(source_field_name) <> '');

ALTER TABLE pathways.metadata_mappings ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.form_submissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.form_response_values ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.beneficiaries ADD CONSTRAINT beneficiaries_code_not_blank CHECK (btrim(code) <> '');

ALTER TABLE pathways.beneficiaries ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.beneficiary_project_enrollments ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.journey_stages ADD CONSTRAINT journey_stages_code_not_blank CHECK (btrim(code) <> '');

ALTER TABLE pathways.journey_stages ADD CONSTRAINT journey_stages_name_not_blank CHECK (btrim(name) <> '');

ALTER TABLE pathways.journey_stages ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.activity_journey_stage_mappings ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.beneficiary_activity_participations ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.beneficiary_journey_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE pathways.programs ADD CONSTRAINT programs_date_order CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

ALTER TABLE pathways.programs ADD CONSTRAINT programs_completed_date CHECK (status <> 'COMPLETED' OR end_date IS NOT NULL);

ALTER TABLE pathways.projects ADD CONSTRAINT projects_date_order CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

ALTER TABLE pathways.projects ADD CONSTRAINT projects_completed_date CHECK (status <> 'COMPLETED' OR end_date IS NOT NULL);

ALTER TABLE pathways.user_project_assignments ADD CONSTRAINT upa_state CHECK ((status = 'ACTIVE' AND ended_at IS NULL AND end_reason IS NULL) OR (status = 'ENDED' AND ended_at IS NOT NULL AND ended_at >= assigned_at AND end_reason IS NOT NULL AND btrim(end_reason) <> ''));

ALTER TABLE pathways.project_activity_assignments ADD CONSTRAINT paa_state CHECK ((status = 'ACTIVE' AND ended_at IS NULL AND end_reason IS NULL) OR (status <> 'ACTIVE' AND ended_at IS NOT NULL AND ended_at >= assigned_at AND end_reason IS NOT NULL AND btrim(end_reason) <> ''));

CREATE UNIQUE INDEX upa_one_active_user_project ON pathways.user_project_assignments(organization_id,project_id,user_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX paa_one_active_assignment ON pathways.project_activity_assignments(organization_id,project_id,activity_id,project_assignment_id) WHERE status = 'ACTIVE';

ALTER TABLE pathways.project_activities ADD CONSTRAINT activities_date_order CHECK ((planned_start_date IS NULL OR planned_end_date IS NULL OR planned_end_date >= planned_start_date) AND (actual_end_date IS NULL OR (actual_start_date IS NOT NULL AND actual_end_date >= actual_start_date)));

ALTER TABLE pathways.project_activities ADD CONSTRAINT activities_lifecycle CHECK ((status = 'NOT_STARTED' AND actual_start_date IS NULL AND actual_end_date IS NULL AND reviewed_by_id IS NULL AND reviewed_at IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)
 OR (status IN ('IN_PROGRESS','FOR_REVIEW') AND actual_start_date IS NOT NULL AND actual_end_date IS NULL AND reviewed_by_id IS NULL AND reviewed_at IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)
 OR (status = 'COMPLETED' AND actual_start_date IS NOT NULL AND actual_end_date IS NOT NULL AND created_by_id IS NOT NULL AND reviewed_by_id IS NOT NULL AND reviewed_by_id <> created_by_id AND reviewed_at IS NOT NULL AND reviewed_at::date >= actual_end_date AND cancelled_at IS NULL AND cancellation_reason IS NULL)
 OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> '' AND reviewed_by_id IS NULL AND reviewed_at IS NULL));

ALTER TABLE pathways.project_milestones ADD CONSTRAINT milestones_completion CHECK ((status = 'COMPLETED' AND completion_date IS NOT NULL) OR (status <> 'COMPLETED' AND completion_date IS NULL));

ALTER TABLE pathways.projects ADD CONSTRAINT projects_public_state CHECK ((public_visibility_status = 'PRIVATE' AND public_submitted_by_id IS NULL AND public_submitted_at IS NULL AND public_approved_by_id IS NULL AND public_approved_at IS NULL AND published_by_id IS NULL AND published_at IS NULL)
 OR (public_visibility_status = 'FOR_REVIEW' AND public_summary IS NOT NULL AND btrim(public_summary) <> '' AND public_submitted_by_id IS NOT NULL AND public_submitted_at IS NOT NULL AND public_approved_by_id IS NULL AND public_approved_at IS NULL AND published_by_id IS NULL AND published_at IS NULL)
 OR (public_visibility_status IN ('APPROVED','PUBLISHED') AND public_summary IS NOT NULL AND btrim(public_summary) <> '' AND public_submitted_by_id IS NOT NULL AND public_submitted_at IS NOT NULL AND public_approved_by_id IS NOT NULL AND public_approved_by_id <> public_submitted_by_id AND public_approved_at IS NOT NULL AND public_approved_at >= public_submitted_at
 AND ((public_visibility_status = 'APPROVED' AND published_by_id IS NULL AND published_at IS NULL) OR (public_visibility_status = 'PUBLISHED' AND published_by_id IS NOT NULL AND published_at IS NOT NULL AND published_at >= public_approved_at))));

ALTER TABLE pathways.project_indicators ADD CONSTRAINT indicators_bounds CHECK ((minimum_value IS NULL OR minimum_value <> 'NaN'::numeric) AND (maximum_value IS NULL OR maximum_value <> 'NaN'::numeric)
 AND (minimum_value IS NULL OR maximum_value IS NULL OR maximum_value >= minimum_value)
 AND (unit <> 'SCORE' OR (maximum_value IS NOT NULL AND maximum_value > coalesce(minimum_value,0))));

ALTER TABLE pathways.project_indicators ADD CONSTRAINT indicators_baseline_value_range CHECK (baseline_value IS NULL OR (baseline_value <> 'NaN'::numeric
 AND (minimum_value IS NULL OR baseline_value >= minimum_value) AND (maximum_value IS NULL OR baseline_value <= maximum_value)
 AND (unit <> 'PERCENTAGE' OR baseline_value BETWEEN 0 AND 100)
 AND (unit NOT IN ('COUNT','AMOUNT','SCORE') OR baseline_value >= 0)
 AND (unit <> 'COUNT' OR baseline_value = trunc(baseline_value))));

ALTER TABLE pathways.project_indicators ADD CONSTRAINT indicators_current_value_range CHECK (current_value IS NULL OR (current_value <> 'NaN'::numeric
 AND (minimum_value IS NULL OR current_value >= minimum_value) AND (maximum_value IS NULL OR current_value <= maximum_value)
 AND (unit <> 'PERCENTAGE' OR current_value BETWEEN 0 AND 100)
 AND (unit NOT IN ('COUNT','AMOUNT','SCORE') OR current_value >= 0)
 AND (unit <> 'COUNT' OR current_value = trunc(current_value))));

ALTER TABLE pathways.project_indicators ADD CONSTRAINT indicators_target_value_range CHECK (target_value IS NULL OR (target_value <> 'NaN'::numeric
 AND (minimum_value IS NULL OR target_value >= minimum_value) AND (maximum_value IS NULL OR target_value <= maximum_value)
 AND (unit <> 'PERCENTAGE' OR target_value BETWEEN 0 AND 100)
 AND (unit NOT IN ('COUNT','AMOUNT','SCORE') OR target_value >= 0)
 AND (unit <> 'COUNT' OR target_value = trunc(target_value))));

ALTER TABLE pathways.project_indicators ADD CONSTRAINT indicators_actual_value_range CHECK (actual_value IS NULL OR (actual_value <> 'NaN'::numeric
 AND (minimum_value IS NULL OR actual_value >= minimum_value) AND (maximum_value IS NULL OR actual_value <= maximum_value)
 AND (unit <> 'PERCENTAGE' OR actual_value BETWEEN 0 AND 100)
 AND (unit NOT IN ('COUNT','AMOUNT','SCORE') OR actual_value >= 0)
 AND (unit <> 'COUNT' OR actual_value = trunc(actual_value))));

ALTER TABLE pathways.digital_forms ADD CONSTRAINT forms_version CHECK (version > 0);

ALTER TABLE pathways.digital_forms ADD CONSTRAINT forms_state CHECK ((status='DRAFT' AND published_at IS NULL AND published_by_id IS NULL AND archived_at IS NULL)
 OR (status='PUBLISHED' AND published_at IS NOT NULL AND published_by_id IS NOT NULL AND archived_at IS NULL)
 OR (status='ARCHIVED' AND archived_at IS NOT NULL AND ((published_at IS NULL AND published_by_id IS NULL) OR (published_at IS NOT NULL AND published_by_id IS NOT NULL AND archived_at >= published_at))));

ALTER TABLE pathways.form_fields ADD CONSTRAINT fields_sequence CHECK (sequence_no > 0);

ALTER TABLE pathways.form_fields ADD CONSTRAINT fields_numeric_bounds CHECK ((minimum_value IS NULL OR (minimum_value <> 'NaN'::numeric AND data_type IN ('INTEGER','DECIMAL'))) AND (maximum_value IS NULL OR (maximum_value <> 'NaN'::numeric AND data_type IN ('INTEGER','DECIMAL'))) AND (minimum_value IS NULL OR maximum_value IS NULL OR maximum_value >= minimum_value));

CREATE FUNCTION pathways.p2_valid_options(options jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
 SELECT CASE WHEN jsonb_typeof(options) <> 'array' THEN false
 ELSE jsonb_array_length(options)>0 AND NOT EXISTS(SELECT FROM jsonb_array_elements(options) v WHERE jsonb_typeof(v)<>'string' OR btrim(v#>>'{}')='')
 AND (SELECT count(*)=count(DISTINCT v) FROM jsonb_array_elements(options) v) END;
$$;

ALTER TABLE pathways.form_fields ADD CONSTRAINT fields_allowed_values CHECK ((data_type IN ('SELECT','MULTIPLE_SELECT') AND allowed_values IS NOT NULL AND pathways.p2_valid_options(allowed_values)) OR (data_type NOT IN ('SELECT','MULTIPLE_SELECT') AND allowed_values IS NULL));

ALTER TABLE pathways.data_import_rows ADD CONSTRAINT import_rows_shape CHECK (row_number > 0 AND jsonb_typeof(raw_data) = 'object' AND jsonb_typeof(validation_errors)='array');

ALTER TABLE pathways.data_import_rows ADD CONSTRAINT import_rows_state CHECK ((status='PENDING' AND validated_by_id IS NULL AND validated_at IS NULL AND processed_at IS NULL)
 OR (status='INVALID' AND validated_by_id IS NOT NULL AND validated_at IS NOT NULL AND jsonb_array_length(validation_errors)>0 AND processed_at IS NULL)
 OR (status IN ('VALID','PROCESSED') AND validated_by_id IS NOT NULL AND validated_at IS NOT NULL AND jsonb_array_length(validation_errors)=0 AND ((status='VALID' AND processed_at IS NULL) OR (status='PROCESSED' AND processed_at IS NOT NULL AND processed_at>=validated_at))));

ALTER TABLE pathways.data_import_batches ADD CONSTRAINT import_batches_state CHECK ((status IN ('UPLOADED','MAPPED','FAILED') AND processed_at IS NULL)
 OR (status='VALIDATED' AND validated_at IS NOT NULL AND validated_at>=uploaded_at AND processed_at IS NULL)
 OR (status='PROCESSED' AND validated_at IS NOT NULL AND processed_at IS NOT NULL AND validated_at>=uploaded_at AND processed_at>=validated_at));

ALTER TABLE pathways.metadata_mappings ADD CONSTRAINT mapping_target CHECK ((status='MAPPED' AND ((target_field_id IS NOT NULL AND target_system_field IS NULL) OR (target_field_id IS NULL AND target_system_field IS NOT NULL)))
 OR (status<>'MAPPED' AND target_field_id IS NULL AND target_system_field IS NULL));

ALTER TABLE pathways.metadata_mappings ADD CONSTRAINT mapping_system_allowlist CHECK (target_system_field IS NULL OR target_system_field IN ('beneficiaries.code','beneficiaries.first_name','beneficiaries.middle_name','beneficiaries.last_name','beneficiaries.sex','beneficiaries.birth_date','beneficiaries.disability_status','beneficiaries.location_barangay','beneficiaries.location_city_municipality','beneficiaries.location_province'));

ALTER TABLE pathways.form_submissions ADD CONSTRAINT submission_source CHECK ((source='DIRECT_ENCODING' AND import_batch_id IS NULL AND import_row_id IS NULL) OR (source='IMPORTED_DATASET' AND import_batch_id IS NOT NULL AND import_row_id IS NOT NULL));

ALTER TABLE pathways.form_submissions ADD CONSTRAINT submission_state CHECK ((status='DRAFT' AND validated_by_id IS NULL AND validated_at IS NULL AND processed_at IS NULL AND rejection_reason IS NULL)
 OR (status='REJECTED' AND validated_by_id IS NULL AND validated_at IS NULL AND processed_at IS NULL AND rejection_reason IS NOT NULL AND btrim(rejection_reason)<>'')
 OR (status IN ('VALIDATED','PROCESSED') AND validated_by_id IS NOT NULL AND validated_at IS NOT NULL AND validated_at >= submitted_at AND rejection_reason IS NULL AND ((status='VALIDATED' AND processed_at IS NULL) OR (status='PROCESSED' AND processed_at IS NOT NULL AND processed_at >= validated_at))));

ALTER TABLE pathways.beneficiaries ADD CONSTRAINT beneficiaries_age CHECK (age_at_registration IS NULL OR age_at_registration BETWEEN 0 AND 130);

ALTER TABLE pathways.beneficiaries ADD CONSTRAINT beneficiaries_birth_date CHECK (birth_date IS NULL OR birth_date <= created_at::date);

ALTER TABLE pathways.beneficiaries ADD CONSTRAINT beneficiaries_archive CHECK ((status='ARCHIVED') = (archived_at IS NOT NULL));

ALTER TABLE pathways.beneficiaries ADD CONSTRAINT beneficiaries_minor_consent CHECK (NOT guardian_consent_recorded OR (is_minor AND consent_recorded));

ALTER TABLE pathways.beneficiary_project_enrollments ADD CONSTRAINT enrollments_state CHECK ((status='ACTIVE' AND ended_date IS NULL AND end_reason IS NULL) OR (status<>'ACTIVE' AND ended_date IS NOT NULL AND ended_date >= enrollment_date AND end_reason IS NOT NULL AND btrim(end_reason)<>''));

ALTER TABLE pathways.journey_stages ADD CONSTRAINT stages_order CHECK (stage_order>0 AND (parent_stage_id IS NULL OR parent_stage_id<>id));

ALTER TABLE pathways.activity_journey_stage_mappings ADD CONSTRAINT stage_mapping_sequence CHECK (sequence_order>0);

ALTER TABLE pathways.beneficiary_journey_events ADD CONSTRAINT journey_event_participation CHECK (participation_id IS NULL OR activity_id IS NOT NULL);

-- These invoker functions never access Auth/Storage or create business records.
-- Row locks serialize a child insert with concurrent parent status/definition changes.
CREATE FUNCTION pathways.p2_guard_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR (to_jsonb(NEW)->'project_id') IS DISTINCT FROM (to_jsonb(OLD)->'project_id') THEN
    RAISE EXCEPTION 'Record identity and organization/project ownership are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pathways.p2_guard_project_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
DECLARE profile_state pathways.account_status;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.user_id<>OLD.user_id OR NEW.assigned_at<>OLD.assigned_at OR OLD.status='ENDED') THEN
    RAISE EXCEPTION 'Assignment history is immutable; create a new assignment' USING ERRCODE='23514';
  END IF;
  IF NEW.status='ACTIVE' THEN
    SELECT account_status INTO profile_state FROM pathways.system_users
      WHERE organization_id=NEW.organization_id AND id=NEW.user_id FOR SHARE;
    IF profile_state IS DISTINCT FROM 'ACTIVE'::pathways.account_status THEN
      RAISE EXCEPTION 'Active assignment requires an active profile' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.status='ENDED' AND EXISTS(SELECT FROM pathways.project_activity_assignments
     WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id
       AND project_assignment_id=NEW.id AND status='ACTIVE') THEN
    RAISE EXCEPTION 'End active activity assignments before ending project membership' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pathways.p2_guard_profile_assignments() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
BEGIN
  IF (NEW.account_status<>'ACTIVE' OR NEW.organization_id<>OLD.organization_id) AND EXISTS(
    SELECT FROM pathways.user_project_assignments WHERE organization_id=OLD.organization_id AND user_id=OLD.id AND status='ACTIVE'
  ) THEN
    RAISE EXCEPTION 'End active project assignments before changing active profile scope/status' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pathways.p2_guard_activity_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
DECLARE parent pathways.user_project_assignments%ROWTYPE; profile_state pathways.account_status;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.activity_id<>OLD.activity_id OR NEW.project_assignment_id<>OLD.project_assignment_id
    OR NEW.assigned_at<>OLD.assigned_at OR OLD.status<>'ACTIVE') THEN
    RAISE EXCEPTION 'Activity assignment history is immutable' USING ERRCODE='23514';
  END IF;
  SELECT * INTO parent FROM pathways.user_project_assignments
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND id=NEW.project_assignment_id FOR SHARE;
  IF NEW.status='ACTIVE' THEN
    IF parent.id IS NULL OR parent.status<>'ACTIVE' OR NEW.assigned_at<parent.assigned_at THEN
      RAISE EXCEPTION 'Active activity assignment requires active project membership' USING ERRCODE='23514';
    END IF;
    SELECT account_status INTO profile_state FROM pathways.system_users
      WHERE organization_id=NEW.organization_id AND id=parent.user_id FOR SHARE;
    IF profile_state IS DISTINCT FROM 'ACTIVE'::pathways.account_status THEN
      RAISE EXCEPTION 'Active activity assignment requires an active profile' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pathways.p2_guard_activity_lifecycle() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status IN ('COMPLETED','CANCELLED')
     AND to_jsonb(NEW)-ARRAY['archived_at','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['archived_at','updated_at'] THEN
    RAISE EXCEPTION 'Completed/cancelled activity history is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'NOT_STARTED' THEN
      RAISE EXCEPTION 'New activity must start NOT_STARTED' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.status<>OLD.status AND NOT (
    (OLD.status='NOT_STARTED' AND NEW.status IN ('IN_PROGRESS','CANCELLED'))
    OR (OLD.status='IN_PROGRESS' AND NEW.status IN ('FOR_REVIEW','CANCELLED'))
    OR (OLD.status='FOR_REVIEW' AND NEW.status IN ('IN_PROGRESS','COMPLETED','CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Invalid activity lifecycle transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pathways.p2_guard_public_content() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.public_visibility_status<>'PRIVATE' THEN
      RAISE EXCEPTION 'New project starts private before public review' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.public_visibility_status<>OLD.public_visibility_status AND NOT (
    (OLD.public_visibility_status='PRIVATE' AND NEW.public_visibility_status='FOR_REVIEW')
    OR (OLD.public_visibility_status='FOR_REVIEW' AND NEW.public_visibility_status IN ('PRIVATE','APPROVED'))
    OR (OLD.public_visibility_status='APPROVED' AND NEW.public_visibility_status IN ('FOR_REVIEW','PUBLISHED'))
    OR (OLD.public_visibility_status='PUBLISHED' AND NEW.public_visibility_status='FOR_REVIEW')
  ) THEN
    RAISE EXCEPTION 'Public workflow must pass review, approval, then publication' USING ERRCODE='23514';
  END IF;
  IF OLD.public_visibility_status IN ('APPROVED','PUBLISHED')
    AND NEW.public_visibility_status IN ('APPROVED','PUBLISHED')
    AND (NEW.public_summary IS DISTINCT FROM OLD.public_summary
      OR NEW.title IS DISTINCT FROM OLD.title OR NEW.code IS DISTINCT FROM OLD.code
      OR NEW.public_submitted_by_id IS DISTINCT FROM OLD.public_submitted_by_id
      OR NEW.public_submitted_at IS DISTINCT FROM OLD.public_submitted_at
      OR NEW.public_approved_by_id IS DISTINCT FROM OLD.public_approved_by_id
      OR NEW.public_approved_at IS DISTINCT FROM OLD.public_approved_at) THEN
    RAISE EXCEPTION 'Changed public content requires renewed review/approval' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pathways.p2_guard_form() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status<>'DRAFT' THEN
      RAISE EXCEPTION 'Published/archived form versions cannot be deleted' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'DRAFT' THEN
      RAISE EXCEPTION 'Create fields on a draft form before publishing' USING ERRCODE='23514';
    END IF;
  ELSE
    IF OLD.status<>'DRAFT' AND (
      to_jsonb(NEW)-ARRAY['status','archived_at','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','archived_at','updated_at']
      OR (OLD.status='PUBLISHED' AND NEW.status NOT IN ('PUBLISHED','ARCHIVED'))
      OR (OLD.status='ARCHIVED' AND (NEW.status<>'ARCHIVED' OR NEW.archived_at IS DISTINCT FROM OLD.archived_at))
    ) THEN
      RAISE EXCEPTION 'Form version definition is immutable after publication or archive' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.status='PUBLISHED' AND (TG_OP='INSERT' OR OLD.status='DRAFT') THEN
    IF NOT EXISTS(SELECT FROM pathways.form_fields WHERE form_id=NEW.id) THEN
      RAISE EXCEPTION 'Published form must contain fields' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pathways.p2_guard_form_field() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
DECLARE parent_id uuid; form_state pathways.form_status;
BEGIN
  IF TG_OP='UPDATE' AND NEW.form_id<>OLD.form_id THEN
    RAISE EXCEPTION 'Form fields cannot be moved between versions' USING ERRCODE='23514';
  END IF;
  parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD.form_id ELSE NEW.form_id END;
  SELECT status INTO form_state FROM pathways.digital_forms WHERE id=parent_id FOR UPDATE;
  IF form_state IS DISTINCT FROM 'DRAFT'::pathways.form_status THEN
    RAISE EXCEPTION 'Fields are immutable once their form leaves DRAFT' USING ERRCODE='23514';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE FUNCTION pathways.p2_guard_mapping() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
DECLARE batch_id uuid; batch_state pathways.import_status;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.import_batch_id<>OLD.import_batch_id OR NEW.form_id<>OLD.form_id) THEN
    RAISE EXCEPTION 'Mappings cannot be moved to another batch/form' USING ERRCODE='23514';
  END IF;
  batch_id:=CASE WHEN TG_OP='DELETE' THEN OLD.import_batch_id ELSE NEW.import_batch_id END;
  SELECT status INTO batch_state FROM pathways.data_import_batches WHERE id=batch_id FOR UPDATE;
  IF batch_state IS NULL OR batch_state NOT IN ('UPLOADED','MAPPED','FAILED') THEN
    RAISE EXCEPTION 'Mappings are frozen once the batch is validated' USING ERRCODE='23514';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE FUNCTION pathways.p2_guard_import_row() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
DECLARE parent_state pathways.import_status; batch_id uuid;
BEGIN
  batch_id:=CASE WHEN TG_OP='DELETE' THEN OLD.import_batch_id ELSE NEW.import_batch_id END;
  SELECT status INTO parent_state FROM pathways.data_import_batches WHERE id=batch_id FOR UPDATE;
  IF parent_state IN ('VALIDATED','PROCESSED') AND (
    TG_OP<>'UPDATE' OR to_jsonb(NEW)-ARRAY['status','processed_at','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','processed_at','updated_at']
  ) THEN
    RAISE EXCEPTION 'Raw batch contents are frozen after validation' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.status IN ('VALID','PROCESSED') THEN
      RAISE EXCEPTION 'Validated raw import evidence cannot be deleted' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.import_batch_id<>OLD.import_batch_id OR NEW.form_id<>OLD.form_id OR NEW.row_number<>OLD.row_number THEN
      RAISE EXCEPTION 'Import row identity is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.status IN ('VALID','PROCESSED') AND (
      to_jsonb(NEW)-ARRAY['status','processed_at','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','processed_at','updated_at']
      OR NEW.status NOT IN ('VALID','PROCESSED')
      OR (OLD.status='PROCESSED' AND (NEW.status<>'PROCESSED' OR NEW.processed_at IS DISTINCT FROM OLD.processed_at))
    ) THEN
      RAISE EXCEPTION 'Validated raw evidence cannot be rewritten' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pathways.p2_guard_batch() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
DECLARE form_state pathways.form_status;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.form_id<>OLD.form_id OR NEW.uploaded_by_id<>OLD.uploaded_by_id OR NEW.uploaded_at<>OLD.uploaded_at
    OR (OLD.status='PROCESSED' AND to_jsonb(NEW)-'updated_at' IS DISTINCT FROM to_jsonb(OLD)-'updated_at')
    OR (OLD.status='VALIDATED' AND NEW.status NOT IN ('VALIDATED','PROCESSED','FAILED'))) THEN
    RAISE EXCEPTION 'Import batch history is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    SELECT status INTO form_state FROM pathways.digital_forms WHERE id=NEW.form_id FOR SHARE;
    IF form_state IS DISTINCT FROM 'PUBLISHED'::pathways.form_status THEN
      RAISE EXCEPTION 'Import requires a published form version' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pathways.p2_guard_submission() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
DECLARE form_state pathways.form_status; raw_state pathways.import_row_status;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status IN ('VALIDATED','PROCESSED') OR OLD.source='IMPORTED_DATASET' THEN
      RAISE EXCEPTION 'Validated or imported submission history cannot be deleted' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.form_id<>OLD.form_id OR NEW.source<>OLD.source OR NEW.import_row_id IS DISTINCT FROM OLD.import_row_id
      OR NEW.import_batch_id IS DISTINCT FROM OLD.import_batch_id THEN
      RAISE EXCEPTION 'Submission source and form are immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.status IN ('VALIDATED','PROCESSED') AND (
      to_jsonb(NEW)-ARRAY['status','processed_at','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','processed_at','updated_at']
      OR NEW.status NOT IN ('VALIDATED','PROCESSED')
      OR (OLD.status='PROCESSED' AND (NEW.status<>'PROCESSED' OR NEW.processed_at IS DISTINCT FROM OLD.processed_at))
    ) THEN
      RAISE EXCEPTION 'Validated submission content is immutable' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT status INTO form_state FROM pathways.digital_forms WHERE id=NEW.form_id FOR SHARE;
    IF form_state IS DISTINCT FROM 'PUBLISHED'::pathways.form_status THEN
      RAISE EXCEPTION 'Submission requires a published form version' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.source='IMPORTED_DATASET' THEN
    SELECT status INTO raw_state FROM pathways.data_import_rows WHERE id=NEW.import_row_id
      AND organization_id=NEW.organization_id AND project_id=NEW.project_id
      AND form_id=NEW.form_id AND import_batch_id=NEW.import_batch_id FOR UPDATE;
    IF raw_state IS NULL OR raw_state NOT IN ('VALID','PROCESSED') THEN
      RAISE EXCEPTION 'Unvalidated or invalid import row cannot create a normalized submission' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pathways.p2_valid_response(field pathways.form_fields, value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pathways AS $$
DECLARE text_value text; number_value numeric; element jsonb;
BEGIN
  IF value IS NULL OR value='null'::jsonb THEN RETURN NOT field.is_required; END IF;
  text_value:=value#>>'{}';
  CASE field.data_type
  WHEN 'TEXT','LONG_TEXT' THEN
    RETURN jsonb_typeof(value)='string' AND (NOT field.is_required OR btrim(text_value)<>'');
  WHEN 'INTEGER','DECIMAL' THEN
    IF jsonb_typeof(value)<>'number' THEN RETURN false; END IF;
    number_value:=text_value::numeric;
    RETURN number_value<>'NaN'::numeric
      AND (field.data_type<>'INTEGER' OR trunc(number_value)=number_value)
      AND (field.minimum_value IS NULL OR number_value>=field.minimum_value)
      AND (field.maximum_value IS NULL OR number_value<=field.maximum_value);
  WHEN 'BOOLEAN' THEN RETURN jsonb_typeof(value)='boolean';
  WHEN 'DATE' THEN
    IF jsonb_typeof(value)<>'string' OR text_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false; END IF;
    BEGIN RETURN to_char(text_value::date,'YYYY-MM-DD')=text_value;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN false; END;
  WHEN 'SELECT' THEN RETURN jsonb_typeof(value)='string' AND field.allowed_values @> jsonb_build_array(value);
  WHEN 'MULTIPLE_SELECT' THEN
    IF jsonb_typeof(value)<>'array' THEN RETURN false; END IF;
    IF field.is_required AND jsonb_array_length(value)=0 THEN RETURN false; END IF;
    IF (SELECT count(*)<>count(DISTINCT v) FROM jsonb_array_elements(value) v) THEN RETURN false; END IF;
    FOR element IN SELECT v FROM jsonb_array_elements(value) v LOOP
      IF jsonb_typeof(element)<>'string' OR NOT field.allowed_values @> jsonb_build_array(element) THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
  ELSE RETURN false;
  END CASE;
END;
$$;

CREATE FUNCTION pathways.p2_guard_response() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
DECLARE submission_id uuid; parent_state pathways.submission_status; field pathways.form_fields%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.submission_id<>OLD.submission_id OR NEW.field_id<>OLD.field_id OR NEW.form_id<>OLD.form_id) THEN
    RAISE EXCEPTION 'Response source is immutable' USING ERRCODE='23514';
  END IF;
  submission_id:=CASE WHEN TG_OP='DELETE' THEN OLD.submission_id ELSE NEW.submission_id END;
  SELECT status INTO parent_state FROM pathways.form_submissions s WHERE s.id=submission_id FOR UPDATE;
  IF parent_state IS DISTINCT FROM 'DRAFT'::pathways.submission_status THEN
    RAISE EXCEPTION 'Only draft submission values are editable' USING ERRCODE='23514';
  END IF;
  IF TG_OP<>'DELETE' THEN
    SELECT * INTO field FROM pathways.form_fields WHERE id=NEW.field_id AND form_id=NEW.form_id
      AND organization_id=NEW.organization_id AND project_id=NEW.project_id;
    IF field.id IS NULL OR NOT pathways.p2_valid_response(field,NEW.value) THEN
      RAISE EXCEPTION 'Response does not satisfy its form field type or bounds' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE FUNCTION pathways.p2_assert_submission() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
DECLARE parent pathways.form_submissions%ROWTYPE; sid uuid;
BEGIN
  IF TG_TABLE_NAME='form_submissions' THEN sid:=NEW.id;
  ELSE sid:=CASE WHEN TG_OP='DELETE' THEN OLD.submission_id ELSE NEW.submission_id END; END IF;
  SELECT * INTO parent FROM pathways.form_submissions WHERE id=sid FOR UPDATE;
  IF parent.status IN ('VALIDATED','PROCESSED') AND EXISTS(
    SELECT FROM pathways.form_fields f LEFT JOIN pathways.form_response_values v ON v.field_id=f.id AND v.submission_id=parent.id
    WHERE f.form_id=parent.form_id AND ((f.is_required AND v.id IS NULL) OR (v.id IS NOT NULL AND NOT pathways.p2_valid_response(f,v.value)))
  ) THEN
    RAISE EXCEPTION 'Validated submission is missing required or valid responses' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION pathways.p2_assert_processed_row() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
DECLARE row_state pathways.import_row_status;
BEGIN
  SELECT status INTO row_state FROM pathways.data_import_rows WHERE id=NEW.id;
  IF row_state='PROCESSED' AND NOT EXISTS(
    SELECT FROM pathways.form_submissions WHERE import_row_id=NEW.id AND status='PROCESSED'
  ) THEN
    RAISE EXCEPTION 'Processed raw row must have a processed normalized submission' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION pathways.p2_assert_batch() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
DECLARE batch pathways.data_import_batches%ROWTYPE; bid uuid;
BEGIN
  IF TG_TABLE_NAME='data_import_batches' THEN bid:=NEW.id;
  ELSE bid:=CASE WHEN TG_OP='DELETE' THEN OLD.import_batch_id ELSE NEW.import_batch_id END; END IF;
  SELECT * INTO batch FROM pathways.data_import_batches WHERE id=bid FOR UPDATE;
  IF batch.status IN ('VALIDATED','PROCESSED') THEN
    IF NOT EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id=bid AND status='MAPPED')
      OR EXISTS(SELECT FROM pathways.metadata_mappings WHERE import_batch_id=bid AND status IN ('PENDING','INVALID'))
      OR EXISTS(SELECT FROM pathways.data_import_rows WHERE import_batch_id=bid AND status='PENDING') THEN
      RAISE EXCEPTION 'Batch requires reviewed mappings and no pending rows' USING ERRCODE='23514';
    END IF;
    IF batch.status='VALIDATED' AND NOT EXISTS(SELECT FROM pathways.data_import_rows WHERE import_batch_id=bid AND status IN ('VALID','PROCESSED')) THEN
      RAISE EXCEPTION 'Validated batch requires valid rows' USING ERRCODE='23514';
    END IF;
    IF batch.status='PROCESSED' AND (
      NOT EXISTS(SELECT FROM pathways.data_import_rows WHERE import_batch_id=bid AND status='PROCESSED')
      OR EXISTS(SELECT FROM pathways.data_import_rows WHERE import_batch_id=bid AND status='VALID')
    ) THEN
      RAISE EXCEPTION 'Processed batch requires every valid row normalized' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION pathways.p2_guard_stage_order() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
DECLARE parent_order integer; parent_terminal boolean;
BEGIN
  -- Lock one project row for tree writes to prevent concurrent cycle creation.
  PERFORM 1 FROM pathways.projects WHERE id=NEW.project_id AND organization_id=NEW.organization_id FOR UPDATE;
  IF NEW.parent_stage_id IS NOT NULL THEN
    SELECT stage_order,is_terminal INTO parent_order,parent_terminal FROM pathways.journey_stages
      WHERE id=NEW.parent_stage_id AND organization_id=NEW.organization_id AND project_id=NEW.project_id;
    IF parent_order IS NULL OR parent_order>=NEW.stage_order OR parent_terminal THEN
      RAISE EXCEPTION 'Stage parent must precede child and cannot be terminal' USING ERRCODE='23514';
    END IF;
  END IF;
  IF EXISTS(SELECT FROM pathways.journey_stages WHERE parent_stage_id=NEW.id AND (stage_order<=NEW.stage_order OR NEW.is_terminal)) THEN
    RAISE EXCEPTION 'Stage change would invalidate existing children' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pathways.p2_guard_enrollment_dates() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
BEGIN
  IF NEW.beneficiary_id<>OLD.beneficiary_id OR EXISTS(
    SELECT FROM pathways.beneficiary_activity_participations
      WHERE enrollment_id=OLD.id AND (participation_date<NEW.enrollment_date OR (NEW.ended_date IS NOT NULL AND participation_date>NEW.ended_date))
  ) OR EXISTS(
    SELECT FROM pathways.beneficiary_journey_events
      WHERE enrollment_id=OLD.id AND (event_date<NEW.enrollment_date OR (NEW.ended_date IS NOT NULL AND event_date>NEW.ended_date))
  ) THEN
    RAISE EXCEPTION 'Enrollment update would invalidate participation/journey history' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pathways.p2_guard_participation_dates() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
DECLARE enrolled date; ended date; occurred date;
BEGIN
  occurred:=CASE WHEN TG_TABLE_NAME='beneficiary_journey_events' THEN (to_jsonb(NEW)->>'event_date')::date ELSE (to_jsonb(NEW)->>'participation_date')::date END;
  SELECT enrollment_date,ended_date INTO enrolled,ended FROM pathways.beneficiary_project_enrollments
    WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND id=NEW.enrollment_id FOR SHARE;
  IF enrolled IS NULL OR occurred<enrolled OR (ended IS NOT NULL AND occurred>ended) THEN
    RAISE EXCEPTION 'Participation/journey event must fall inside its enrollment' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pathways.p2_guard_journey_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pathways AS $$
BEGIN
  RAISE EXCEPTION 'Journey events are append-only history' USING ERRCODE='23514';
END;
$$;

CREATE TRIGGER p2_profile_assignments BEFORE UPDATE OF account_status, organization_id ON pathways.system_users FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_profile_assignments();
CREATE TRIGGER p2_project_assignment BEFORE INSERT OR UPDATE ON pathways.user_project_assignments FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_project_assignment();
CREATE TRIGGER p2_activity_assignment BEFORE INSERT OR UPDATE ON pathways.project_activity_assignments FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_activity_assignment();
CREATE TRIGGER p2_activity_lifecycle BEFORE INSERT OR UPDATE ON pathways.project_activities FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_activity_lifecycle();
CREATE TRIGGER p2_public_content BEFORE INSERT OR UPDATE ON pathways.projects FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_public_content();
CREATE TRIGGER p2_form BEFORE INSERT OR UPDATE OR DELETE ON pathways.digital_forms FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_form();
CREATE TRIGGER p2_form_field BEFORE INSERT OR UPDATE OR DELETE ON pathways.form_fields FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_form_field();
CREATE TRIGGER p2_mapping BEFORE INSERT OR UPDATE OR DELETE ON pathways.metadata_mappings FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_mapping();
CREATE TRIGGER p2_import_row BEFORE INSERT OR UPDATE OR DELETE ON pathways.data_import_rows FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_import_row();
CREATE TRIGGER p2_batch BEFORE INSERT OR UPDATE ON pathways.data_import_batches FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_batch();
CREATE TRIGGER p2_submission BEFORE INSERT OR UPDATE OR DELETE ON pathways.form_submissions FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_submission();
CREATE TRIGGER p2_response BEFORE INSERT OR UPDATE OR DELETE ON pathways.form_response_values FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_response();
CREATE CONSTRAINT TRIGGER p2_submission_complete AFTER INSERT OR UPDATE ON pathways.form_submissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pathways.p2_assert_submission();
CREATE CONSTRAINT TRIGGER p2_response_complete AFTER INSERT OR UPDATE OR DELETE ON pathways.form_response_values DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pathways.p2_assert_submission();
CREATE CONSTRAINT TRIGGER p2_row_complete AFTER INSERT OR UPDATE ON pathways.data_import_rows DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pathways.p2_assert_processed_row();
CREATE CONSTRAINT TRIGGER p2_batch_complete AFTER INSERT OR UPDATE ON pathways.data_import_batches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pathways.p2_assert_batch();
CREATE CONSTRAINT TRIGGER p2_batch_rows_complete AFTER INSERT OR UPDATE OR DELETE ON pathways.data_import_rows DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pathways.p2_assert_batch();
CREATE TRIGGER p2_stage_order BEFORE INSERT OR UPDATE ON pathways.journey_stages FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_stage_order();
CREATE TRIGGER p2_enrollment_dates BEFORE UPDATE ON pathways.beneficiary_project_enrollments FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_enrollment_dates();
CREATE TRIGGER p2_participation_dates BEFORE INSERT OR UPDATE ON pathways.beneficiary_activity_participations FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_participation_dates();
CREATE TRIGGER p2_journey_dates BEFORE INSERT ON pathways.beneficiary_journey_events FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_participation_dates();
CREATE TRIGGER p2_journey_history BEFORE UPDATE OR DELETE ON pathways.beneficiary_journey_events FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_journey_history();

CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.programs FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.projects FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.user_project_assignments FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.project_activities FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.project_activity_assignments FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.project_milestones FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.project_indicators FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.digital_forms FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.form_fields FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.data_import_batches FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.data_import_rows FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.metadata_mappings FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.form_submissions FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.form_response_values FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.beneficiaries FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.beneficiary_project_enrollments FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.journey_stages FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.activity_journey_stage_mappings FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.beneficiary_activity_participations FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
CREATE TRIGGER p2_identity BEFORE UPDATE ON pathways.beneficiary_journey_events FOR EACH ROW EXECUTE FUNCTION pathways.p2_guard_identity();
REVOKE ALL ON FUNCTION pathways.p2_valid_options(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_project_assignment() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_profile_assignments() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_activity_assignment() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_activity_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_public_content() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_form() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_form_field() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_mapping() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_import_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_batch() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_submission() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_valid_response(pathways.form_fields, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_response() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_assert_submission() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_assert_processed_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_assert_batch() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_stage_order() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_enrollment_dates() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_participation_dates() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p2_guard_journey_history() FROM PUBLIC;

-- Overdue is evaluated by queries: planned_end_date < CURRENT_DATE
-- AND status NOT IN ('COMPLETED','CANCELLED'); there is no stored overdue status.
COMMIT;
