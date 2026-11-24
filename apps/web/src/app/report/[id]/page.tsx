'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => { if(params?.id) api<any>(`/api/scans/${params.id}/report`).then(r=>setData(r.data)).catch(e=>setErr(e.message)); }, [params?.id]);
  if (err) return <div className="rounded bg-red-50 p-4 text-red-700">{err}</div>;
  if (!data) return <div>Loading report...</div>;
  const r = data.report;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex h-28 w-28 items-center justify-center rounded-full border-8 border-accent-200 text-3xl font-bold text-accent-700">{r.overallScore}</div>
          <div>
            <h1 className="text-2xl font-semibold">ATS Report</h1>
            <p className="text-gray-600">{r.summary}</p>
            <button disabled className="mt-3 rounded-md border px-3 py-2 text-sm text-gray-400" title="Phase 2">Download PDF (Phase 2)</button>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-5">
        {Object.entries(r.subScores).map(([k,v]:any)=>(
          <div key={k} className="rounded-lg border bg-white p-4"><div className="text-sm text-gray-500">{k}</div><div className="text-xl font-semibold">{v}</div></div>
        ))}
      </div>
      <div className="rounded-xl border bg-white p-6">
        <h2 className="font-semibold">Top priority fixes</h2>
        <ul className="mt-3 space-y-2">{r.topFixes.map((f:any,i:number)=><li key={i} className="rounded bg-gray-50 p-3 text-sm"><span className="font-medium">{f.title}</span> <span className="text-gray-500">({f.impact})</span><div className="text-gray-600">{f.detail}</div></li>)}</ul>
      </div>
      <div className="rounded-xl border bg-white p-6">
        <h2 className="font-semibold">Keyword gaps</h2>
        <div className="mt-3 flex flex-wrap gap-2">{r.keywordGaps?.length ? r.keywordGaps.map((k:string)=><span key={k} className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">{k}</span>) : <span className="text-sm text-gray-500">No major gaps detected.</span>}</div>
      </div>
      <div className="rounded-xl border bg-white p-6">
        <h2 className="font-semibold">Before / after bullet rewrites</h2>
        <div className="mt-3 space-y-3">{r.bulletRewrites.map((b:any,i:number)=><div key={i} className="grid gap-2 md:grid-cols-2 text-sm"><div className="rounded bg-red-50 p-3"><div className="text-xs font-medium text-red-700">Before</div>{b.before}</div><div className="rounded bg-green-50 p-3"><div className="text-xs font-medium text-green-700">After</div>{b.after}</div></div>)}</div>
      </div>
    </div>
  );
}
