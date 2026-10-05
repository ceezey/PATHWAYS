import type { ProjectMapPlace } from '@pathways/shared'

type Row = readonly [name: string, longitude: number, latitude: number]
type CityRow = readonly [name: string, province: string, longitude: number, latitude: number]

/** Approximate Philippine province centroids (longitude, latitude), bundled so no geocoder key is needed. */
const provinces: readonly Row[] = [
  ['Abra', 120.73, 17.57],
  ['Agusan del Norte', 125.53, 8.95],
  ['Agusan del Sur', 125.85, 8.5],
  ['Aklan', 122.25, 11.65],
  ['Albay', 123.58, 13.17],
  ['Antique', 122.05, 11.17],
  ['Apayao', 121.17, 18.03],
  ['Aurora', 121.55, 15.98],
  ['Basilan', 122.0, 6.55],
  ['Bataan', 120.45, 14.65],
  ['Batanes', 121.97, 20.45],
  ['Batangas', 121.05, 13.85],
  ['Benguet', 120.65, 16.5],
  ['Biliran', 124.47, 11.58],
  ['Bohol', 124.15, 9.85],
  ['Bukidnon', 125.0, 8.05],
  ['Bulacan', 121.0, 14.95],
  ['Cagayan', 121.8, 18.25],
  ['Camarines Norte', 122.75, 14.15],
  ['Camarines Sur', 123.3, 13.55],
  ['Camiguin', 124.72, 9.17],
  ['Capiz', 122.65, 11.45],
  ['Catanduanes', 124.25, 13.75],
  ['Cavite', 120.9, 14.25],
  ['Cebu', 123.85, 10.35],
  ['Cotabato', 124.85, 7.2],
  ['Davao de Oro', 126.05, 7.55],
  ['Davao del Norte', 125.7, 7.45],
  ['Davao del Sur', 125.35, 6.85],
  ['Davao Occidental', 125.55, 6.05],
  ['Davao Oriental', 126.3, 7.3],
  ['Dinagat Islands', 125.6, 10.15],
  ['Eastern Samar', 125.45, 11.55],
  ['Guimaras', 122.6, 10.58],
  ['Ifugao', 121.1, 16.85],
  ['Ilocos Norte', 120.7, 18.15],
  ['Ilocos Sur', 120.55, 17.25],
  ['Iloilo', 122.55, 10.95],
  ['Isabela', 121.9, 16.95],
  ['Kalinga', 121.35, 17.45],
  ['La Union', 120.4, 16.55],
  ['Laguna', 121.35, 14.25],
  ['Lanao del Norte', 123.9, 7.95],
  ['Lanao del Sur', 124.3, 7.8],
  ['Leyte', 124.85, 10.85],
  ['Maguindanao del Norte', 124.3, 7.25],
  ['Maguindanao del Sur', 124.5, 6.9],
  ['Maguindanao', 124.4, 7.05],
  ['Marinduque', 121.95, 13.4],
  ['Masbate', 123.4, 12.25],
  ['Metro Manila', 121.03, 14.6],
  ['Misamis Occidental', 123.65, 8.35],
  ['Misamis Oriental', 124.8, 8.55],
  ['Mountain Province', 121.1, 17.05],
  ['Negros Occidental', 122.95, 10.4],
  ['Negros Oriental', 123.05, 9.6],
  ['Northern Samar', 124.65, 12.4],
  ['Nueva Ecija', 121.05, 15.6],
  ['Nueva Vizcaya', 121.1, 16.3],
  ['Occidental Mindoro', 120.95, 13.1],
  ['Oriental Mindoro', 121.35, 13.05],
  ['Palawan', 118.75, 9.8],
  ['Pampanga', 120.65, 15.05],
  ['Pangasinan', 120.35, 15.9],
  ['Quezon', 122.0, 14.0],
  ['Quirino', 121.55, 16.3],
  ['Rizal', 121.25, 14.6],
  ['Romblon', 122.25, 12.55],
  ['Samar', 125.0, 11.85],
  ['Sarangani', 125.2, 5.95],
  ['Siquijor', 123.55, 9.2],
  ['Sorsogon', 123.95, 12.85],
  ['South Cotabato', 124.85, 6.3],
  ['Southern Leyte', 125.05, 10.3],
  ['Sultan Kudarat', 124.45, 6.55],
  ['Sulu', 121.1, 6.0],
  ['Surigao del Norte', 125.75, 9.75],
  ['Surigao del Sur', 126.05, 8.6],
  ['Tarlac', 120.55, 15.5],
  ['Tawi-Tawi', 119.95, 5.15],
  ['Zambales', 120.1, 15.3],
  ['Zamboanga del Norte', 122.85, 8.15],
  ['Zamboanga del Sur', 123.3, 7.8],
  ['Zamboanga Sibugay', 122.7, 7.7],
]

