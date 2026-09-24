-- One Project-owned exact percentage threshold. Existing rows remain explicitly unset.
ALTER TABLE pathways.projects
  ADD COLUMN target_goal numeric(7,4);

ALTER TABLE pathways.projects
  ADD CONSTRAINT projects_target_goal_check
  CHECK (target_goal IS NULL OR (target_goal > 0 AND target_goal <= 100));
