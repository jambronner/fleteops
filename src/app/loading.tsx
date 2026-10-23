export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col gap-5">
      <section className="animate-pulse rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
        <div className="h-3 w-24 rounded-full bg-blue-100" />
        <div className="mt-4 h-8 w-72 max-w-full rounded-full bg-blue-200/80" />
        <div className="mt-3 h-4 w-[34rem] max-w-full rounded-full bg-blue-100" />
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"
          >
            <div className="h-3 w-24 rounded-full bg-blue-100" />
            <div className="mt-4 h-8 w-16 rounded-full bg-blue-200/80" />
            <div className="mt-3 h-3 w-28 rounded-full bg-blue-100" />
          </div>
        ))}
      </div>

      <div className="grid flex-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="animate-pulse rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
          <div className="h-5 w-40 rounded-full bg-blue-200/80" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="rounded-xl bg-[#eef3ff] p-4">
                <div className="h-4 w-48 rounded-full bg-blue-100" />
                <div className="mt-3 h-3 w-full rounded-full bg-blue-100" />
              </div>
            ))}
          </div>
        </div>

        <div className="animate-pulse rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
          <div className="h-5 w-32 rounded-full bg-blue-200/80" />
          <div className="mt-5 grid gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index}>
                <div className="h-3 w-28 rounded-full bg-blue-100" />
                <div className="mt-2 h-11 rounded-xl bg-[#eef3ff]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