/** Province aliases people commonly write in implementation areas. */
const provinceAliases: Readonly<Record<string, string>> = {
  NCR: 'Metro Manila',
  'National Capital Region': 'Metro Manila',
  'Western Samar': 'Samar',
  'Compostela Valley': 'Davao de Oro',
  'North Cotabato': 'Cotabato',
}

/** Cities and municipalities with approximate town-center coordinates. */
const cities: readonly CityRow[] = [
  ['Manila', 'Metro Manila', 120.98, 14.6],
  ['Quezon City', 'Metro Manila', 121.04, 14.68],
  ['Caloocan', 'Metro Manila', 120.98, 14.65],
  ['Las Piñas', 'Metro Manila', 120.98, 14.45],
  ['Makati', 'Metro Manila', 121.03, 14.55],
  ['Malabon', 'Metro Manila', 120.96, 14.66],
  ['Mandaluyong', 'Metro Manila', 121.03, 14.58],
  ['Marikina', 'Metro Manila', 121.1, 14.65],
  ['Muntinlupa', 'Metro Manila', 121.04, 14.41],
  ['Navotas', 'Metro Manila', 120.94, 14.67],
  ['Parañaque', 'Metro Manila', 121.02, 14.48],
  ['Pasay', 'Metro Manila', 121.0, 14.54],
  ['Pasig', 'Metro Manila', 121.08, 14.57],
  ['Pateros', 'Metro Manila', 121.07, 14.54],
  ['Taguig', 'Metro Manila', 121.05, 14.52],
  ['Valenzuela', 'Metro Manila', 120.98, 14.7],
  ['Baguio', 'Benguet', 120.59, 16.41],
  ['Laoag', 'Ilocos Norte', 120.59, 18.2],
  ['Vigan', 'Ilocos Sur', 120.39, 17.57],
  ['San Fernando', 'La Union', 120.32, 16.62],
  ['Dagupan', 'Pangasinan', 120.34, 16.04],
  ['Tuguegarao', 'Cagayan', 121.73, 17.61],
  ['Ilagan', 'Isabela', 121.89, 17.15],
  ['Santiago', 'Isabela', 121.55, 16.69],
  ['Cabanatuan', 'Nueva Ecija', 120.97, 15.49],
  ['Angeles', 'Pampanga', 120.59, 15.15],
  ['San Fernando', 'Pampanga', 120.69, 15.03],
  ['Olongapo', 'Zambales', 120.28, 14.83],
  ['Malolos', 'Bulacan', 120.81, 14.84],
  ['Antipolo', 'Rizal', 121.18, 14.59],
  ['Calamba', 'Laguna', 121.17, 14.21],
  ['Santa Rosa', 'Laguna', 121.11, 14.31],
  ['San Pablo', 'Laguna', 121.33, 14.07],
  ['Batangas City', 'Batangas', 121.06, 13.76],
  ['Lipa', 'Batangas', 121.16, 13.94],
  ['Lucena', 'Quezon', 121.62, 13.93],
  ['Tagaytay', 'Cavite', 120.96, 14.1],
  ['Dasmariñas', 'Cavite', 120.94, 14.33],
  ['Bacoor', 'Cavite', 120.96, 14.46],
  ['Imus', 'Cavite', 120.94, 14.43],
  ['Puerto Princesa', 'Palawan', 118.74, 9.74],
  ['Calapan', 'Oriental Mindoro', 121.18, 13.41],
  ['Daet', 'Camarines Norte', 122.95, 14.11],
  ['Naga', 'Camarines Sur', 123.18, 13.62],
  ['Legazpi', 'Albay', 123.74, 13.14],
  ['Virac', 'Catanduanes', 124.23, 13.58],
  ['Sorsogon City', 'Sorsogon', 124.0, 12.97],
  ['Masbate City', 'Masbate', 123.62, 12.37],
  ['Iloilo City', 'Iloilo', 122.56, 10.72],
  ['Roxas City', 'Capiz', 122.75, 11.59],
  ['Kalibo', 'Aklan', 122.37, 11.71],
  ['Bacolod', 'Negros Occidental', 122.95, 10.68],
  ['Dumaguete', 'Negros Oriental', 123.31, 9.31],
  ['Cebu City', 'Cebu', 123.89, 10.32],
  ['Lapu-Lapu', 'Cebu', 123.95, 10.31],
  ['Mandaue', 'Cebu', 123.94, 10.33],
  ['Tagbilaran', 'Bohol', 123.85, 9.65],
  ['Tacloban', 'Leyte', 125.0, 11.24],
  ['Ormoc', 'Leyte', 124.61, 11.01],
  ['Palo', 'Leyte', 124.99, 11.16],
  ['Maasin', 'Southern Leyte', 124.84, 10.13],
  ['Naval', 'Biliran', 124.4, 11.56],
  ['Catbalogan', 'Samar', 124.88, 11.78],
  ['Calbayog', 'Samar', 124.6, 12.07],
  ['Borongan', 'Eastern Samar', 125.43, 11.61],
  ['Guiuan', 'Eastern Samar', 125.72, 11.03],
  ['Llorente', 'Eastern Samar', 125.55, 11.41],
  ['Catarman', 'Northern Samar', 124.64, 12.5],
  ['Lavezares', 'Northern Samar', 124.33, 12.53],
  ['Surigao City', 'Surigao del Norte', 125.49, 9.79],
  ['Tandag', 'Surigao del Sur', 126.2, 9.08],
  ['Butuan', 'Agusan del Norte', 125.54, 8.95],
  ['Cagayan de Oro', 'Misamis Oriental', 124.65, 8.48],
  ['Iligan', 'Lanao del Norte', 124.24, 8.23],
  ['Marawi', 'Lanao del Sur', 124.29, 8.0],
  ['Malaybalay', 'Bukidnon', 125.13, 8.15],
  ['Davao City', 'Davao del Sur', 125.61, 7.07],
  ['Tagum', 'Davao del Norte', 125.81, 7.45],
  ['Mati', 'Davao Oriental', 126.22, 6.95],
  ['General Santos', 'South Cotabato', 125.17, 6.11],
  ['Koronadal', 'South Cotabato', 124.85, 6.5],
  ['Kidapawan', 'Cotabato', 125.09, 7.01],
  ['Cotabato City', 'Maguindanao del Norte', 124.25, 7.22],
  ['Zamboanga City', 'Zamboanga del Sur', 122.08, 6.91],
  ['Pagadian', 'Zamboanga del Sur', 123.44, 7.83],
  ['Dipolog', 'Zamboanga del Norte', 123.34, 8.59],
  ['Isabela City', 'Basilan', 121.97, 6.7],
  ['Jolo', 'Sulu', 121.0, 6.05],
]

