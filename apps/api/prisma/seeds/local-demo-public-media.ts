import { readFileSync } from 'node:fs'
import path from 'node:path'

export type PublicMediaPlan = {
  file: string
  kind: 'photo' | 'video'
  activity: string
  barangay: string
  caption: string
}

type Key = 'EHK' | 'ALS' | 'CRL' | 'SSG'

const item = (
  file: string,
  kind: PublicMediaPlan['kind'],
  activity: string,
  barangay: string,
  what: string,
  city: string,
): PublicMediaPlan => ({ file, kind, activity, barangay, caption: `${what}, ${barangay}, ${city}` })

/** Public gallery per project, in gallery order; the count follows how far each project has come. */
export const publicMediaPlan: Record<Key, PublicMediaPlan[]> = {
  EHK: [
    ['ehk-kit-packing', 'photo', 'procure', 'Poblacion', 'Packing hygiene and learning kits'],
    ['ehk-kit-contents', 'photo', 'procure', 'Poblacion', 'Hygiene and learning kit contents'],
    ['ehk-kit-loading', 'photo', 'distribute', 'Sulangan', 'Loading kits for delivery'],
    ['ehk-distribution-sulangan', 'photo', 'distribute', 'Sulangan', 'Hygiene kit distribution'],
    ['ehk-distribution-salug', 'photo', 'distribute', 'Salug', 'Hygiene kit distribution'],
    ['ehk-distribution-bungtod', 'photo', 'distribute', 'Bungtod', 'Hygiene kit distribution'],
    ['ehk-kit-handover', 'photo', 'distribute', 'Salug', 'Kit handover to a family'],
    ['ehk-notebooks-in-use', 'photo', 'distribute', 'Bungtod', 'Learners using kit notebooks'],
    ['ehk-distribution-day', 'video', 'distribute', 'Sulangan', 'Distribution day'],
    ['ehk-kit-packing', 'video', 'procure', 'Poblacion', 'Kit packing and loading'],
  ].map(([f, k, a, b, w]) => item(f, k as PublicMediaPlan['kind'], a, b, w, 'Guiuan')),
  ALS: [
    ['als-enrollment-drive', 'photo', 'mapping', 'Macarthur', 'Out-of-school youth enrollment drive'],
    ['als-facilitator-training', 'photo', 'facilitators', 'Poblacion', 'Learning facilitator training'],
    ['als-learning-session', 'photo', 'sessions', 'Del Rosario', 'Community learning center session'],
    ['als-module-work', 'photo', 'sessions', 'San Isidro', 'Learners working on modules'],
    ['als-review-class', 'photo', 'reviewclass', 'Poblacion', 'Equivalency exam review class'],
    ['als-assessment-day', 'photo', 'assessment', 'Poblacion', 'Accreditation and equivalency assessment day'],
    ['als-learning-center', 'video', 'sessions', 'Del Rosario', 'Community learning center sessions'],
  ].map(([f, k, a, b, w]) => item(f, k as PublicMediaPlan['kind'], a, b, w, 'Lavezares')),
  CRL: [
    ['crl-household-assessment', 'photo', 'assessment', 'Bocsol', 'Household livelihood assessment'],
    ['crl-response-team-training', 'photo', 'drrm', 'Dalakit', 'Disaster response team training'],
    ['crl-abaca-livelihood', 'photo', 'livelihood', 'Cawayan', 'Abaca livelihood grant'],
    ['crl-hazard-signage', 'photo', 'hazards', 'Baybay', 'Evacuation signage installation'],
    ['crl-response-team-drill', 'video', 'drrm', 'Dalakit', 'Disaster response team training'],
  ].map(([f, k, a, b, w]) => item(f, k as PublicMediaPlan['kind'], a, b, w, 'Catarman')),
  SSG: [
    ['ssg-barangay-orientation', 'photo', 'orientation', 'Songco', 'Barangay orientation on school safety'],
    ['ssg-baseline-survey', 'photo', 'baseline', 'Maypangdan', 'Baseline household and school survey'],
  ].map(([f, k, a, b, w]) => item(f, k as PublicMediaPlan['kind'], a, b, w, 'Borongan City')),
}

const assetDir = path.join(__dirname, 'assets')

/** The committed file behind one plan item. */
export function publicMediaBytes(entry: PublicMediaPlan) {
  const photo = entry.kind === 'photo'
  const fileName = `${entry.file}${photo ? '.jpg' : '.mp4'}`
  return {
    bytes: readFileSync(path.join(assetDir, photo ? 'demo-photos' : 'demo-videos', fileName)),
    contentType: photo ? ('image/jpeg' as const) : ('video/mp4' as const),
    fileName,
  }
}
