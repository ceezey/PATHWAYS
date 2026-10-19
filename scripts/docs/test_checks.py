"""Tests of the documentation checks: each check on a small synthetic tree, the shared helpers and the command line contract."""

import contextlib
import io
import tempfile
import unittest
from datetime import date
from pathlib import Path

import check
from checks.agents import check_agents
from checks.common import docs_ancestor, docs_roots, is_change_layer_path, parse_tables
from checks.coverage import check_coverage
from checks.currency import check_currency
from checks.filing import check_filing
from checks.inception import check_inception
from checks.project_specific import check_project_specific
from checks.scrutiny import check_scrutiny
from checks.trace import check_cr_propagation, check_index_accuracy, check_sdd_contracts, check_trace
from checks.voice import check_voice

EM = "—"
SCRUTINY = "**Status:** Working\n\nClaims extracted: 1\n\n| # | Claim | Finding | Source |\n|---|---|---|---|\n| 1 | a | Verified | {source} |\n"
PRD = "**Status:** {status}\n\n| ID | Feature | Priority |\n|---|---|---|\n| PRD-F1 | A | Must-Have |\n"
SAD = "| Specialist | Model |\n|---|---|\n| qa-agent | opus |\n"
IDEA = "**Status:** " "Locked\n\n**One-line pitch:** a\n**Problem:** {problem}\n**Insight (why us, why now):** a\n**Primary user (named, specific):** a\n**Their moment of pain:** a\n**If we only ship one thing:** a\n"
INDEX = "| File | Version | Status |\n|---|---|---|\n" + "".join(f"| [{n}-x.md]({n}-x.md) | 1.0 | Locked |\n" for n in ("prd", "sdd", "qad"))
DOC = "**Version:** 1.0\n**Status:** Locked\n**Last reconciled:** 2026-01-01\n\n{ids}\n"
VALID = {"docs/index.md": INDEX, **{f"docs/{n}-x.md": DOC.format(ids="PRD-F1 US-1") for n in ("prd", "sdd", "qad")}}