const normalize = (text: string) =>
  ` ${text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, ' ')
    .trim()} `

const byLongestName = <T extends readonly [string, ...unknown[]]>(rows: readonly T[]) =>
  [...rows].sort((left, right) => right[0].length - left[0].length)

const cityIndex = byLongestName(cities).map((row) => ({ row, key: normalize(row[0]) }))
const provinceIndex = byLongestName([
  ...provinces.map((row) => [row[0], row[0]] as const),
  ...Object.entries(provinceAliases),
]).map(([alias, name]) => ({ name, key: normalize(alias) }))
const provinceCentroids = new Map(provinces.map((row) => [row[0], row]))

/** Consumes every whole-word occurrence of `key`, returning the remaining text or null. */
const take = (text: string, key: string) => (text.includes(key) ? text.split(key).join(' ') : null)

/**
 * Resolves free-text implementation areas to bundled centroids: named cities first,
 * falling back to province centroids; unknown text resolves to nothing, never a guess.
 */
export function resolvePlaces(area: string | null | undefined): ProjectMapPlace[] {
  if (!area?.trim()) return []
  let text = normalize(area)
  const matchedCities: CityRow[] = []
  for (const { row, key } of cityIndex) {
    const rest = take(text, key)
    if (rest === null) continue
    matchedCities.push(row)
    // Keep duplicated names (San Fernando) in the text until every province variant is checked.
    if (!cityIndex.some((other) => other.row !== row && other.key === key)) text = rest
  }
  const mentioned = new Set<string>()
  for (const { name, key } of provinceIndex) {
    const rest = take(text, key)
    if (rest === null) continue
    mentioned.add(name)
    text = rest
  }
  // A duplicated name (San Fernando) needs its province named; a unique name stands alone.
  const cityPlaces = matchedCities.filter(
    (row) =>
      mentioned.has(row[1]) || matchedCities.filter((other) => other[0] === row[0]).length === 1,
  )
  const places = cityPlaces.map(([name, province, longitude, latitude]) => ({
    name,
    province,
    longitude,
    latitude,
  }))
  const coveredProvinces = new Set(cityPlaces.map((row) => row[1]))
  for (const province of mentioned) {
    const centroid = provinceCentroids.get(province)
    if (!centroid || coveredProvinces.has(province)) continue
    places.push({ name: province, province, longitude: centroid[1], latitude: centroid[2] })
  }
  return places.slice(0, 20)
}
