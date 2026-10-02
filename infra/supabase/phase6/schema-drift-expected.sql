-- DropForeignKey
ALTER TABLE "auth"."sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways"."alert_rules" DROP CONSTRAINT "f10_rule_project_scope";

-- DropForeignKey
ALTER TABLE "pathways"."alert_rules" DROP CONSTRAINT "f10_rule_template_scope";

-- DropForeignKey
ALTER TABLE "pathways"."decision_recommendations" DROP CONSTRAINT "f10_private_review_scope";

-- DropForeignKey
ALTER TABLE "pathways"."rule_based_alerts" DROP CONSTRAINT "f10_alert_latest_evaluation";

-- DropForeignKey
ALTER TABLE "pathways"."rule_based_alerts" DROP CONSTRAINT "f10_alert_origin_snapshot";

-- DropForeignKey
ALTER TABLE "pathways"."system_users" DROP CONSTRAINT "system_users_auth_user_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."acknowledgements" DROP CONSTRAINT "acknowledgements_organization_id_project_id_job_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."acknowledgements" DROP CONSTRAINT "acknowledgements_organization_id_project_id_snapshot_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."alert_reviews" DROP CONSTRAINT "alert_reviews_organization_id_project_id_alert_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."alert_reviews" DROP CONSTRAINT "alert_reviews_organization_id_project_id_operation_receipt_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."configuration_receipts" DROP CONSTRAINT "configuration_receipts_organization_id_rule_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."decisions" DROP CONSTRAINT "decisions_organization_id_project_id_alert_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."decisions" DROP CONSTRAINT "decisions_organization_id_project_id_operation_receipt_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."decisions" DROP CONSTRAINT "decisions_organization_id_project_id_recommendation_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."eligibility" DROP CONSTRAINT "eligibility_organization_id_project_id_indicator_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."episode_cursors" DROP CONSTRAINT "episode_cursors_organization_id_project_id_alert_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."episode_cursors" DROP CONSTRAINT "episode_cursors_organization_id_project_id_rule_version_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."evaluations" DROP CONSTRAINT "evaluations_organization_id_project_id_rule_version_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."evaluations" DROP CONSTRAINT "evaluations_organization_id_project_id_snapshot_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."feature_operation_context" DROP CONSTRAINT "feature_operation_context_organization_id_project_id_alert_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."feature_operation_context" DROP CONSTRAINT "feature_operation_context_organization_id_project_id_recom_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."feature_operation_receipts" DROP CONSTRAINT "feature_operation_receipts_organization_id_project_id_aler_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."feature_operation_receipts" DROP CONSTRAINT "feature_operation_receipts_organization_id_project_id_reco_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."jobs" DROP CONSTRAINT "jobs_organization_id_project_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."lifecycle_events" DROP CONSTRAINT "lifecycle_events_organization_id_project_id_alert_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."lifecycle_events" DROP CONSTRAINT "lifecycle_events_organization_id_project_id_operation_rece_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."notifications" DROP CONSTRAINT "notifications_organization_id_project_id_alert_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."notifications" DROP CONSTRAINT "notifications_organization_id_project_id_decision_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."notifications" DROP CONSTRAINT "notifications_organization_id_recipient_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."outcome_previews" DROP CONSTRAINT "outcome_previews_organization_id_project_id_alert_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."outcome_previews" DROP CONSTRAINT "outcome_previews_organization_id_project_id_consumed_by_de_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."outcome_previews" DROP CONSTRAINT "outcome_previews_organization_id_project_id_recommendation_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."recommendation_reviews" DROP CONSTRAINT "recommendation_reviews_organization_id_project_id_recommen_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."rule_bindings" DROP CONSTRAINT "rule_bindings_organization_id_project_id_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."rule_bindings" DROP CONSTRAINT "rule_bindings_organization_id_project_id_classification_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."rule_bindings" DROP CONSTRAINT "rule_bindings_organization_id_project_id_indicator_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."rule_bindings" DROP CONSTRAINT "rule_bindings_organization_id_project_id_rule_version_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."snapshots" DROP CONSTRAINT "snapshots_organization_id_project_id_job_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."source_operation_context" DROP CONSTRAINT "source_operation_context_operation_code_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."source_operation_context" DROP CONSTRAINT "source_operation_context_organization_id_project_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."source_operation_receipts" DROP CONSTRAINT "f10_source_work_fk";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."source_operation_receipts" DROP CONSTRAINT "source_operation_receipts_operation_code_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."source_operation_receipts" DROP CONSTRAINT "source_operation_receipts_organization_id_project_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."source_request_abandonments" DROP CONSTRAINT "source_request_abandonments_operation_code_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."source_request_abandonments" DROP CONSTRAINT "source_request_abandonments_organization_id_project_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."work_coverage" DROP CONSTRAINT "work_coverage_organization_id_project_id_acknowledgement_s_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."work_coverage" DROP CONSTRAINT "work_coverage_organization_id_project_id_work_item_id_fkey";

-- DropForeignKey
ALTER TABLE "pathways_rules_internal"."work_items" DROP CONSTRAINT "work_items_organization_id_project_id_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";

-- DropForeignKey
ALTER TABLE "MetadataField" DROP CONSTRAINT "MetadataField_formMetadataId_fkey";

-- DropForeignKey
ALTER TABLE "ParticipantCard" DROP CONSTRAINT "ParticipantCard_participantId_fkey";

-- DropForeignKey
ALTER TABLE "ParticipantJourney" DROP CONSTRAINT "ParticipantJourney_participantId_fkey";

-- DropForeignKey
ALTER TABLE "ParticipantJourney" DROP CONSTRAINT "ParticipantJourney_programId_fkey";