class Tree(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.root = Path(self._dir.name)

    def put(self, files):
        for name, text in files.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")

    def run_check(self, fn, files, **kwargs):
        self.put(files)
        return fn(self.root, **kwargs)

    def assertOneMessage(self, messages, *fragments):
        self.assertEqual(len(messages), 1, messages)
        for fragment in fragments:
            self.assertIn(fragment, messages[0])


class CommonHelpers(Tree):
    def test_parse_tables_reads_header_and_rows(self):
        self.assertEqual(parse_tables("| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n"), [(["a", "b"], [["1", "2"], ["3", "4"]])])
        self.assertEqual(parse_tables("no table here"), [])

    def test_docs_ancestor_and_change_layer(self):
        self.assertEqual(docs_ancestor(Path("/x/docs/a/b.md")), Path("/x/docs"))
        self.assertIsNone(docs_ancestor(Path("/x/other/b.md")))
        self.assertTrue(is_change_layer_path(Path("/x/docs/specs/a.md")))
        self.assertTrue(is_change_layer_path(Path("/x/docs/archive/a.md")))
        self.assertFalse(is_change_layer_path(Path("/x/docs/a.md")))

    def test_docs_roots_skip_benchmarks(self):
        self.put({"docs/a.md": "x", "other/docs/benchmarks/b.md": "x"})
        self.assertEqual(docs_roots(self.root), {self.root / "docs"})


class Voice(Tree):
    def test_clean_docs_pass(self):
        self.assertEqual(self.run_check(check_voice, {"docs/a.md": "# A\n\nPlain words, one idea.\n"}), ([], []))

    def test_em_dash_fails_with_line_number(self):
        fails, _ = self.run_check(check_voice, {"docs/a.md": f"# A\n\nA word {EM} another.\n"})
        self.assertOneMessage(fails, "a.md:3", "em-dash")

    def test_double_hyphen_fails_outside_code_only(self):
        fails, _ = self.run_check(check_voice, {"docs/a.md": "A word -- another.\n\n```\nls --all\n```\n"})
        self.assertOneMessage(fails, "a.md:1", "'--'")

    def test_spaced_en_dash_fails_but_a_range_passes(self):
        fails, _ = self.run_check(check_voice, {"docs/a.md": "A word – another.\n\nPages 1–3.\n"})
        self.assertOneMessage(fails, "a.md:1", "en-dash")

    def test_banned_phrase_and_ai_artifact_fail(self):
        fails, _ = self.run_check(check_voice, {"docs/a.md": "It is game-" "changing.\n\nSee oaicite here.\n"})
        self.assertEqual(len(fails), 2, fails)
        self.assertIn("banned phrase", fails[0])
        self.assertIn("markup artifact", fails[1])

    def test_public_surface_leak_fails(self):
        fails, _ = self.run_check(check_voice, {"docs/pitch-x.md": "See PRD-F1 here.\n"})
        self.assertOneMessage(fails, "pitch-x.md:1", "traceability ID")

    def test_guide_file_em_dash_fails(self):
        fails, _ = self.run_check(check_voice, {"docs/a.md": "ok\n", "CLAUDE.md": f"A {EM} B\n"})
        self.assertOneMessage(fails, "CLAUDE.md:1")


class Scrutiny(Tree):
    def test_verified_claim_with_a_url_passes(self):
        self.assertEqual(self.run_check(check_scrutiny, {"docs/scrutiny-x.md": SCRUTINY.format(source="https://example.org/a")}), ([], []))

    def test_missing_coverage_line_fails(self):
        fails, _ = self.run_check(check_scrutiny, {"docs/scrutiny-x.md": "**Status:** Working\n"})
        self.assertOneMessage(fails, "claim-coverage")

    def test_verified_claim_without_a_source_fails(self):
        fails, _ = self.run_check(check_scrutiny, {"docs/scrutiny-x.md": SCRUTINY.format(source="-")})
        self.assertOneMessage(fails, "no source")

    def test_free_text_source_only_warns(self):
        fails, warns = self.run_check(check_scrutiny, {"docs/scrutiny-x.md": SCRUTINY.format(source="the manuscript")})
        self.assertEqual(fails, [])
        self.assertOneMessage(warns, "free-text")

    def test_locked_do_not_build_fails_and_blocks_suite_docs(self):
        text = "**Status:** " "Locked\n\nDecision: DO NOT BUILD YET\n\nClaims extracted: 0\n"
        fails, _ = self.run_check(check_scrutiny, {"docs/scrutiny-x.md": text, "docs/prd-x.md": "x"})
        self.assertEqual(len(fails), 2, fails)
        self.assertIn("Locked with Decision", fails[0])
        self.assertIn("prd-x.md", fails[1])


class Inception(Tree):
    def test_locked_idea_with_every_field_passes(self):
        self.assertEqual(self.run_check(check_inception, {"docs/idea-x.md": IDEA.format(problem="Real problem")}), ([], []))

    def test_hollow_field_fails(self):
        fails, _ = self.run_check(check_inception, {"docs/idea-x.md": IDEA.format(problem="TBD")})
        self.assertOneMessage(fails, "hollow 'Problem'")

    def test_draft_idea_is_not_checked(self):
        self.assertEqual(self.run_check(check_inception, {"docs/idea-x.md": "**Status:** Draft\n"}), ([], []))

    def test_locked_pitch_without_idea_link_warns(self):
        _, warns = self.run_check(check_inception, {"docs/pitch-x.md": "**Status:** " "Locked\n"})
        self.assertOneMessage(warns, "no IDEA link")


class Trace(Tree):
    def test_applied_cr_with_an_unticked_affected_row_fails(self):
        text = "**Status:** Applied\n\n| Area | Affected | Done |\n|---|---|---|\n| API | Yes | [ ] |\n| UI | No | [ ] |\n| DB | Yes | [x] |\n"
        fails, _ = self.run_check(check_cr_propagation, {"docs/cr-x.md": text})
        self.assertOneMessage(fails, "row 1", "propagation incomplete")

    def test_draft_cr_is_not_checked(self):
        text = "**Status:** Draft\n\n| Area | Affected | Done |\n|---|---|---|\n| API | Yes | [ ] |\n"
        self.assertEqual(self.run_check(check_cr_propagation, {"docs/cr-x.md": text}), ([], []))

    def trace_fails(self, files, drop=()):
        return self.run_check(check_trace, {**{k: v for k, v in VALID.items() if k not in drop}, **files})[0]

    def test_valid_tree_passes_trace_index_and_sdd_checks(self):
        self.put(VALID)
        for fn in (check_trace, check_index_accuracy, check_sdd_contracts):
            self.assertEqual(fn(self.root), ([], []), fn.__name__)

    def test_undefined_prd_id_in_a_downstream_doc_fails(self):
        fails = self.trace_fails({"docs/sdd-x.md": DOC.format(ids="PRD-F1 PRD-F9")})
        self.assertOneMessage(fails, "sdd-x.md", "references PRD-F9, not defined in the PRD")

    def test_sdd_and_qad_without_ids_fail(self):
        fails = self.trace_fails({"docs/sdd-x.md": DOC.format(ids="none"), "docs/qad-x.md": DOC.format(ids="none")})
        self.assertEqual(len(fails), 2, fails)
        self.assertIn("sdd-x.md: references no PRD-F#/US-# IDs", fails[0])
        self.assertIn("qad-x.md: references no PRD-F#/US-# IDs", fails[1])

    def test_downstream_ids_without_a_prd_fail(self):
        fails = self.trace_fails({}, drop=("docs/prd-x.md",))
        self.assertOneMessage(fails, "downstream docs reference 2 PRD/US ID(s)", "no prd-*.md defines them")

    def test_missing_index_fails(self):
        fails = self.trace_fails({}, drop=("docs/index.md",))
        self.assertOneMessage(fails, "no index.md")

    def test_doc_missing_from_the_index_fails(self):
        fails = self.trace_fails({"docs/state.md": "# State\n"})
        self.assertOneMessage(fails, "state.md", "not listed in a manifest row in index.md")

    def test_locked_doc_without_a_reconciled_date_fails(self):
        fails = self.trace_fails({"docs/sdd-x.md": "**Status:** Locked\n\nPRD-F1\n"})
        self.assertOneMessage(fails, "sdd-x.md", "Locked but Last reconciled is unset")

    def test_locked_doc_with_an_invalid_reconciled_date_fails(self):
        fails = self.trace_fails({"docs/sdd-x.md": DOC.replace("2026-01-01", "2026-13-45").format(ids="PRD-F1")})
        self.assertOneMessage(fails, "sdd-x.md", "date is invalid (2026-13-45)")


class Coverage(Tree):
    def test_must_have_cited_in_sdd_and_qad_passes(self):
        files = {"docs/prd-x.md": PRD.format(status="Locked"), "docs/sdd-x.md": "PRD-F1", "docs/qad-x.md": "PRD-F1"}
        self.assertEqual(self.run_check(check_coverage, files), ([], []))

    def test_uncited_must_have_warns_in_a_draft_and_fails_when_locked(self):
        files = {"docs/sdd-x.md": "none", "docs/qad-x.md": "PRD-F1"}
        fails, warns = self.run_check(check_coverage, {**files, "docs/prd-x.md": PRD.format(status="Draft")})
        self.assertEqual(fails, [])
        self.assertOneMessage(warns, "sdd-x.md", "PRD-F1")
        fails, warns = self.run_check(check_coverage, {**files, "docs/prd-x.md": PRD.format(status="Locked")})
        self.assertEqual(warns, [])
        self.assertOneMessage(fails, "sdd-x.md", "PRD-F1")

    def test_unparsable_feature_table_warns(self):
        _, warns = self.run_check(check_coverage, {"docs/prd-x.md": "PRD-F1 is a feature.\n"})
        self.assertOneMessage(warns, "could not parse a feature table")


class Currency(Tree):
    def test_old_build_date_warns_and_a_recent_one_does_not(self):
        _, warns = self.run_check(check_currency, {"docs/build-x.md": "Verified 2020-01-01.\n"})
        self.assertOneMessage(warns, "build-x.md:1", "2020-01-01")
        self.assertEqual(self.run_check(check_currency, {"docs/build-x.md": f"Verified {date.today()}.\n"}), ([], []))

    def test_guide_dates_need_a_verification_cue(self):
        _, warns = self.run_check(check_currency, {"AGENTS.md": "verified 2020-02-02\nplain 2020-03-03\n"})
        self.assertOneMessage(warns, "AGENTS.md:1")

    def test_max_age_days_is_honoured(self):
        _, warns = self.run_check(check_currency, {"docs/build-x.md": f"Verified {date.today()}.\n"}, max_age_days=-1)
        self.assertOneMessage(warns, "over -1 days")


class Filing(Tree):
    def test_registered_doc_outside_docs_fails(self):
        fails, _ = self.run_check(check_filing, {"prd-stray.md": "x", "docs/state.md": "x"})
        self.assertOneMessage(fails, "prd-stray.md", "PRD doc")

    def test_docs_without_state_do_not_warn(self):
        fails, warns = self.run_check(check_filing, {"docs/prd-x.md": "x"})
        self.assertEqual((fails, warns), ([], []))


class ProjectSpecific(Tree):
    def test_missing_header_fields_warn(self):
        _, warns = self.run_check(check_project_specific, {"docs/x-note.md": "**Class:** Project-specific\n\n**Purpose:** a\n"})
        self.assertEqual([w.rsplit("missing ", 1)[1] for w in warns], ["Owner", "Why baseline insufficient", "Status", "Promotion"])

    def test_change_layer_and_other_classes_are_skipped(self):
        files = {"docs/specs/x.md": "**Class:** Project-specific\n", "docs/y.md": "**Class:** Baseline\n"}
        self.assertEqual(self.run_check(check_project_specific, files), ([], []))


class Agents(Tree):
    def agent(self, name, model):
        return {f".claude/agents/{name}.md": f"---\nname: {name}\nmodel: {model}\n---\n"}

    def test_matching_roster_passes(self):
        files = {"docs/sad-pathways.md": SAD, **self.agent("qa-agent", "opus")}
        self.assertEqual(self.run_check(check_agents, files), ([], []))

    def test_model_differing_from_the_roster_fails(self):
        fails, _ = self.run_check(check_agents, {"docs/sad-pathways.md": SAD, **self.agent("qa-agent", "haiku")})
        self.assertOneMessage(fails, "qa-agent.md", "differs from SAD")

    def test_role_without_a_definition_and_an_unlisted_agent_fail(self):
        fails, _ = self.run_check(check_agents, {"docs/sad-pathways.md": SAD, **self.agent("extra-agent", "opus")})
        self.assertEqual(len(fails), 2, fails)
        self.assertIn("has no .claude/agents definition", fails[0])
        self.assertIn("not in the SAD roster", fails[1])


class CommandLine(Tree):
    def main(self, *argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = check.main(list(argv))
        return code, out.getvalue()

    def test_every_check_is_registered(self):
        self.assertEqual(list(check.CHECKS), ["agents", "voice", "scrutiny", "inception", "trace", "coverage", "currency", "filing", "project-specific"])

    def test_clean_tree_exits_zero_with_a_summary(self):
        self.put({"docs/state.md": "# State\n"})
        code, out = self.main(str(self.root / "docs"), "--only", "voice")
        self.assertEqual(code, 0)
        self.assertTrue(out.endswith("0 failure(s), 0 warning(s) over checks: voice\n"), out)

    def test_failure_exits_one_and_prints_it(self):
        self.put({"docs/state.md": f"A {EM} B\n"})
        code, out = self.main(str(self.root / "docs"), "--only", "voice")
        self.assertEqual(code, 1)
        self.assertIn("FAIL  [voice]", out)

    def test_warning_fails_only_with_strict(self):
        self.put({"docs/x-note.md": "**Class:** Project-specific\n"})
        self.assertEqual(self.main(str(self.root / "docs"), "--only", "project-specific")[0], 0)
        code, out = self.main(str(self.root / "docs"), "--only", "project-specific", "--strict")
        self.assertEqual(code, 1)
        self.assertIn("WARN  [project-specific]", out)

    def test_bad_input_exits_two(self):
        self.assertEqual(self.main(str(self.root / "missing"))[0], 2)
        self.assertEqual(self.main(str(self.root))[0], 2)
        self.put({"docs/state.md": "# State\n"})
        code, out = self.main(str(self.root / "docs"), "--only", "nosuch")
        self.assertEqual((code, out), (2, "unknown check: nosuch\n"))


if __name__ == "__main__":
    unittest.main()
