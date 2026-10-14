// Assembles specialist reply lines into the SAD section 4.4 evidence file.
import fs from 'node:fs'
import path from 'node:path'

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
const pillars = {
  'organization-isolation-checker': ['Security'],
  'migration-integrity-guardian': ['Reliability'],
  'beneficiary-privacy-guardian': ['Compatibility', 'Security'],
  'metadata-import-validator': ['Functional Suitability'],
  'rule-engine-determinism-checker': ['Performance Efficiency'],
  'restraint-guardian': ['Maintainability'],
  'design-qa-agent': [
    'Functional Suitability',
    'Performance Efficiency',
    'Compatibility',
    'Usability',
    'Reliability',
    'Security',
    'Maintainability',
    'Portability',
  ],
}
const evaluations = []
const problems = []
for (const [role, paths] of Object.entries(manifest.required_subagents)) {
  const file = path.join(dir, `reply-${role}.txt`)
  if (!fs.existsSync(file)) {
    problems.push(`${role}: no reply file`)
    continue
  }
  const seen = new Map()
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const parts = line.split('|')
    if (parts[0] === 'PASS' && parts.length >= 3)
      seen.set(parts[1].trim(), {
        status: 'PASS',
        lines: [],
        evidence: parts.slice(2).join('|').trim(),
        fix: 'None.',
      })
    else if (parts[0] === 'BLOCKED' && parts.length >= 5)
      seen.set(parts[1].trim(), {
        status: 'BLOCKED',
        lines: parts[2]
          .split(',')
          .map((n) => Number(n.trim()))
          .filter((n) => Number.isInteger(n) && n > 0),
        evidence: parts[3].trim(),
        fix: parts.slice(4).join('|').trim(),
      })
  }
  for (const p of paths) {
    const entry = seen.get(p)
    if (!entry) {
      problems.push(`${role}: missing ${p}`)
      continue
    }
    evaluations.push({
      subagent: role,
      status: entry.status,
      iso_25010_compliance: pillars[role],
      findings: { file_path: p, implicated_lines: entry.lines, violation_evidence: entry.evidence },
      prescribed_remediation: entry.fix,
    })
  }
}
evaluations.sort(
  (a, b) =>
    a.subagent.localeCompare(b.subagent) ||
    a.findings.file_path.localeCompare(b.findings.file_path),
)
fs.writeFileSync(
  path.join(dir, 'reviews.json'),
  `${JSON.stringify({ change_digest: manifest.change_digest, subagent_evaluations: evaluations }, null, 2)}\n`,
)
const blocked = evaluations.filter((e) => e.status === 'BLOCKED')
console.log(`entries=${evaluations.length} blocked=${blocked.length} problems=${problems.length}`)
for (const p of problems) console.log(`PROBLEM ${p}`)
for (const b of blocked)
  console.log(`BLOCKED ${b.subagent} ${b.findings.file_path}: ${b.findings.violation_evidence}`)
