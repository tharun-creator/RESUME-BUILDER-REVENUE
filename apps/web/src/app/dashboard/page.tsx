'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, clearToken } from '@/lib/api';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(()=>{ api<any>('/api/dashboard').then(r=>setData(r.data)).catch(e=>setErr(e.message)); },[]);
  if (err) return <div className="rounded bg-red-50 p-4 text-red-700">{err} <Link href="/auth" className="underline">Sign in</Link></div>;
  if (!data) return <div>Loading...</div>;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Dashboard</h1><button className="text-sm text-gray-600 underline" onClick={()=>{clearToken(); window.location.href='/';}}>Sign out</button></div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-5"><div className="text-sm text-gray-500">Plan</div><div className="text-xl font-semibold">{data.plan?.name || 'Free'}</div></div>
        <div className="rounded-xl border bg-white p-5"><div className="text-sm text-gray-500">Credits remaining</div><div className="text-xl font-semibold">{data.creditsRemaining}</div></div>
        <div className="rounded-xl border bg-white p-5"><div className="text-sm text-gray-500">Scans</div><div className="text-xl font-semibold">{data.scans?.length || 0}</div></div>
      </div>
      <div className="rounded-xl border bg-white p-6">
        <h2 className="font-semibold">Scan history</h2>
        <div className="mt-3 space-y-2">
          {data.scans?.map((s:any)=>(<Link key={s.id} href={s.status==='done'?`/report/${s.id}`:'#'} className="block rounded border p-3 no-underline text-gray-900 hover:bg-gray-50"><div className="flex justify-between"><span className="font-medium">{s.targetRole || 'Resume scan'}</span><span className="text-sm text-gray-500">{s.status} {s.score!=null?`· ${s.score}`:''}</span></div><div className="text-xs text-gray-500">{new Date(s.createdAt).toLocaleString()}</div></Link>))}
          {!data.scans?.length && <p className="text-sm text-gray-500">No scans yet. <Link href="/upload">Run your first scan</Link>.</p>}
        </div>
      </div>
    </div>
  );
}
