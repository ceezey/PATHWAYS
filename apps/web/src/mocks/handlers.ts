import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get(/.*\/api\/auth\/status$/, () =>
    HttpResponse.json({
      provider: 'supabase-auth',
      jwtVerificationEnabled: false,
      callbackPlaceholder: '/auth/callback',
    }),
  ),
  http.get(/.*\/api\/participants$/, () =>
    HttpResponse.json([
      { id: 'P-001', fullName: 'Ariella Santos', program: 'Youth Livelihoods', status: 'Active' },
    ]),
  ),
  http.get(/.*\/api\/imports$/, () =>
    HttpResponse.json({
      batches: [{ id: 'upload-001', status: 'pending', fileName: 'participants.csv' }],
    }),
  ),
  http.get(/.*\/api\/dashboards\/overview$/, () =>
    HttpResponse.json({ programs: 3, registryRecords: 124, pendingImports: 7 }),
  ),
]
