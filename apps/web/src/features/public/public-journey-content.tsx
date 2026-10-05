import {
  AlertTriangle,
  Check,
  EyeOff,
  FolderTree,
  Lock,
  MapPin,
  Smartphone,
  UserCheck,
} from 'lucide-react'

// Step content and mock screens for the public journey; every value shown is illustrative, not live data.
const panel =
  'w-full space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg shadow-blue-950/30'
const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold'

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-1.5 text-sm last:border-0">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium text-neutral-900">{value}</span>
  </div>
)

const PanelHead = ({ title, tag, tone }: { title: string; tag: string; tone: string }) => (
  <div className="flex items-center justify-between gap-3">
    <p className="text-sm font-semibold text-neutral-900">{title}</p>
    <span className={`${chip} ${tone}`}>{tag}</span>
  </div>
)

const FieldVisual = () => (
  <div className={panel}>
    <PanelHead title="Site visit form · submitted" tag="Synced" tone="bg-sky-50 text-sky-700" />
    <div>
      <Row label="Activity" value="Hygiene kit distribution" />
      <Row label="Site" value="Area A" />
      <Row label="Households reached" value="48" />
      <Row label="Collected" value="Field officer · 14 Sep" />
    </div>
    <div className="flex flex-wrap gap-2">
      <span className={`${chip} bg-slate-100 text-slate-700`}>
        <Smartphone className="h-3 w-3" aria-hidden="true" /> Mobile form
      </span>
      <span className={`${chip} bg-slate-100 text-slate-700`}>
        <MapPin className="h-3 w-3" aria-hidden="true" /> Location recorded
      </span>
      <span className={`${chip} bg-slate-100 text-slate-700`}>Source kept</span>
    </div>
  </div>
)

const links = [
  ['Project', 'Community WASH response'],
  ['Activity', 'Hygiene kit distribution'],
  ['Indicator', 'Households reached · 148 of 200'],
  ['Budget line', 'Kits and logistics · 61% used'],
]

const StructureVisual = () => (
  <div className={panel}>
    <PanelHead title="Linked records" tag="Structured" tone="bg-sky-50 text-sky-700" />
    <ol className="space-y-1.5">
      {links.map(([label, value], index) => (
        <li key={label} className="flex items-center gap-3" style={{ paddingLeft: index * 16 }}>
          <FolderTree className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
          <p className="flex flex-1 items-baseline gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-neutral-900">
            <span className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              {label}
            </span>
            {value}
          </p>
        </li>
      ))}
    </ol>
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full w-[74%] rounded-full bg-gradient-to-r from-sky-600 to-teal-400" />
    </div>
  </div>
)

const checks = [
  ['Column mapping reviewed', true],
  ['Values within expected range', true],
  ['Possible duplicate submission', false],
] as const

const ValidationVisual = () => (
  <div className={panel}>
    <PanelHead title="Validation queue" tag="In review" tone="bg-amber-50 text-yellow-700" />
    <ul className="space-y-2">
      {checks.map(([label, passed]) => (
        <li
          key={label}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${passed ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}
        >
          {passed ? (
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {label}
          <span className="ml-auto text-xs font-semibold">
            {passed ? 'Passed' : 'Needs a person'}
          </span>
        </li>
      ))}
    </ul>
    <p className="text-xs text-gray-500">
      Flagged items wait for a reviewer before anything is applied.
    </p>
  </div>
)

const DecisionVisual = () => (
  <div className={panel}>
    <PanelHead
      title="Alert · below target in Area A"
      tag="Authorized"
      tone="bg-emerald-50 text-green-700"
    />
    <div className="rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm text-sky-900">
      <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">Advisory</p>
      Consider a follow-up distribution next month.
    </div>
    <div className="space-y-1 rounded-lg border border-slate-200 p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold text-neutral-900">
        <UserCheck className="h-4 w-4 text-green-700" aria-hidden="true" /> Decision recorded
      </p>
      <p className="text-gray-600">Approved by the project manager, with the reason attached.</p>
      <p className="text-xs text-gray-500">Attributed · timestamped · traceable to the alert</p>
    </div>
  </div>
)

const hidden = ['Beneficiary list', 'Review notes', 'Internal alerts']

const PublishVisual = () => (
  <div className={panel}>
    <PanelHead title="Public project page" tag="Published" tone="bg-sky-50 text-sky-700" />
    <div className="rounded-lg bg-gradient-to-br from-navy to-sky-800 p-4 text-white">
      <p className="text-[11px] font-bold uppercase tracking-wide text-sky-200">WASH</p>
      <p className="font-heading text-lg">Community WASH response</p>
      <p className="mt-1 text-sm text-sky-100">Approved summary · Area A · 2026</p>
    </div>
    <ul className="space-y-1.5">
      {hidden.map((label) => (
        <li key={label} className="flex items-center gap-2 text-sm text-gray-500">
          <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="line-through">{label}</span>
          <span className={`${chip} ml-auto bg-slate-100 text-slate-600`}>
            <Lock className="h-3 w-3" aria-hidden="true" /> Private
          </span>
        </li>
      ))}
    </ul>
  </div>
)

export const journeySteps = [
  {
    label: 'Field data',
    summary: 'Collected with context and provenance',
    status: 'Collected',
    tone: 'text-sky-700',
    title: 'Capture field data with its context intact.',
    body: 'Teams record activities where they happen. Every submission keeps who collected it, when, where, and from which source, so nothing arrives as an anonymous number.',
    Visual: FieldVisual,
  },
  {
    label: 'Structured information',
    summary: 'Activities, indicators, and budgets linked',
    status: 'Structured',
    tone: 'text-sky-700',
    title: 'Connect it to the work it describes.',
    body: 'Records link to their project, activity, indicator, and budget line. Progress updates where it belongs, and anyone can follow a figure back to the work behind it.',
    Visual: StructureVisual,
  },
  {
    label: 'Validation & monitoring',
    summary: 'Traceable to source, with review status',
    status: 'Reviewed',
    tone: 'text-yellow-700',
    title: 'Check quality before it counts.',
    body: 'Automated checks catch gaps, outliers, and duplicates, then hand anything uncertain to a person. Review status stays visible, so teams know what they can rely on.',
    Visual: ValidationVisual,
  },
  {
    label: 'Human decision',
    summary: 'Authorized action, recorded and attributed',
    status: 'Authorized',
    tone: 'text-green-700',
    title: 'Keep decisions with the right people.',
    body: 'Alerts and recommendations arrive as advice, never as instructions. Authorized staff decide, and PATHWAYS records who decided, what, and why.',
    Visual: DecisionVisual,
  },
  {
    label: 'Approved reporting',
    summary: 'A deliberate public view, nothing unintended',
    status: 'Published',
    tone: 'text-sky-700',
    title: 'Share results the public can trust.',
    body: 'Only approved, aggregate information is published, after a separate sign-off. Beneficiary details, review notes, and internal alerts stay private by default.',
    Visual: PublishVisual,
  },
] as const
