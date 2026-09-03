export default function PublicProjectLoading() {
  return (
    <div aria-busy="true" aria-label="Loading public project" className="min-h-screen bg-slate-50">
      <h1 className="sr-only">Loading public project</h1>
      <div className="border-b border-teal-100 bg-teal-50 px-4 py-4 sm:px-6">
        <div className="mx-auto h-5 w-full max-w-6xl animate-pulse rounded bg-teal-100" />
      </div>
      <section className="bg-slate-800">
        <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-12 sm:px-6">
          <div className="h-5 w-44 animate-pulse rounded bg-white/15" />
          <div className="h-12 w-3/4 max-w-2xl animate-pulse rounded bg-white/15" />
          <div className="h-7 w-full max-w-xl animate-pulse rounded bg-white/10" />
          <p className="sr-only">Loading approved public project information.</p>
        </div>
      </section>
      <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-10 sm:px-6 lg:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div
            className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white"
            key={item}
          />
        ))}
      </div>
    </div>
  )
}
