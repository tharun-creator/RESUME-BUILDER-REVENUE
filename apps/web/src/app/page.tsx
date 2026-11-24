import Link from 'next/link';

const plans = [
  { name: 'Free', price: '₹0', note: '1 scan/day, score only', cta: 'Start free', highlight: false },
  { name: 'Starter', price: '₹50', note: '1 full report, 7 days', cta: 'Get Starter', highlight: false },
  { name: 'Pro', price: '₹299', note: '10 scans, 30 days', cta: 'Go Pro', highlight: true },
  { name: 'Premium', price: '₹599', note: '30 scans, 30 days', cta: 'Get Premium', highlight: false },
];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="grid gap-8 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-sm font-medium text-accent-700">India-first ATS resume checker</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Know your ATS score before recruiters do.</h1>
          <p className="mt-4 text-lg text-gray-600">Upload your resume, get a clear score, keyword gaps, and specific fixes you can apply immediately.</p>
          <div className="mt-6 flex gap-3">
            <Link href="/upload" className="rounded-md bg-accent-600 px-5 py-3 text-white no-underline hover:bg-accent-700 hover:text-white">Check your ATS score free</Link>
            <Link href="/pricing" className="rounded-md border border-gray-300 px-5 py-3 no-underline text-gray-900 hover:bg-gray-100">View pricing</Link>
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Sample report preview</div>
          <div className="mt-4 flex items-center gap-6">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-8 border-accent-200 text-2xl font-bold text-accent-700">74</div>
            <div className="space-y-2 text-sm">
              <div>Formatting: <span className="font-medium">20/25</span></div>
              <div>Keywords: <span className="font-medium">16/25</span></div>
              <div>Bullets: <span className="font-medium">14/20</span></div>
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">Top fix: Add missing keywords like "REST API", "TypeScript", "CI/CD" in your experience section.</div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">How it works</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[['1. Upload', 'Upload your PDF or DOCX resume and optionally add a job description.'], ['2. Analyze', 'We run rule checks and AI analysis to score ATS readiness.'], ['3. Improve', 'Get priority fixes, keyword gaps, and rewritten bullets.']].map(([t,d]) => (
            <div key={t} className="rounded-xl border bg-white p-5"><div className="font-medium">{t}</div><p className="mt-2 text-sm text-gray-600">{d}</p></div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Pricing (GST-inclusive)</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {plans.map(p => (
            <div key={p.name} className={`rounded-xl border bg-white p-5 ${p.highlight ? 'border-accent-500 ring-2 ring-accent-200' : ''}`}>
              {p.highlight && <div className="mb-2 inline-block rounded-full bg-accent-100 px-2 py-1 text-xs font-medium text-accent-700">Best value</div>}
              <div className="font-semibold">{p.name}</div>
              <div className="mt-2 text-3xl font-bold">{p.price}</div>
              <p className="mt-2 text-sm text-gray-600">{p.note}</p>
              <Link href="/pricing" className="mt-4 inline-block text-sm font-medium">See details →</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold">FAQ</h2>
          <div className="mt-4 space-y-3 text-sm text-gray-700">
            <p><span className="font-medium">Is this an exact ATS score?</span> No. ATS systems vary; we provide an estimate with explainable checks.</p>
            <p><span className="font-medium">Is my resume safe?</span> Files are handled privately, used only for analysis, and can be deleted on request.</p>
            <p><span className="font-medium">What files are supported?</span> PDF and DOCX, up to 5 MB.</p>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-xl font-semibold">Privacy note</h2>
          <p className="mt-3 text-sm text-gray-600">We collect only what’s needed to analyze your resume. We do not sell your data. You can request deletion from your dashboard. See PRD-aligned privacy controls in the product docs.</p>
        </div>
      </section>
    </div>
  );
}
