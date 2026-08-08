export default function PublicLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading public dashboard"
      className="min-h-screen bg-slate-50"
    >
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-10 sm:px-6">
          <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-12 w-3/4 max-w-2xl animate-pulse rounded bg-slate-200" />
          <div className="h-6 w-full max-w-xl animate-pulse rounded bg-slate-100" />
          <p className="sr-only">Loading approved public project information.</p>
        </div>
      </section>
      <section className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-10 sm:px-6 md:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div
            className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white"
            key={item}
          />
        ))}
      </section>
    </main>
  )
}
