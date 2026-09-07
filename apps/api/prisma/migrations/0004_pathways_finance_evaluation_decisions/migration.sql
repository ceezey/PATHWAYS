-- Phase 3: portable finance, evaluation, and human-reviewed decision records.
-- Prisma supplies tables/enums/FKs/indexes; reviewed SQL below enforces workflow
-- integrity that Prisma 6.19 cannot express. No seed, provider API, or business action.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- CreateEnum
CREATE TYPE "pathways"."review_status" AS ENUM ('PENDING', 'VERIFIED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "pathways"."assessment_type" AS ENUM ('PRE_TEST', 'POST_TEST', 'OUTCOME_SURVEY', 'FEEDBACK_SURVEY', 'OTHER');

-- CreateEnum
CREATE TYPE "pathways"."criterion_type" AS ENUM ('KPI', 'TIMELINE_COMPLIANCE', 'BUDGET_EFFICIENCY', 'BENEFICIARY_REACH', 'OTHER');

-- CreateEnum
CREATE TYPE "pathways"."definition_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "pathways"."evaluation_status" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'SIGNED_OFF', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "pathways"."alert_rule_type" AS ENUM ('UNDERPERFORMING_INDICATOR', 'DELAYED_TIMELINE', 'BUDGET_CONCERN', 'BENEFICIARY_PROGRESS_ISSUE', 'SURVEY_IMPROVEMENT', 'MISSING_FOLLOW_UP', 'WEAK_OUTCOME_INDICATOR', 'COMBINED_CONDITION');

-- CreateEnum
CREATE TYPE "pathways"."rule_match_mode" AS ENUM ('ALL', 'ANY');

-- CreateEnum
CREATE TYPE "pathways"."rule_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "pathways"."rule_metric" AS ENUM ('KPI_ACHIEVEMENT_PERCENT', 'TIMELINE_DELAY_DAYS', 'BUDGET_UTILIZATION_PERCENT', 'BENEFICIARY_PROGRESS_PERCENT', 'SURVEY_IMPROVEMENT_PERCENT', 'MISSING_FOLLOW_UP_COUNT', 'OUTCOME_SCORE', 'REMAINING_BUDGET');

-- CreateEnum
CREATE TYPE "pathways"."rule_operator" AS ENUM ('LT', 'LTE', 'EQ', 'GTE', 'GT', 'BETWEEN');

-- CreateEnum
CREATE TYPE "pathways"."alert_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "pathways"."recommendation_type" AS ENUM ('SUGGESTED_ACTION', 'PRIORITY_FLAG', 'REVIEW_PROMPT', 'FUTURE_PROJECT_SUGGESTION');

-- CreateEnum
CREATE TYPE "pathways"."decision_status" AS ENUM ('NEW', 'REVIEWED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "pathways"."decision_outcome" AS ENUM ('ACCEPT', 'PARTIALLY_ACCEPT', 'DECLINE', 'ESCALATE');

-- CreateEnum
CREATE TYPE "pathways"."recommendation_basis" AS ENUM ('BUDGET', 'KPI', 'SURVEY_IMPROVEMENT', 'TIMELINE', 'BENEFICIARY_PROGRESS', 'COMBINED');

-- CreateEnum
CREATE TYPE "pathways"."evidence_type" AS ENUM ('DOCUMENT', 'PHOTO', 'VIDEO', 'PROGRESS_PROOF', 'COMPLETION_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "pathways"."report_type" AS ENUM ('PROJECT_SUMMARY', 'INDICATOR_SUMMARY', 'BENEFICIARY_SUMMARY', 'SURVEY_FORM_RESULTS', 'EVALUATION_REPORT', 'MONITORING_REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "pathways"."report_format" AS ENUM ('PDF', 'XLSX', 'CSV');

-- CreateEnum
CREATE TYPE "pathways"."report_status" AS ENUM ('DRAFT', 'GENERATED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "pathways"."project_budget_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "activity_id" UUID,
    "category" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "planned_budget" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_budget_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."budget_expense_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "budget_record_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "expense_date" DATE NOT NULL,
    "receipt_evidence_id" UUID,
    "status" "pathways"."review_status" NOT NULL DEFAULT 'PENDING',
    "submitted_by_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "rejected_by_id" UUID,
    "rejected_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_expense_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."assessment_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "activity_id" UUID,
    "enrollment_id" UUID,
    "source_submission_id" UUID,
    "type" "pathways"."assessment_type" NOT NULL,
    "score" DECIMAL(18,4) NOT NULL,
    "maximum_score" DECIMAL(18,4) NOT NULL,
    "assessment_date" DATE NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."project_evaluation_criteria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "type" "pathways"."criterion_type" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight_percentage" DECIMAL(18,4) NOT NULL,
    "maximum_score" DECIMAL(18,4) NOT NULL,
    "status" "pathways"."definition_status" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID NOT NULL,
    "published_by_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_evaluation_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."project_evaluations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "period_label" TEXT,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "overall_score" DECIMAL(18,4),
    "commentary" TEXT,
    "status" "pathways"."evaluation_status" NOT NULL DEFAULT 'DRAFT',
    "evaluated_by_id" UUID NOT NULL,
    "evaluated_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_feedback" TEXT,
    "signed_off_by_id" UUID,
    "signed_off_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."project_evaluation_scores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "criterion_id" UUID NOT NULL,
    "score" DECIMAL(18,4) NOT NULL,
    "maximum_score" DECIMAL(18,4) NOT NULL,
    "weighted_score" DECIMAL(18,4) NOT NULL,
    "criterion_snapshot" JSONB NOT NULL,
    "commentary" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_evaluation_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."alert_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "pathways"."alert_rule_type" NOT NULL,
    "match_mode" "pathways"."rule_match_mode" NOT NULL,
    "severity" "pathways"."alert_severity" NOT NULL DEFAULT 'MEDIUM',
    "status" "pathways"."rule_status" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID NOT NULL,
    "activated_by_id" UUID,
    "activated_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."alert_rule_conditions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "metric" "pathways"."rule_metric" NOT NULL,
    "operator" "pathways"."rule_operator" NOT NULL,
    "threshold" DECIMAL(18,4) NOT NULL,
    "threshold_maximum" DECIMAL(18,4),
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rule_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."alert_rule_recommendations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "pathways"."recommendation_type" NOT NULL DEFAULT 'SUGGESTED_ACTION',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rule_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."rule_based_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "indicator_id" UUID,
    "activity_id" UUID,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "pathways"."alert_severity" NOT NULL,
    "observed_values" JSONB NOT NULL,
    "evaluated_snapshot" JSONB NOT NULL,
    "evaluated_by_id" UUID NOT NULL,
    "evaluated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_based_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."decision_recommendations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "alert_id" UUID,
    "source_rule_recommendation_id" UUID,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "basis" "pathways"."recommendation_basis" NOT NULL,
    "type" "pathways"."recommendation_type" NOT NULL DEFAULT 'SUGGESTED_ACTION',
    "source_snapshot" JSONB,
    "proposed_by_id" UUID NOT NULL,
    "proposed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "pathways"."decision_status" NOT NULL DEFAULT 'NEW',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" TEXT,
    "outcome" "pathways"."decision_outcome",
    "outcome_by_id" UUID,
    "outcome_at" TIMESTAMPTZ(3),
    "outcome_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."evidence_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "activity_id" UUID,
    "enrollment_id" UUID,
    "expense_id" UUID,
    "source_submission_id" UUID,
    "type" "pathways"."evidence_type" NOT NULL DEFAULT 'DOCUMENT',
    "file_name" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "content_type" TEXT NOT NULL,
    "description" TEXT,
    "consent_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "is_identifying" BOOLEAN NOT NULL DEFAULT true,
    "status" "pathways"."review_status" NOT NULL DEFAULT 'PENDING',
    "submitted_by_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "rejected_by_id" UUID,
    "rejected_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "public_visibility_status" "pathways"."public_visibility_status" NOT NULL DEFAULT 'PRIVATE',
    "public_submitted_by_id" UUID,
    "public_submitted_at" TIMESTAMPTZ(3),
    "public_approved_by_id" UUID,
    "public_approved_at" TIMESTAMPTZ(3),
    "published_by_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathways"."reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID,
    "program_id" UUID,
    "form_id" UUID,
    "activity_id" UUID,
    "journey_stage_id" UUID,
    "evaluation_id" UUID,
    "name" TEXT NOT NULL,
    "type" "pathways"."report_type" NOT NULL DEFAULT 'OTHER',
    "format" "pathways"."report_format",
    "status" "pathways"."report_status" NOT NULL DEFAULT 'DRAFT',
    "location" TEXT,
    "report_date" DATE,
    "period_start" DATE,
    "period_end" DATE,
    "aggregate_only" BOOLEAN NOT NULL DEFAULT true,
    "bucket" TEXT,
    "object_key" TEXT,
    "sha256" CHAR(64),
    "created_by_id" UUID NOT NULL,
    "generated_by_id" UUID,
    "generated_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_budget_records_ref_1_idx" ON "pathways"."project_budget_records"("organization_id", "project_id", "activity_id");

-- CreateIndex
CREATE INDEX "project_budget_records_ref_2_idx" ON "pathways"."project_budget_records"("organization_id", "recorded_by_id");

-- CreateIndex
CREATE INDEX "project_budget_records_ref_3_idx" ON "pathways"."project_budget_records"("organization_id", "project_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "project_budget_records_scope_key" ON "pathways"."project_budget_records"("organization_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "budget_expense_entries_ref_1_idx" ON "pathways"."budget_expense_entries"("organization_id", "project_id", "budget_record_id");

-- CreateIndex
CREATE INDEX "budget_expense_entries_ref_2_idx" ON "pathways"."budget_expense_entries"("organization_id", "project_id", "receipt_evidence_id");

-- CreateIndex
CREATE INDEX "budget_expense_entries_ref_3_idx" ON "pathways"."budget_expense_entries"("organization_id", "submitted_by_id");

-- CreateIndex
CREATE INDEX "budget_expense_entries_ref_4_idx" ON "pathways"."budget_expense_entries"("organization_id", "verified_by_id");

-- CreateIndex
CREATE INDEX "budget_expense_entries_ref_5_idx" ON "pathways"."budget_expense_entries"("organization_id", "approved_by_id");

-- CreateIndex
CREATE INDEX "budget_expense_entries_ref_6_idx" ON "pathways"."budget_expense_entries"("organization_id", "rejected_by_id");

-- CreateIndex
CREATE INDEX "budget_expense_entries_ref_7_idx" ON "pathways"."budget_expense_entries"("organization_id", "project_id", "status", "expense_date");

-- CreateIndex
CREATE UNIQUE INDEX "budget_expense_entries_scope_key" ON "pathways"."budget_expense_entries"("organization_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "assessment_results_ref_1_idx" ON "pathways"."assessment_results"("organization_id", "project_id", "activity_id");

-- CreateIndex
CREATE INDEX "assessment_results_ref_2_idx" ON "pathways"."assessment_results"("organization_id", "project_id", "enrollment_id");

-- CreateIndex
CREATE INDEX "assessment_results_ref_3_idx" ON "pathways"."assessment_results"("organization_id", "project_id", "source_submission_id");

-- CreateIndex
CREATE INDEX "assessment_results_ref_4_idx" ON "pathways"."assessment_results"("organization_id", "recorded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_results_scope_key" ON "pathways"."assessment_results"("organization_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "project_evaluation_criteria_ref_1_idx" ON "pathways"."project_evaluation_criteria"("organization_id", "created_by_id");

-- CreateIndex
CREATE INDEX "project_evaluation_criteria_ref_2_idx" ON "pathways"."project_evaluation_criteria"("organization_id", "published_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_evaluation_criteria_scope_key" ON "pathways"."project_evaluation_criteria"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_evaluation_criteria_unique_1" ON "pathways"."project_evaluation_criteria"("organization_id", "project_id", "code", "version");

-- CreateIndex
CREATE INDEX "project_evaluations_ref_1_idx" ON "pathways"."project_evaluations"("organization_id", "evaluated_by_id");

-- CreateIndex
CREATE INDEX "project_evaluations_ref_2_idx" ON "pathways"."project_evaluations"("organization_id", "reviewed_by_id");

-- CreateIndex
CREATE INDEX "project_evaluations_ref_3_idx" ON "pathways"."project_evaluations"("organization_id", "signed_off_by_id");

-- CreateIndex
CREATE INDEX "project_evaluations_ref_4_idx" ON "pathways"."project_evaluations"("organization_id", "project_id", "status", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "project_evaluations_scope_key" ON "pathways"."project_evaluations"("organization_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "project_evaluation_scores_ref_1_idx" ON "pathways"."project_evaluation_scores"("organization_id", "project_id", "evaluation_id");

-- CreateIndex
CREATE INDEX "project_evaluation_scores_ref_2_idx" ON "pathways"."project_evaluation_scores"("organization_id", "project_id", "criterion_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_evaluation_scores_scope_key" ON "pathways"."project_evaluation_scores"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_evaluation_scores_unique_1" ON "pathways"."project_evaluation_scores"("organization_id", "project_id", "evaluation_id", "criterion_id");

-- CreateIndex
CREATE INDEX "alert_rules_ref_1_idx" ON "pathways"."alert_rules"("organization_id", "created_by_id");

-- CreateIndex
CREATE INDEX "alert_rules_ref_2_idx" ON "pathways"."alert_rules"("organization_id", "activated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rules_scope_key" ON "pathways"."alert_rules"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rules_unique_1" ON "pathways"."alert_rules"("organization_id", "code", "version");

-- CreateIndex
CREATE INDEX "alert_rule_conditions_ref_1_idx" ON "pathways"."alert_rule_conditions"("organization_id", "rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rule_conditions_scope_key" ON "pathways"."alert_rule_conditions"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rule_conditions_unique_1" ON "pathways"."alert_rule_conditions"("organization_id", "rule_id", "sequence");

-- CreateIndex
CREATE INDEX "alert_rule_recommendations_ref_1_idx" ON "pathways"."alert_rule_recommendations"("organization_id", "rule_id");

-- CreateIndex
CREATE INDEX "alert_rule_recommendations_ref_2_idx" ON "pathways"."alert_rule_recommendations"("organization_id", "created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rule_recommendations_scope_key" ON "pathways"."alert_rule_recommendations"("organization_id", "id");

-- CreateIndex
CREATE INDEX "rule_based_alerts_ref_1_idx" ON "pathways"."rule_based_alerts"("organization_id", "rule_id");

-- CreateIndex
CREATE INDEX "rule_based_alerts_ref_2_idx" ON "pathways"."rule_based_alerts"("organization_id", "project_id", "indicator_id");

-- CreateIndex
CREATE INDEX "rule_based_alerts_ref_3_idx" ON "pathways"."rule_based_alerts"("organization_id", "project_id", "activity_id");

-- CreateIndex
CREATE INDEX "rule_based_alerts_ref_4_idx" ON "pathways"."rule_based_alerts"("organization_id", "evaluated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "rule_based_alerts_scope_key" ON "pathways"."rule_based_alerts"("organization_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "decision_recommendations_ref_1_idx" ON "pathways"."decision_recommendations"("organization_id", "project_id", "alert_id");

-- CreateIndex
CREATE INDEX "decision_recommendations_ref_2_idx" ON "pathways"."decision_recommendations"("organization_id", "source_rule_recommendation_id");

-- CreateIndex
CREATE INDEX "decision_recommendations_ref_3_idx" ON "pathways"."decision_recommendations"("organization_id", "proposed_by_id");

-- CreateIndex
CREATE INDEX "decision_recommendations_ref_4_idx" ON "pathways"."decision_recommendations"("organization_id", "reviewed_by_id");

-- CreateIndex
CREATE INDEX "decision_recommendations_ref_5_idx" ON "pathways"."decision_recommendations"("organization_id", "outcome_by_id");

-- CreateIndex
CREATE INDEX "decision_recommendations_ref_6_idx" ON "pathways"."decision_recommendations"("organization_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "decision_recommendations_scope_key" ON "pathways"."decision_recommendations"("organization_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "evidence_media_ref_1_idx" ON "pathways"."evidence_media"("organization_id", "project_id", "activity_id");

-- CreateIndex
CREATE INDEX "evidence_media_ref_2_idx" ON "pathways"."evidence_media"("organization_id", "project_id", "enrollment_id");

-- CreateIndex
CREATE INDEX "evidence_media_ref_3_idx" ON "pathways"."evidence_media"("organization_id", "project_id", "expense_id");

-- CreateIndex
CREATE INDEX "evidence_media_ref_4_idx" ON "pathways"."evidence_media"("organization_id", "project_id", "source_submission_id");

-- CreateIndex
CREATE INDEX "evidence_media_ref_5_idx" ON "pathways"."evidence_media"("organization_id", "submitted_by_id");

-- CreateIndex
CREATE INDEX "evidence_media_ref_6_idx" ON "pathways"."evidence_media"("organization_id", "verified_by_id");

-- CreateIndex
CREATE INDEX "evidence_media_ref_7_idx" ON "pathways"."evidence_media"("organization_id", "approved_by_id");

-- CreateIndex
CREATE INDEX "evidence_media_ref_8_idx" ON "pathways"."evidence_media"("organization_id", "rejected_by_id");

-- CreateIndex
CREATE INDEX "evidence_media_ref_9_idx" ON "pathways"."evidence_media"("organization_id", "public_submitted_by_id");

-- CreateIndex
CREATE INDEX "evidence_media_ref_10_idx" ON "pathways"."evidence_media"("organization_id", "public_approved_by_id");

-- CreateIndex
CREATE INDEX "evidence_media_ref_11_idx" ON "pathways"."evidence_media"("organization_id", "published_by_id");

-- CreateIndex
CREATE INDEX "evidence_media_ref_12_idx" ON "pathways"."evidence_media"("organization_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "evidence_media_ref_13_idx" ON "pathways"."evidence_media"("organization_id", "project_id", "public_visibility_status");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_media_scope_key" ON "pathways"."evidence_media"("organization_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_media_unique_1" ON "pathways"."evidence_media"("bucket", "object_key");

-- CreateIndex
CREATE INDEX "reports_ref_1_idx" ON "pathways"."reports"("organization_id", "program_id");

-- CreateIndex
CREATE INDEX "reports_ref_2_idx" ON "pathways"."reports"("organization_id", "project_id", "form_id");

-- CreateIndex
CREATE INDEX "reports_ref_3_idx" ON "pathways"."reports"("organization_id", "project_id", "activity_id");

-- CreateIndex
CREATE INDEX "reports_ref_4_idx" ON "pathways"."reports"("organization_id", "project_id", "journey_stage_id");

-- CreateIndex
CREATE INDEX "reports_ref_5_idx" ON "pathways"."reports"("organization_id", "project_id", "evaluation_id");

-- CreateIndex
CREATE INDEX "reports_ref_6_idx" ON "pathways"."reports"("organization_id", "created_by_id");

-- CreateIndex
CREATE INDEX "reports_ref_7_idx" ON "pathways"."reports"("organization_id", "generated_by_id");

-- CreateIndex
CREATE INDEX "reports_ref_8_idx" ON "pathways"."reports"("organization_id", "project_id", "type", "generated_at");

-- CreateIndex
CREATE UNIQUE INDEX "reports_scope_key" ON "pathways"."reports"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_unique_1" ON "pathways"."reports"("bucket", "object_key");

-- AddForeignKey
ALTER TABLE "pathways"."project_budget_records" ADD CONSTRAINT "project_budget_records_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_budget_records" ADD CONSTRAINT "project_budget_records_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_budget_records" ADD CONSTRAINT "project_budget_records_activity_fkey" FOREIGN KEY ("organization_id", "project_id", "activity_id") REFERENCES "pathways"."project_activities"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_budget_records" ADD CONSTRAINT "project_budget_records_recorded_by_fkey" FOREIGN KEY ("organization_id", "recorded_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."budget_expense_entries" ADD CONSTRAINT "budget_expense_entries_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."budget_expense_entries" ADD CONSTRAINT "budget_expense_entries_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."budget_expense_entries" ADD CONSTRAINT "budget_expense_entries_budget_record_fkey" FOREIGN KEY ("organization_id", "project_id", "budget_record_id") REFERENCES "pathways"."project_budget_records"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."budget_expense_entries" ADD CONSTRAINT "budget_expense_entries_receipt_evidence_fkey" FOREIGN KEY ("organization_id", "project_id", "receipt_evidence_id") REFERENCES "pathways"."evidence_media"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."budget_expense_entries" ADD CONSTRAINT "budget_expense_entries_submitted_by_fkey" FOREIGN KEY ("organization_id", "submitted_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."budget_expense_entries" ADD CONSTRAINT "budget_expense_entries_verified_by_fkey" FOREIGN KEY ("organization_id", "verified_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."budget_expense_entries" ADD CONSTRAINT "budget_expense_entries_approved_by_fkey" FOREIGN KEY ("organization_id", "approved_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."budget_expense_entries" ADD CONSTRAINT "budget_expense_entries_rejected_by_fkey" FOREIGN KEY ("organization_id", "rejected_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."assessment_results" ADD CONSTRAINT "assessment_results_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."assessment_results" ADD CONSTRAINT "assessment_results_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."assessment_results" ADD CONSTRAINT "assessment_results_activity_fkey" FOREIGN KEY ("organization_id", "project_id", "activity_id") REFERENCES "pathways"."project_activities"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."assessment_results" ADD CONSTRAINT "assessment_results_enrollment_fkey" FOREIGN KEY ("organization_id", "project_id", "enrollment_id") REFERENCES "pathways"."beneficiary_project_enrollments"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."assessment_results" ADD CONSTRAINT "assessment_results_source_submission_fkey" FOREIGN KEY ("organization_id", "project_id", "source_submission_id") REFERENCES "pathways"."form_submissions"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."assessment_results" ADD CONSTRAINT "assessment_results_recorded_by_fkey" FOREIGN KEY ("organization_id", "recorded_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_evaluation_criteria" ADD CONSTRAINT "project_evaluation_criteria_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_evaluation_criteria" ADD CONSTRAINT "project_evaluation_criteria_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_evaluation_criteria" ADD CONSTRAINT "project_evaluation_criteria_created_by_fkey" FOREIGN KEY ("organization_id", "created_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_evaluation_criteria" ADD CONSTRAINT "project_evaluation_criteria_published_by_fkey" FOREIGN KEY ("organization_id", "published_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_evaluations" ADD CONSTRAINT "project_evaluations_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_evaluations" ADD CONSTRAINT "project_evaluations_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_evaluations" ADD CONSTRAINT "project_evaluations_evaluated_by_fkey" FOREIGN KEY ("organization_id", "evaluated_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_evaluations" ADD CONSTRAINT "project_evaluations_reviewed_by_fkey" FOREIGN KEY ("organization_id", "reviewed_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_evaluations" ADD CONSTRAINT "project_evaluations_signed_off_by_fkey" FOREIGN KEY ("organization_id", "signed_off_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_evaluation_scores" ADD CONSTRAINT "project_evaluation_scores_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_evaluation_scores" ADD CONSTRAINT "project_evaluation_scores_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_evaluation_scores" ADD CONSTRAINT "project_evaluation_scores_evaluation_fkey" FOREIGN KEY ("organization_id", "project_id", "evaluation_id") REFERENCES "pathways"."project_evaluations"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."project_evaluation_scores" ADD CONSTRAINT "project_evaluation_scores_criterion_fkey" FOREIGN KEY ("organization_id", "project_id", "criterion_id") REFERENCES "pathways"."project_evaluation_criteria"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."alert_rules" ADD CONSTRAINT "alert_rules_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."alert_rules" ADD CONSTRAINT "alert_rules_created_by_fkey" FOREIGN KEY ("organization_id", "created_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."alert_rules" ADD CONSTRAINT "alert_rules_activated_by_fkey" FOREIGN KEY ("organization_id", "activated_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."alert_rule_conditions" ADD CONSTRAINT "alert_rule_conditions_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."alert_rule_conditions" ADD CONSTRAINT "alert_rule_conditions_rule_fkey" FOREIGN KEY ("organization_id", "rule_id") REFERENCES "pathways"."alert_rules"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."alert_rule_recommendations" ADD CONSTRAINT "alert_rule_recommendations_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."alert_rule_recommendations" ADD CONSTRAINT "alert_rule_recommendations_rule_fkey" FOREIGN KEY ("organization_id", "rule_id") REFERENCES "pathways"."alert_rules"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."alert_rule_recommendations" ADD CONSTRAINT "alert_rule_recommendations_created_by_fkey" FOREIGN KEY ("organization_id", "created_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."rule_based_alerts" ADD CONSTRAINT "rule_based_alerts_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."rule_based_alerts" ADD CONSTRAINT "rule_based_alerts_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."rule_based_alerts" ADD CONSTRAINT "rule_based_alerts_rule_fkey" FOREIGN KEY ("organization_id", "rule_id") REFERENCES "pathways"."alert_rules"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."rule_based_alerts" ADD CONSTRAINT "rule_based_alerts_indicator_fkey" FOREIGN KEY ("organization_id", "project_id", "indicator_id") REFERENCES "pathways"."project_indicators"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."rule_based_alerts" ADD CONSTRAINT "rule_based_alerts_activity_fkey" FOREIGN KEY ("organization_id", "project_id", "activity_id") REFERENCES "pathways"."project_activities"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."rule_based_alerts" ADD CONSTRAINT "rule_based_alerts_evaluated_by_fkey" FOREIGN KEY ("organization_id", "evaluated_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."decision_recommendations" ADD CONSTRAINT "decision_recommendations_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."decision_recommendations" ADD CONSTRAINT "decision_recommendations_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."decision_recommendations" ADD CONSTRAINT "decision_recommendations_alert_fkey" FOREIGN KEY ("organization_id", "project_id", "alert_id") REFERENCES "pathways"."rule_based_alerts"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."decision_recommendations" ADD CONSTRAINT "decision_recommendations_source_rule_recommendation_fkey" FOREIGN KEY ("organization_id", "source_rule_recommendation_id") REFERENCES "pathways"."alert_rule_recommendations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."decision_recommendations" ADD CONSTRAINT "decision_recommendations_proposed_by_fkey" FOREIGN KEY ("organization_id", "proposed_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."decision_recommendations" ADD CONSTRAINT "decision_recommendations_reviewed_by_fkey" FOREIGN KEY ("organization_id", "reviewed_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."decision_recommendations" ADD CONSTRAINT "decision_recommendations_outcome_by_fkey" FOREIGN KEY ("organization_id", "outcome_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."evidence_media" ADD CONSTRAINT "evidence_media_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."evidence_media" ADD CONSTRAINT "evidence_media_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."evidence_media" ADD CONSTRAINT "evidence_media_activity_fkey" FOREIGN KEY ("organization_id", "project_id", "activity_id") REFERENCES "pathways"."project_activities"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."evidence_media" ADD CONSTRAINT "evidence_media_enrollment_fkey" FOREIGN KEY ("organization_id", "project_id", "enrollment_id") REFERENCES "pathways"."beneficiary_project_enrollments"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."evidence_media" ADD CONSTRAINT "evidence_media_expense_fkey" FOREIGN KEY ("organization_id", "project_id", "expense_id") REFERENCES "pathways"."budget_expense_entries"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."evidence_media" ADD CONSTRAINT "evidence_media_source_submission_fkey" FOREIGN KEY ("organization_id", "project_id", "source_submission_id") REFERENCES "pathways"."form_submissions"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."evidence_media" ADD CONSTRAINT "evidence_media_submitted_by_fkey" FOREIGN KEY ("organization_id", "submitted_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."evidence_media" ADD CONSTRAINT "evidence_media_verified_by_fkey" FOREIGN KEY ("organization_id", "verified_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."evidence_media" ADD CONSTRAINT "evidence_media_approved_by_fkey" FOREIGN KEY ("organization_id", "approved_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."evidence_media" ADD CONSTRAINT "evidence_media_rejected_by_fkey" FOREIGN KEY ("organization_id", "rejected_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."evidence_media" ADD CONSTRAINT "evidence_media_public_submitted_by_fkey" FOREIGN KEY ("organization_id", "public_submitted_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."evidence_media" ADD CONSTRAINT "evidence_media_public_approved_by_fkey" FOREIGN KEY ("organization_id", "public_approved_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."evidence_media" ADD CONSTRAINT "evidence_media_published_by_fkey" FOREIGN KEY ("organization_id", "published_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."reports" ADD CONSTRAINT "reports_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "pathways"."organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."reports" ADD CONSTRAINT "reports_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "pathways"."projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."reports" ADD CONSTRAINT "reports_program_fkey" FOREIGN KEY ("organization_id", "program_id") REFERENCES "pathways"."programs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."reports" ADD CONSTRAINT "reports_form_fkey" FOREIGN KEY ("organization_id", "project_id", "form_id") REFERENCES "pathways"."digital_forms"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."reports" ADD CONSTRAINT "reports_activity_fkey" FOREIGN KEY ("organization_id", "project_id", "activity_id") REFERENCES "pathways"."project_activities"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."reports" ADD CONSTRAINT "reports_journey_stage_fkey" FOREIGN KEY ("organization_id", "project_id", "journey_stage_id") REFERENCES "pathways"."journey_stages"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."reports" ADD CONSTRAINT "reports_evaluation_fkey" FOREIGN KEY ("organization_id", "project_id", "evaluation_id") REFERENCES "pathways"."project_evaluations"("organization_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."reports" ADD CONSTRAINT "reports_created_by_fkey" FOREIGN KEY ("organization_id", "created_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pathways"."reports" ADD CONSTRAINT "reports_generated_by_fkey" FOREIGN KEY ("organization_id", "generated_by_id") REFERENCES "pathways"."system_users"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Reviewed PostgreSQL invariants follow.

CREATE FUNCTION pathways.p3_private_key(bucket text, object_key text, org uuid, project uuid, kind text, entity uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
 SELECT bucket = 'pathways-private'
 AND kind IN ('evidence','reports')
 AND object_key LIKE 'organizations/' || org::text || '/projects/' || coalesce(project::text,'organization') || '/' || kind || '/' || entity::text || '/%'
 AND length(object_key) <= 500
 AND split_part(object_key,'/',7) ~ '^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9]{1,10})?$'
 AND array_length(string_to_array(object_key,'/'),1) = 7
$$;

CREATE FUNCTION pathways.p3_guard_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id
 OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
 OR (to_jsonb(NEW)->'project_id') IS DISTINCT FROM (to_jsonb(OLD)->'project_id')
 OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Phase 3 identity, organization, project, and creation time are immutable';
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION pathways.p3_reject_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
 RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Preserve Phase 3 history; deletion is not permitted';
END $$;

-- Actor identity is scoped by composite FK. Active profile checks apply when an
-- actor is recorded, never by trusting caller-supplied JWT metadata. API role/
-- permission/assignment authorization remains the explicitly deferred Phase 5.
CREATE FUNCTION pathways.p3_guard_actors()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE field text; value uuid;
BEGIN
 FOREACH field IN ARRAY TG_ARGV LOOP
  IF TG_OP='INSERT' OR (to_jsonb(NEW)->field) IS DISTINCT FROM (to_jsonb(OLD)->field) THEN
   value := (to_jsonb(NEW)->>field)::uuid;
   IF value IS NOT NULL THEN
    PERFORM 1 FROM pathways.system_users
     WHERE id=value AND organization_id=NEW.organization_id AND account_status='ACTIVE' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Workflow actor must be an active profile in the same organization'; END IF;
   END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;

ALTER TABLE pathways.project_budget_records ADD CONSTRAINT p3_budget_values CHECK (
 length(btrim(category))>0 AND currency ~ '^[A-Z]{3}$'
 AND planned_budget >= 0 AND planned_budget <> 'NaN'::numeric
 AND (archived_at IS NULL OR archived_at >= recorded_at)
);
ALTER TABLE pathways.budget_expense_entries ADD CONSTRAINT p3_expense_values CHECK (
 length(btrim(description))>0 AND amount>0 AND amount<>'NaN'::numeric
);
ALTER TABLE pathways.assessment_results ADD CONSTRAINT p3_assessment_values CHECK (
 maximum_score>0 AND maximum_score<>'NaN'::numeric AND score BETWEEN 0 AND maximum_score
);
ALTER TABLE pathways.project_evaluation_criteria ADD CONSTRAINT p3_criterion_values CHECK (
 version>0 AND length(btrim(code))>0 AND length(btrim(name))>0
 AND weight_percentage>0 AND weight_percentage<=100
 AND maximum_score>0 AND maximum_score<>'NaN'::numeric
 AND ((status='DRAFT' AND published_by_id IS NULL AND published_at IS NULL AND archived_at IS NULL)
 OR (status='PUBLISHED' AND published_by_id IS NOT NULL AND published_at IS NOT NULL AND archived_at IS NULL)
 OR (status='ARCHIVED' AND published_by_id IS NOT NULL AND published_at IS NOT NULL AND archived_at>=published_at))
);
ALTER TABLE pathways.project_evaluations ADD CONSTRAINT p3_evaluation_values CHECK (
 length(btrim(title))>0 AND period_end>=period_start
 AND (overall_score IS NULL OR overall_score BETWEEN 0 AND 100)
 AND ((status='DRAFT' AND evaluated_at IS NULL AND overall_score IS NULL AND reviewed_by_id IS NULL AND reviewed_at IS NULL AND review_feedback IS NULL AND signed_off_by_id IS NULL AND signed_off_at IS NULL AND archived_at IS NULL)
 OR (status='SUBMITTED' AND evaluated_at IS NOT NULL AND overall_score IS NOT NULL AND reviewed_by_id IS NULL AND reviewed_at IS NULL AND review_feedback IS NULL AND signed_off_by_id IS NULL AND signed_off_at IS NULL AND archived_at IS NULL)
 OR (status='REVIEWED' AND evaluated_at IS NOT NULL AND overall_score IS NOT NULL AND reviewed_by_id IS NOT NULL AND reviewed_at>=evaluated_at AND length(btrim(review_feedback))>0 AND signed_off_by_id IS NULL AND signed_off_at IS NULL AND archived_at IS NULL)
 OR (status IN ('SIGNED_OFF','ARCHIVED') AND evaluated_at IS NOT NULL AND overall_score IS NOT NULL AND reviewed_by_id IS NOT NULL AND reviewed_at>=evaluated_at AND length(btrim(review_feedback))>0 AND signed_off_by_id IS NOT NULL AND signed_off_at>=reviewed_at AND ((status='SIGNED_OFF' AND archived_at IS NULL) OR (status='ARCHIVED' AND archived_at>=signed_off_at))))
 AND (reviewed_by_id IS NULL OR reviewed_by_id<>evaluated_by_id)
 AND (signed_off_by_id IS NULL OR (signed_off_by_id<>evaluated_by_id AND signed_off_by_id<>reviewed_by_id))
);
ALTER TABLE pathways.project_evaluation_scores ADD CONSTRAINT p3_score_values CHECK (
 maximum_score>0 AND maximum_score<>'NaN'::numeric AND score BETWEEN 0 AND maximum_score
 AND weighted_score BETWEEN 0 AND 100 AND jsonb_typeof(criterion_snapshot)='object'
);
ALTER TABLE pathways.alert_rules ADD CONSTRAINT p3_rule_values CHECK (
 version>0 AND length(btrim(code))>0 AND length(btrim(name))>0
 AND ((status='DRAFT' AND activated_by_id IS NULL AND activated_at IS NULL AND archived_at IS NULL)
 OR (status='ACTIVE' AND activated_by_id IS NOT NULL AND activated_at IS NOT NULL AND archived_at IS NULL)
 OR (status='ARCHIVED' AND activated_by_id IS NOT NULL AND activated_at IS NOT NULL AND archived_at>=activated_at))
);
ALTER TABLE pathways.alert_rule_conditions ADD CONSTRAINT p3_condition_values CHECK (
 sequence>0 AND threshold<>'NaN'::numeric
 AND ((operator='BETWEEN' AND threshold_maximum IS NOT NULL AND threshold_maximum>=threshold AND threshold_maximum<>'NaN'::numeric)
 OR (operator<>'BETWEEN' AND threshold_maximum IS NULL))
);
ALTER TABLE pathways.alert_rule_recommendations ADD CONSTRAINT p3_rule_recommendation_values CHECK (
 length(btrim(title))>0 AND length(btrim(text))>0
);
ALTER TABLE pathways.rule_based_alerts ADD CONSTRAINT p3_alert_values CHECK (
 length(btrim(title))>0 AND length(btrim(message))>0
 AND jsonb_typeof(observed_values)='object' AND jsonb_typeof(evaluated_snapshot)='object'
);
ALTER TABLE pathways.decision_recommendations ADD CONSTRAINT p3_decision_values CHECK (
 length(btrim(title))>0 AND length(btrim(text))>0
 AND ((source_rule_recommendation_id IS NULL AND source_snapshot IS NULL)
 OR (source_rule_recommendation_id IS NOT NULL AND alert_id IS NOT NULL AND jsonb_typeof(source_snapshot)='object'))
 AND ((status='NEW' AND reviewed_by_id IS NULL AND reviewed_at IS NULL AND review_note IS NULL AND outcome IS NULL AND outcome_by_id IS NULL AND outcome_at IS NULL AND outcome_note IS NULL)
 OR (status='REVIEWED' AND reviewed_by_id IS NOT NULL AND reviewed_at>=proposed_at AND review_note IS NOT NULL AND length(btrim(review_note))>0 AND outcome IS NULL AND outcome_by_id IS NULL AND outcome_at IS NULL AND outcome_note IS NULL)
 OR (status IN ('RESOLVED','DISMISSED') AND reviewed_by_id IS NOT NULL AND reviewed_at>=proposed_at AND review_note IS NOT NULL AND length(btrim(review_note))>0 AND outcome IS NOT NULL AND outcome_by_id IS NOT NULL AND outcome_at>=reviewed_at AND outcome_note IS NOT NULL AND length(btrim(outcome_note))>0))
 AND (reviewed_by_id IS NULL OR reviewed_by_id<>proposed_by_id)
 AND (outcome_by_id IS NULL OR outcome_by_id<>proposed_by_id)
 AND (status<>'DISMISSED' OR outcome='DECLINE')
 AND (status<>'RESOLVED' OR outcome<>'DECLINE')
);
ALTER TABLE pathways.evidence_media ADD CONSTRAINT p3_evidence_file CHECK (
 pathways.p3_private_key(bucket,object_key,organization_id,project_id,'evidence',id)
 AND sha256 ~ '^[0-9a-f]{64}$' AND byte_size>0
 AND length(btrim(file_name))>0 AND content_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'
);
ALTER TABLE pathways.evidence_media ADD CONSTRAINT p3_evidence_public CHECK (
 (public_visibility_status='PRIVATE' AND public_submitted_by_id IS NULL AND public_submitted_at IS NULL AND public_approved_by_id IS NULL AND public_approved_at IS NULL AND published_by_id IS NULL AND published_at IS NULL)
 OR (status='APPROVED' AND consent_confirmed AND NOT is_identifying AND enrollment_id IS NULL
 AND public_submitted_by_id IS NOT NULL AND public_submitted_at>=approved_at
 AND ((public_visibility_status='FOR_REVIEW' AND public_approved_by_id IS NULL AND public_approved_at IS NULL AND published_by_id IS NULL AND published_at IS NULL)
 OR (public_visibility_status='APPROVED' AND public_approved_by_id IS NOT NULL AND public_approved_by_id<>public_submitted_by_id AND public_approved_by_id<>submitted_by_id AND public_approved_at>=public_submitted_at AND published_by_id IS NULL AND published_at IS NULL)
 OR (public_visibility_status='PUBLISHED' AND public_approved_by_id IS NOT NULL AND public_approved_by_id<>public_submitted_by_id AND public_approved_by_id<>submitted_by_id AND public_approved_at>=public_submitted_at AND published_by_id IS NOT NULL AND published_by_id<>public_approved_by_id AND published_by_id<>public_submitted_by_id AND published_at>=public_approved_at)))
);
ALTER TABLE pathways.reports ADD CONSTRAINT p3_report_values CHECK (
 length(btrim(name))>0
 AND (program_id IS NULL OR project_id IS NULL)
 AND (project_id IS NOT NULL OR (form_id IS NULL AND activity_id IS NULL AND journey_stage_id IS NULL AND evaluation_id IS NULL))
 AND ((period_start IS NULL AND period_end IS NULL) OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_end>=period_start))
 AND ((status='DRAFT' AND bucket IS NULL AND object_key IS NULL AND sha256 IS NULL AND generated_by_id IS NULL AND generated_at IS NULL AND archived_at IS NULL)
 OR (status IN ('GENERATED','ARCHIVED') AND format IS NOT NULL AND bucket IS NOT NULL AND object_key IS NOT NULL AND sha256 IS NOT NULL
 AND pathways.p3_private_key(bucket,object_key,organization_id,project_id,'reports',id)
 AND sha256 ~ '^[0-9a-f]{64}$' AND generated_by_id IS NOT NULL AND generated_at IS NOT NULL
 AND ((status='GENERATED' AND archived_at IS NULL) OR (status='ARCHIVED' AND archived_at>=generated_at))))
);

-- Distinct submission, verification, approval and rejection identity/time.

ALTER TABLE pathways.budget_expense_entries ADD CONSTRAINT p3_expense_review CHECK (
 (verified_by_id IS NULL)=(verified_at IS NULL)
 AND (approved_by_id IS NULL)=(approved_at IS NULL)
 AND (rejected_by_id IS NULL)=(rejected_at IS NULL)
 AND (verified_by_id IS NULL OR (verified_by_id<>submitted_by_id AND verified_at>=submitted_at))
 AND (approved_by_id IS NULL OR (approved_by_id<>submitted_by_id AND approved_by_id<>verified_by_id AND approved_at>=verified_at))
 AND (rejected_by_id IS NULL OR (rejected_by_id<>submitted_by_id AND rejected_at>=coalesce(verified_at,submitted_at)))
 AND ((status='PENDING' AND verified_by_id IS NULL AND approved_by_id IS NULL AND rejected_by_id IS NULL AND rejection_reason IS NULL)
 OR (status='VERIFIED' AND verified_by_id IS NOT NULL AND approved_by_id IS NULL AND rejected_by_id IS NULL AND rejection_reason IS NULL)
 OR (status='APPROVED' AND verified_by_id IS NOT NULL AND approved_by_id IS NOT NULL AND rejected_by_id IS NULL AND rejection_reason IS NULL)
 OR (status='REJECTED' AND approved_by_id IS NULL AND rejected_by_id IS NOT NULL AND rejection_reason IS NOT NULL AND length(btrim(rejection_reason))>0))
);

ALTER TABLE pathways.evidence_media ADD CONSTRAINT p3_evidence_review CHECK (
 (verified_by_id IS NULL)=(verified_at IS NULL)
 AND (approved_by_id IS NULL)=(approved_at IS NULL)
 AND (rejected_by_id IS NULL)=(rejected_at IS NULL)
 AND (verified_by_id IS NULL OR (verified_by_id<>submitted_by_id AND verified_at>=submitted_at))
 AND (approved_by_id IS NULL OR (approved_by_id<>submitted_by_id AND approved_by_id<>verified_by_id AND approved_at>=verified_at))
 AND (rejected_by_id IS NULL OR (rejected_by_id<>submitted_by_id AND rejected_at>=coalesce(verified_at,submitted_at)))
 AND ((status='PENDING' AND verified_by_id IS NULL AND approved_by_id IS NULL AND rejected_by_id IS NULL AND rejection_reason IS NULL)
 OR (status='VERIFIED' AND verified_by_id IS NOT NULL AND approved_by_id IS NULL AND rejected_by_id IS NULL AND rejection_reason IS NULL)
 OR (status='APPROVED' AND verified_by_id IS NOT NULL AND approved_by_id IS NOT NULL AND rejected_by_id IS NULL AND rejection_reason IS NULL)
 OR (status='REJECTED' AND approved_by_id IS NULL AND rejected_by_id IS NOT NULL AND rejection_reason IS NOT NULL AND length(btrim(rejection_reason))>0))
);

ALTER TABLE pathways.project_budget_records ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.project_budget_records FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();
CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.project_budget_records FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('recorded_by_id');
CREATE TRIGGER p3_no_delete BEFORE DELETE ON pathways.project_budget_records FOR EACH ROW EXECUTE FUNCTION pathways.p3_reject_delete();

ALTER TABLE pathways.budget_expense_entries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.budget_expense_entries FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();
CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.budget_expense_entries FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('submitted_by_id','verified_by_id','approved_by_id','rejected_by_id');
CREATE TRIGGER p3_no_delete BEFORE DELETE ON pathways.budget_expense_entries FOR EACH ROW EXECUTE FUNCTION pathways.p3_reject_delete();

ALTER TABLE pathways.assessment_results ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.assessment_results FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();
CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.assessment_results FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('recorded_by_id');
CREATE TRIGGER p3_no_delete BEFORE DELETE ON pathways.assessment_results FOR EACH ROW EXECUTE FUNCTION pathways.p3_reject_delete();

ALTER TABLE pathways.project_evaluation_criteria ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.project_evaluation_criteria FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();
CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.project_evaluation_criteria FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('created_by_id','published_by_id');

ALTER TABLE pathways.project_evaluations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.project_evaluations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();
CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.project_evaluations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('evaluated_by_id','reviewed_by_id','signed_off_by_id');

ALTER TABLE pathways.project_evaluation_scores ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.project_evaluation_scores FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

ALTER TABLE pathways.alert_rules ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.alert_rules FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();
CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.alert_rules FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('created_by_id','activated_by_id');

ALTER TABLE pathways.alert_rule_conditions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.alert_rule_conditions FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();

ALTER TABLE pathways.alert_rule_recommendations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.alert_rule_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();
CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.alert_rule_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('created_by_id');

ALTER TABLE pathways.rule_based_alerts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.rule_based_alerts FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();
CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.rule_based_alerts FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('evaluated_by_id');
CREATE TRIGGER p3_no_delete BEFORE DELETE ON pathways.rule_based_alerts FOR EACH ROW EXECUTE FUNCTION pathways.p3_reject_delete();

ALTER TABLE pathways.decision_recommendations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.decision_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();
CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.decision_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('proposed_by_id','reviewed_by_id','outcome_by_id');
CREATE TRIGGER p3_no_delete BEFORE DELETE ON pathways.decision_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_reject_delete();

ALTER TABLE pathways.evidence_media ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.evidence_media FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();
CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.evidence_media FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('submitted_by_id','verified_by_id','approved_by_id','rejected_by_id','public_submitted_by_id','public_approved_by_id','published_by_id');
CREATE TRIGGER p3_no_delete BEFORE DELETE ON pathways.evidence_media FOR EACH ROW EXECUTE FUNCTION pathways.p3_reject_delete();

ALTER TABLE pathways.reports ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER p3_00_identity BEFORE UPDATE ON pathways.reports FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_identity();
CREATE TRIGGER p3_10_actors BEFORE INSERT OR UPDATE ON pathways.reports FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_actors('created_by_id','generated_by_id');

CREATE FUNCTION pathways.p3_guard_review()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE allowed text[] := ARRAY['updated_at','status','verified_by_id','verified_at','approved_by_id','approved_at','rejected_by_id','rejected_at','rejection_reason']; proof pathways.evidence_media;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Review records must begin PENDING'; END IF;
 ELSE
  IF TG_TABLE_NAME='evidence_media' THEN
   allowed:=allowed||ARRAY['public_visibility_status','public_submitted_by_id','public_submitted_at','public_approved_by_id','public_approved_at','published_by_id','published_at'];
  ELSIF OLD.status='PENDING' THEN allowed:=allowed||ARRAY['receipt_evidence_id']; END IF;
  IF (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Submitted financial/evidence provenance is immutable';
  END IF;
  IF NEW.status=OLD.status THEN
   IF (to_jsonb(NEW)-ARRAY['updated_at','receipt_evidence_id','public_visibility_status','public_submitted_by_id','public_submitted_at','public_approved_by_id','public_approved_at','published_by_id','published_at'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','receipt_evidence_id','public_visibility_status','public_submitted_by_id','public_submitted_at','public_approved_by_id','public_approved_at','published_by_id','published_at']) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Review actor history cannot be rewritten';
   END IF;
  ELSE
   IF NOT ((OLD.status='PENDING' AND NEW.status IN ('VERIFIED','REJECTED')) OR (OLD.status='VERIFIED' AND NEW.status IN ('APPROVED','REJECTED'))) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid review transition';
   END IF;
   IF OLD.status='VERIFIED' AND (NEW.verified_by_id IS DISTINCT FROM OLD.verified_by_id OR NEW.verified_at IS DISTINCT FROM OLD.verified_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Verification history is immutable';
   END IF;
   IF OLD.status='PENDING' AND NEW.status='REJECTED' AND NEW.verified_by_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Cannot manufacture earlier verification';
   END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='budget_expense_entries' THEN
  PERFORM 1 FROM pathways.project_budget_records WHERE id=NEW.budget_record_id AND archived_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Expense requires a nonarchived budget'; END IF;
  IF NEW.receipt_evidence_id IS NOT NULL THEN
   SELECT * INTO proof FROM pathways.evidence_media WHERE id=NEW.receipt_evidence_id FOR SHARE;
   IF NOT FOUND OR proof.organization_id<>NEW.organization_id OR proof.project_id<>NEW.project_id OR proof.expense_id IS DISTINCT FROM NEW.id
    OR proof.submitted_by_id<>NEW.submitted_by_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Receipt must belong to this expense, scope and submitter';
   END IF;
  END IF;
  IF NEW.status IN ('VERIFIED','APPROVED') AND (NEW.receipt_evidence_id IS NULL OR proof.status NOT IN ('VERIFIED','APPROVED')) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Verified private receipt evidence is required';
  END IF;
 ELSIF NEW.status='REJECTED' AND EXISTS(SELECT FROM pathways.budget_expense_entries WHERE receipt_evidence_id=NEW.id AND status IN ('VERIFIED','APPROVED')) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Receipt supporting verified financial history cannot be rejected';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER p3_20_review BEFORE INSERT OR UPDATE ON pathways.budget_expense_entries FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_review();
CREATE TRIGGER p3_20_review BEFORE INSERT OR UPDATE ON pathways.evidence_media FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_review();

CREATE FUNCTION pathways.p3_guard_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
 IF OLD.archived_at IS NOT NULL OR (to_jsonb(NEW)-ARRAY['updated_at','archived_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','archived_at']) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Budget provenance is immutable; archive and record a new budget';
 END IF;
 IF NEW.archived_at IS NOT NULL AND EXISTS(SELECT FROM pathways.budget_expense_entries WHERE budget_record_id=OLD.id AND status IN ('PENDING','VERIFIED')) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Resolve open expense reviews before archiving the budget';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER p3_20_budget BEFORE UPDATE ON pathways.project_budget_records FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_budget();

-- Actual spending is derived from approved expense history, never a competing
-- editable aggregate. This read-only function performs no financial action.
CREATE FUNCTION pathways.p3_budget_totals(budget_id uuid)
RETURNS TABLE(planned_budget numeric,actual_spending numeric,remaining_budget numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
 SELECT b.planned_budget,coalesce(sum(e.amount),0),b.planned_budget-coalesce(sum(e.amount),0)
 FROM pathways.project_budget_records b LEFT JOIN pathways.budget_expense_entries e
 ON e.budget_record_id=b.id AND e.status='APPROVED'
 WHERE b.id=budget_id GROUP BY b.id
$$;

CREATE FUNCTION pathways.p3_guard_source()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE submission pathways.form_submissions; form pathways.digital_forms; expense pathways.budget_expense_entries; budget pathways.project_budget_records;
BEGIN
 IF TG_TABLE_NAME='assessment_results' AND TG_OP='UPDATE' THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recorded assessment provenance is immutable';
 END IF;
 IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
 IF NEW.source_submission_id IS NOT NULL THEN
  SELECT * INTO submission FROM pathways.form_submissions WHERE id=NEW.source_submission_id FOR SHARE;
  IF NOT FOUND OR submission.organization_id<>NEW.organization_id OR submission.project_id<>NEW.project_id
   OR submission.status NOT IN ('VALIDATED','PROCESSED') OR submission.is_dummy_record
   OR submission.enrollment_id IS DISTINCT FROM NEW.enrollment_id THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Source must be a validated nondummy submission for this scope and enrollment';
  END IF;
  SELECT * INTO form FROM pathways.digital_forms WHERE id=submission.form_id FOR SHARE;
  IF form.activity_id IS DISTINCT FROM NEW.activity_id THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Assessment/evidence activity must agree with its source form';
  END IF;
 END IF;
 IF TG_TABLE_NAME='evidence_media' THEN
 IF NEW.expense_id IS NOT NULL THEN
  SELECT * INTO expense FROM pathways.budget_expense_entries WHERE id=NEW.expense_id FOR SHARE;
  SELECT * INTO budget FROM pathways.project_budget_records WHERE id=expense.budget_record_id FOR SHARE;
  IF expense.id IS NULL OR expense.organization_id<>NEW.organization_id OR expense.project_id<>NEW.project_id OR expense.submitted_by_id<>NEW.submitted_by_id
   OR budget.activity_id IS DISTINCT FROM NEW.activity_id THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Expense evidence must agree with its expense and budget provenance';
  END IF;
 END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER p3_30_source BEFORE INSERT OR UPDATE ON pathways.assessment_results FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_source();
CREATE TRIGGER p3_30_source BEFORE INSERT OR UPDATE ON pathways.evidence_media FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_source();

CREATE FUNCTION pathways.p3_guard_public_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.public_visibility_status<>'PRIVATE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evidence must start PRIVATE'; END IF;
 ELSE
  IF NEW.public_visibility_status=OLD.public_visibility_status THEN
   IF ROW(NEW.public_submitted_by_id,NEW.public_submitted_at,NEW.public_approved_by_id,NEW.public_approved_at,NEW.published_by_id,NEW.published_at)
    IS DISTINCT FROM ROW(OLD.public_submitted_by_id,OLD.public_submitted_at,OLD.public_approved_by_id,OLD.public_approved_at,OLD.published_by_id,OLD.published_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Public workflow history cannot be rewritten';
   END IF;
  ELSE
   IF NOT ((OLD.public_visibility_status='PRIVATE' AND NEW.public_visibility_status='FOR_REVIEW')
    OR (OLD.public_visibility_status='FOR_REVIEW' AND NEW.public_visibility_status='APPROVED')
    OR (OLD.public_visibility_status='APPROVED' AND NEW.public_visibility_status='PUBLISHED')) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Public review, approval, and publication are separate transitions';
   END IF;
   IF OLD.public_visibility_status<>'PRIVATE' AND ROW(NEW.public_submitted_by_id,NEW.public_submitted_at) IS DISTINCT FROM ROW(OLD.public_submitted_by_id,OLD.public_submitted_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Public submission history is immutable';
   END IF;
   IF OLD.public_visibility_status='APPROVED' AND ROW(NEW.public_approved_by_id,NEW.public_approved_at) IS DISTINCT FROM ROW(OLD.public_approved_by_id,OLD.public_approved_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Public approval history is immutable';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER p3_40_public BEFORE INSERT OR UPDATE ON pathways.evidence_media FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_public_evidence();

CREATE FUNCTION pathways.p3_guard_criterion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Criterion version must begin DRAFT'; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Published criterion history cannot be deleted'; END IF;
  RETURN OLD;
 ELSE
  IF OLD.status<>'DRAFT' AND NOT (OLD.status='PUBLISHED' AND NEW.status='ARCHIVED'
   AND (to_jsonb(NEW)-ARRAY['status','archived_at','updated_at'])=(to_jsonb(OLD)-ARRAY['status','archived_at','updated_at'])) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Published criterion version is immutable';
  END IF;
  IF OLD.status='DRAFT' AND NEW.status NOT IN ('DRAFT','PUBLISHED') THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid criterion lifecycle';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER p3_20_criterion BEFORE INSERT OR UPDATE OR DELETE ON pathways.project_evaluation_criteria FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_criterion();

CREATE FUNCTION pathways.p3_guard_score()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE evaluation pathways.project_evaluations; criterion pathways.project_evaluation_criteria; evaluation_id uuid;
BEGIN
 evaluation_id:=CASE WHEN TG_OP='DELETE' THEN OLD.evaluation_id ELSE NEW.evaluation_id END;
 SELECT * INTO evaluation FROM pathways.project_evaluations WHERE id=evaluation_id FOR UPDATE;
 IF NOT FOUND OR evaluation.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Scores may change only while their evaluation is DRAFT'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.evaluation_id,NEW.criterion_id) IS DISTINCT FROM ROW(OLD.evaluation_id,OLD.criterion_id) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Score ownership and criterion version are immutable';
 END IF;
 SELECT * INTO criterion FROM pathways.project_evaluation_criteria WHERE id=NEW.criterion_id FOR SHARE;
 IF NOT FOUND OR criterion.status<>'PUBLISHED' OR criterion.organization_id<>NEW.organization_id OR criterion.project_id<>NEW.project_id THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Score requires a published criterion in the same project';
 END IF;
 IF evaluation.organization_id<>NEW.organization_id OR evaluation.project_id<>NEW.project_id THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Cross-scope evaluation score rejected';
 END IF;
 NEW.maximum_score:=criterion.maximum_score;
 NEW.weighted_score:=round(NEW.score/criterion.maximum_score*criterion.weight_percentage,4);
 NEW.criterion_snapshot:=jsonb_build_object('id',criterion.id,'code',criterion.code,'version',criterion.version,'type',criterion.type,'name',criterion.name,'description',criterion.description,'weight_percentage',criterion.weight_percentage,'maximum_score',criterion.maximum_score);
 RETURN NEW;
END $$;
CREATE TRIGGER p3_20_score BEFORE INSERT OR UPDATE OR DELETE ON pathways.project_evaluation_scores FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_score();

CREATE FUNCTION pathways.p3_guard_evaluation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE weights numeric; result numeric; count_scores bigint;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation must begin DRAFT'; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Submitted evaluation cannot be deleted'; END IF;
  RETURN OLD;
 ELSE
  IF OLD.status='DRAFT' THEN
   IF NEW.status NOT IN ('DRAFT','SUBMITTED') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation must be submitted before review'; END IF;
   IF NEW.status='SUBMITTED' THEN
    SELECT sum((criterion_snapshot->>'weight_percentage')::numeric),sum(weighted_score),count(*)
     INTO weights,result,count_scores FROM pathways.project_evaluation_scores WHERE evaluation_id=NEW.id;
    IF count_scores=0 OR weights<>100 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation submission requires criteria weights totaling 100'; END IF;
    NEW.overall_score:=round(result,4);
   END IF;
  ELSE
   IF NOT ((OLD.status='SUBMITTED' AND NEW.status='REVIEWED')
    OR (OLD.status='REVIEWED' AND NEW.status='SIGNED_OFF')
    OR (OLD.status='SIGNED_OFF' AND NEW.status='ARCHIVED')) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Submitted evaluation content is immutable';
   END IF;
   IF (to_jsonb(NEW)-ARRAY['updated_at','status','reviewed_by_id','reviewed_at','review_feedback','signed_off_by_id','signed_off_at','archived_at'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','status','reviewed_by_id','reviewed_at','review_feedback','signed_off_by_id','signed_off_at','archived_at']) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation snapshot and evaluator history are immutable';
   END IF;
   IF OLD.status IN ('REVIEWED','SIGNED_OFF') AND ROW(NEW.reviewed_by_id,NEW.reviewed_at,NEW.review_feedback) IS DISTINCT FROM ROW(OLD.reviewed_by_id,OLD.reviewed_at,OLD.review_feedback) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation review history is immutable';
   END IF;
   IF OLD.status='SIGNED_OFF' AND ROW(NEW.signed_off_by_id,NEW.signed_off_at) IS DISTINCT FROM ROW(OLD.signed_off_by_id,OLD.signed_off_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Signoff history is immutable';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER p3_20_evaluation BEFORE INSERT OR UPDATE OR DELETE ON pathways.project_evaluations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_evaluation();

CREATE FUNCTION pathways.p3_guard_rule()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Rule version must begin DRAFT'; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Activated rule history cannot be deleted'; END IF;
  RETURN OLD;
 ELSE
  IF OLD.status='DRAFT' THEN
   IF NEW.status NOT IN ('DRAFT','ACTIVE') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid rule lifecycle'; END IF;
   IF NEW.status='ACTIVE' AND (
    NOT EXISTS(SELECT FROM pathways.alert_rule_conditions WHERE rule_id=NEW.id)
    OR NOT EXISTS(SELECT FROM pathways.alert_rule_recommendations WHERE rule_id=NEW.id)) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Activation requires conditions and a human-review recommendation template';
   END IF;
  ELSIF NOT (OLD.status='ACTIVE' AND NEW.status='ARCHIVED'
   AND (to_jsonb(NEW)-ARRAY['updated_at','status','archived_at'])=(to_jsonb(OLD)-ARRAY['updated_at','status','archived_at'])) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Activated rule version is immutable; create a new version';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER p3_20_rule BEFORE INSERT OR UPDATE OR DELETE ON pathways.alert_rules FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_rule();

CREATE FUNCTION pathways.p3_guard_rule_child()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE parent pathways.alert_rules; rule_id uuid;
BEGIN
 rule_id:=CASE WHEN TG_OP='DELETE' THEN OLD.rule_id ELSE NEW.rule_id END;
 SELECT * INTO parent FROM pathways.alert_rules WHERE id=rule_id FOR UPDATE;
 IF NOT FOUND OR parent.status<>'DRAFT' THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Conditions and recommendation templates are immutable after activation';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF parent.organization_id<>NEW.organization_id THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Rule child organization mismatch'; END IF;
 IF TG_OP='UPDATE' AND NEW.rule_id<>OLD.rule_id THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Rule child cannot be reassigned'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER p3_20_rule_child BEFORE INSERT OR UPDATE OR DELETE ON pathways.alert_rule_conditions FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_rule_child();
CREATE TRIGGER p3_20_rule_child BEFORE INSERT OR UPDATE OR DELETE ON pathways.alert_rule_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_rule_child();

-- Pure deterministic numeric comparison: missing inputs never match. No SQL
-- expressions, scripts, business actions, or user-selected table/column names.
CREATE FUNCTION pathways.p3_condition_matches(op pathways.rule_operator, value numeric, minimum numeric, maximum numeric)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
 SELECT coalesce(CASE op
 WHEN 'LT' THEN value<minimum WHEN 'LTE' THEN value<=minimum
 WHEN 'EQ' THEN value=minimum WHEN 'GTE' THEN value>=minimum
 WHEN 'GT' THEN value>minimum WHEN 'BETWEEN' THEN value BETWEEN minimum AND maximum
 END,false)
$$;

CREATE FUNCTION pathways.p3_evaluate_rule(rule_id uuid, observed jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE rule pathways.alert_rules; condition pathways.alert_rule_conditions; key text; value jsonb;
 conditions jsonb:='[]'::jsonb; templates jsonb; matched boolean; condition_match boolean; observed_number numeric; condition_count integer:=0;
BEGIN
 SELECT * INTO rule FROM pathways.alert_rules WHERE id=rule_id;
 IF NOT FOUND OR rule.status<>'ACTIVE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation requires an active immutable rule version'; END IF;
 IF observed IS NULL OR jsonb_typeof(observed)<>'object' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Observed inputs must be a numeric metric object'; END IF;
 FOR key,value IN SELECT * FROM jsonb_each(observed) LOOP
  IF jsonb_typeof(value)<>'number' OR NOT EXISTS(SELECT FROM pathways.alert_rule_conditions c WHERE c.rule_id=rule.id AND c.metric::text=key) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Only declared numeric rule metrics are accepted';
  END IF;
 END LOOP;
 matched:=rule.match_mode='ALL';
 FOR condition IN SELECT * FROM pathways.alert_rule_conditions c WHERE c.rule_id=rule.id ORDER BY sequence,id LOOP
  condition_count:=condition_count+1;
  observed_number:=(observed->>condition.metric::text)::numeric;
  condition_match:=pathways.p3_condition_matches(condition.operator,observed_number,condition.threshold,condition.threshold_maximum);
  IF rule.match_mode='ALL' THEN matched:=matched AND condition_match; ELSE matched:=matched OR condition_match; END IF;
  conditions:=conditions||jsonb_build_array(jsonb_build_object(
   'id',condition.id,'sequence',condition.sequence,'metric',condition.metric,'operator',condition.operator,
   'threshold',condition.threshold,'threshold_maximum',condition.threshold_maximum,'description',condition.description,
   'observed',observed_number,'matched',condition_match));
 END LOOP;
 IF condition_count=0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Empty rules cannot be evaluated'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'text',r.text,'type',r.type) ORDER BY r.id),'[]'::jsonb)
  INTO templates FROM pathways.alert_rule_recommendations r WHERE r.rule_id=rule.id;
 RETURN jsonb_build_object('schema_version',1,'rule',jsonb_build_object('id',rule.id,'organization_id',rule.organization_id,'code',rule.code,'version',rule.version,'name',rule.name,'description',rule.description,'type',rule.type,'match_mode',rule.match_mode,'severity',rule.severity),
  'observed_values',observed,'conditions',conditions,'recommendations',templates,'matched',matched);
END $$;

CREATE FUNCTION pathways.p3_guard_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE rule pathways.alert_rules;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluated rule snapshot is immutable'; END IF;
 SELECT * INTO rule FROM pathways.alert_rules WHERE id=NEW.rule_id FOR SHARE;
 IF NOT FOUND OR rule.organization_id<>NEW.organization_id OR rule.status<>'ACTIVE' THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Alert requires an active rule in its organization';
 END IF;
 NEW.evaluated_snapshot:=pathways.p3_evaluate_rule(NEW.rule_id,NEW.observed_values);
 IF NOT (NEW.evaluated_snapshot->>'matched')::boolean THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Nonmatching evaluation cannot create an alert'; END IF;
 NEW.severity:=rule.severity;
 RETURN NEW;
END $$;
CREATE TRIGGER p3_20_alert BEFORE INSERT OR UPDATE ON pathways.rule_based_alerts FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_alert();

CREATE FUNCTION pathways.p3_guard_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE alert pathways.rule_based_alerts; template pathways.alert_rule_recommendations;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'NEW' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation must begin unreviewed'; END IF;
  IF NEW.alert_id IS NOT NULL THEN
   SELECT * INTO alert FROM pathways.rule_based_alerts WHERE id=NEW.alert_id FOR SHARE;
   IF NOT FOUND OR alert.organization_id<>NEW.organization_id OR alert.project_id<>NEW.project_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation and alert scope must agree';
   END IF;
  END IF;
  IF NEW.source_rule_recommendation_id IS NOT NULL THEN
   SELECT * INTO template FROM pathways.alert_rule_recommendations WHERE id=NEW.source_rule_recommendation_id FOR SHARE;
   IF NOT FOUND OR alert.id IS NULL OR template.organization_id<>NEW.organization_id OR template.rule_id<>alert.rule_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation must come from the evaluated alert rule';
   END IF;
   SELECT x INTO NEW.source_snapshot FROM jsonb_array_elements(alert.evaluated_snapshot->'recommendations') x WHERE x->>'id'=template.id::text;
   IF NEW.source_snapshot IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation template is missing from evaluated history'; END IF;
   NEW.title:=NEW.source_snapshot->>'title'; NEW.text:=NEW.source_snapshot->>'text'; NEW.type:=(NEW.source_snapshot->>'type')::pathways.recommendation_type;
  END IF;
 ELSE
  IF NOT ((OLD.status='NEW' AND NEW.status='REVIEWED') OR (OLD.status='REVIEWED' AND NEW.status IN ('RESOLVED','DISMISSED'))) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='A human review is required before a recommendation outcome';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['updated_at','status','reviewed_by_id','reviewed_at','review_note','outcome','outcome_by_id','outcome_at','outcome_note'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','status','reviewed_by_id','reviewed_at','review_note','outcome','outcome_by_id','outcome_at','outcome_note']) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation content and evaluated provenance are immutable';
  END IF;
  IF OLD.status='REVIEWED' AND ROW(NEW.reviewed_by_id,NEW.reviewed_at,NEW.review_note) IS DISTINCT FROM ROW(OLD.reviewed_by_id,OLD.reviewed_at,OLD.review_note) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Recommendation review history is immutable';
  END IF;
 END IF;
 -- This guard records human decisions only. It deliberately performs no DML.
 RETURN NEW;
END $$;
CREATE TRIGGER p3_20_decision BEFORE INSERT OR UPDATE ON pathways.decision_recommendations FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_decision();

CREATE FUNCTION pathways.p3_guard_report()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE form pathways.digital_forms;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Report must begin DRAFT'; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Generated report history cannot be deleted'; END IF;
  RETURN OLD;
 ELSE
  IF OLD.status='DRAFT' THEN
   IF NEW.status NOT IN ('DRAFT','GENERATED') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid report lifecycle'; END IF;
  ELSIF NOT (OLD.status='GENERATED' AND NEW.status='ARCHIVED'
   AND (to_jsonb(NEW)-ARRAY['status','archived_at','updated_at'])=(to_jsonb(OLD)-ARRAY['status','archived_at','updated_at'])) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Generated report artifact and context are immutable';
  END IF;
 END IF;
 IF NEW.form_id IS NOT NULL THEN
  SELECT * INTO form FROM pathways.digital_forms WHERE id=NEW.form_id FOR SHARE;
  IF NOT FOUND OR form.organization_id<>NEW.organization_id OR form.project_id IS DISTINCT FROM NEW.project_id OR form.status='DRAFT'
   OR form.activity_id IS DISTINCT FROM NEW.activity_id OR form.journey_stage_id IS DISTINCT FROM NEW.journey_stage_id THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Report must preserve published form version and activity/stage context';
  END IF;
 END IF;
 IF NEW.type='SURVEY_FORM_RESULTS' AND (NEW.form_id IS NULL OR NOT NEW.aggregate_only) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Survey reports require a form version and aggregate-only output';
 END IF;
 IF NEW.type='EVALUATION_REPORT' AND NEW.evaluation_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation report requires an evaluation'; END IF;
 IF NEW.evaluation_id IS NOT NULL THEN
  PERFORM 1 FROM pathways.project_evaluations WHERE id=NEW.evaluation_id AND status IN ('SIGNED_OFF','ARCHIVED') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Evaluation report requires a signed-off evaluation'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER p3_20_report BEFORE INSERT OR UPDATE OR DELETE ON pathways.reports FOR EACH ROW EXECUTE FUNCTION pathways.p3_guard_report();

-- Explicit null pairing closes SQL CHECK's UNKNOWN-is-accepted behavior.
ALTER TABLE pathways.project_evaluation_criteria ADD CONSTRAINT p3_criterion_times CHECK ((status='ARCHIVED')=(archived_at IS NOT NULL));
ALTER TABLE pathways.alert_rules ADD CONSTRAINT p3_rule_times CHECK ((status='ARCHIVED')=(archived_at IS NOT NULL));
ALTER TABLE pathways.project_evaluations ADD CONSTRAINT p3_evaluation_times CHECK (
 (reviewed_by_id IS NULL)=(reviewed_at IS NULL)
 AND (reviewed_by_id IS NULL)=(review_feedback IS NULL)
 AND (signed_off_by_id IS NULL)=(signed_off_at IS NULL)
 AND (status='ARCHIVED')=(archived_at IS NOT NULL)
);
ALTER TABLE pathways.decision_recommendations ADD CONSTRAINT p3_decision_times CHECK (
 (reviewed_by_id IS NULL)=(reviewed_at IS NULL)
 AND (outcome_by_id IS NULL)=(outcome_at IS NULL)
);
ALTER TABLE pathways.evidence_media ADD CONSTRAINT p3_public_times CHECK (
 (public_submitted_by_id IS NULL)=(public_submitted_at IS NULL)
 AND (public_approved_by_id IS NULL)=(public_approved_at IS NULL)
 AND (published_by_id IS NULL)=(published_at IS NULL)
);
ALTER TABLE pathways.reports ADD CONSTRAINT p3_report_times CHECK ((status='ARCHIVED')=(archived_at IS NOT NULL));

-- Do not make trigger helpers public RPCs. No runtime role exists in this phase.
REVOKE ALL ON FUNCTION pathways.p3_private_key(bucket text, object_key text, org uuid, project uuid, kind text, entity uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_reject_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_actors() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_review() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_budget() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_budget_totals(budget_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_source() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_public_evidence() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_criterion() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_score() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_evaluation() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_rule() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_rule_child() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_condition_matches(op pathways.rule_operator, value numeric, minimum numeric, maximum numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_evaluate_rule(rule_id uuid, observed jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_alert() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_decision() FROM PUBLIC;
REVOKE ALL ON FUNCTION pathways.p3_guard_report() FROM PUBLIC;

COMMIT;