-- DropForeignKey
ALTER TABLE "ParticipantJourney" DROP CONSTRAINT "ParticipantJourney_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_programId_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_programId_fkey";

-- DropForeignKey
ALTER TABLE "UploadBatch" DROP CONSTRAINT "UploadBatch_formMetadataId_fkey";

-- DropForeignKey
ALTER TABLE "UploadBatch" DROP CONSTRAINT "UploadBatch_projectId_fkey";

-- DropForeignKey
ALTER TABLE "UploadBatch" DROP CONSTRAINT "UploadBatch_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "UploadRow" DROP CONSTRAINT "UploadRow_participantId_fkey";

-- DropForeignKey
ALTER TABLE "UploadRow" DROP CONSTRAINT "UploadRow_uploadBatchId_fkey";

-- DropForeignKey
ALTER TABLE "UploadRowError" DROP CONSTRAINT "UploadRowError_uploadRowId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_roleId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_userId_fkey";

-- DropIndex
DROP INDEX "pathways"."f10_rule_scoped_id";

-- AlterTable
ALTER TABLE "pathways"."alert_rules" DROP COLUMN "conditions_json",
DROP COLUMN "definition_digest",
DROP COLUMN "display_code",
DROP COLUMN "logical_rule_id",
DROP COLUMN "project_id",
DROP COLUMN "runtime_contract_version",
DROP COLUMN "template_origin_id";

-- AlterTable
ALTER TABLE "pathways"."decision_recommendations" DROP COLUMN "attribution",
DROP COLUMN "private_review_id",
DROP COLUMN "revision",
DROP COLUMN "runtime_contract_version";

-- AlterTable
ALTER TABLE "pathways"."rule_based_alerts" DROP COLUMN "affected_id",
DROP COLUMN "affected_kind",
DROP COLUMN "attribution",
DROP COLUMN "episode_number",
DROP COLUMN "latest_evaluation_id",
DROP COLUMN "lifecycle",
DROP COLUMN "origin_snapshot_id",
DROP COLUMN "revision",
DROP COLUMN "runtime_contract_version";

-- DropTable
DROP TABLE "auth"."sessions";

-- DropTable
DROP TABLE "auth"."users";

-- DropTable
DROP TABLE "pathways"."signin_lockouts";

-- DropTable
DROP TABLE "pathways_rules_internal"."acknowledgements";

-- DropTable
DROP TABLE "pathways_rules_internal"."alert_reviews";

-- DropTable
DROP TABLE "pathways_rules_internal"."calendar_configuration";

-- DropTable
DROP TABLE "pathways_rules_internal"."configuration_context";

-- DropTable
DROP TABLE "pathways_rules_internal"."configuration_receipts";

-- DropTable
DROP TABLE "pathways_rules_internal"."decisions";

-- DropTable
DROP TABLE "pathways_rules_internal"."eligibility";

-- DropTable
DROP TABLE "pathways_rules_internal"."episode_cursors";

-- DropTable
DROP TABLE "pathways_rules_internal"."evaluations";

-- DropTable
DROP TABLE "pathways_rules_internal"."feature_operation_context";

-- DropTable
DROP TABLE "pathways_rules_internal"."feature_operation_receipts";

-- DropTable
DROP TABLE "pathways_rules_internal"."jobs";

-- DropTable
DROP TABLE "pathways_rules_internal"."lifecycle_events";

-- DropTable
DROP TABLE "pathways_rules_internal"."notifications";

-- DropTable
DROP TABLE "pathways_rules_internal"."outcome_previews";

-- DropTable
DROP TABLE "pathways_rules_internal"."project_state";

-- DropTable
DROP TABLE "pathways_rules_internal"."projection_context";

-- DropTable
DROP TABLE "pathways_rules_internal"."recommendation_reviews";

-- DropTable
DROP TABLE "pathways_rules_internal"."rule_bindings";

-- DropTable
DROP TABLE "pathways_rules_internal"."runtime_mutation_intents";

-- DropTable
DROP TABLE "pathways_rules_internal"."snapshots";

-- DropTable
DROP TABLE "pathways_rules_internal"."source_operation_catalog";

-- DropTable
DROP TABLE "pathways_rules_internal"."source_operation_context";

-- DropTable
DROP TABLE "pathways_rules_internal"."source_operation_receipts";

-- DropTable
DROP TABLE "pathways_rules_internal"."source_request_abandonments";

-- DropTable
DROP TABLE "pathways_rules_internal"."sweep_cursor";

-- DropTable
DROP TABLE "pathways_rules_internal"."work_coverage";

-- DropTable
DROP TABLE "pathways_rules_internal"."work_items";

-- DropTable
DROP TABLE "AuditLog";

-- DropTable
DROP TABLE "FormMetadata";

-- DropTable
DROP TABLE "MetadataField";

-- DropTable
DROP TABLE "Participant";

-- DropTable
DROP TABLE "ParticipantCard";

-- DropTable
DROP TABLE "ParticipantJourney";

-- DropTable
DROP TABLE "Program";

-- DropTable
DROP TABLE "Project";

-- DropTable
DROP TABLE "Report";

-- DropTable
DROP TABLE "Role";

-- DropTable
DROP TABLE "UploadBatch";

-- DropTable
DROP TABLE "UploadRow";

-- DropTable
DROP TABLE "UploadRowError";

-- DropTable
DROP TABLE "User";

-- DropTable
DROP TABLE "UserRole";

-- DropTable
DROP TABLE "storage"."objects";

-- CreateIndex
CREATE UNIQUE INDEX "beneficiary_activity_participations_submission_key" ON "pathways"."beneficiary_activity_participations"("source_submission_id");
