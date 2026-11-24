'use client';
import { useEffect, useState } from 'react';
import { api, getToken } from '@/lib/api';

type Plan = { id: string; name: string; slug: string; pricePaise: number; validityDays: number|null; scans: number; badge?: string|null; features: Record<string, any> };

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { api<{ok:true;data:{plans:Plan[]}}>('/api/plans').then(r=>setPlans(r.data.plans)).catch(e=>setErr(e.message)); }, []);
  return (
    <div>
      <h1 className="text-3xl font-bold">Pricing</h1>
      <p className="mt-2 text-gray-600">GST-inclusive. Prepaid packs, no auto-renewal in v1.</p>
      {err && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{err} (showing may require API running)</p>}
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {plans.map(p => (
          <div key={p.id} className={`rounded-xl border bg-white p-5 ${p.badge ? 'border-accent-500 ring-2 ring-accent-200' : ''}`}>
            {p.badge && <div className="mb-2 inline-block rounded-full bg-accent-100 px-2 py-1 text-xs font-medium text-accent-700">{p.badge}</div>}
            <div className="font-semibold">{p.name}</div>
            <div className="mt-2 text-3xl font-bold">₹{Math.round(p.pricePaise/100)}</div>
            <div className="mt-1 text-sm text-gray-500">{p.validityDays ? `${p.validityDays} days` : 'Daily free'}</div>
            <ul className="mt-4 space-y-1 text-sm text-gray-700">
              <li>{p.scans} scan{p.scans>1?'s':''} {p.slug==='free' ? 'per day' : ''}</li>
              <li>ATS score: {p.features.atsScore ? 'Yes' : 'No'}</li>
              <li>Section breakdown: {p.features.sectionBreakdown ? 'Yes' : 'No'}</li>
              <li>PDF download: {p.features.pdfDownload ? 'Yes' : 'No'}</li>
            </ul>
            <button onClick={async ()=>{
              if (!getToken()) { window.location.href='/auth'; return; }
              const r = await api<any>('/api/checkout', { method:'POST', body: JSON.stringify({ planId: p.id }) });
              if (r.data.free) { window.location.href='/dashboard'; return; }
              // Dev: go to checkout page with order info
              sessionStorage.setItem('checkout', JSON.stringify(r.data));
              window.location.href='/checkout';
            }} className="mt-5 w-full rounded-md bg-accent-600 px-4 py-2 text-white hover:bg-accent-700">{p.pricePaise===0?'Use Free':'Buy plan'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
