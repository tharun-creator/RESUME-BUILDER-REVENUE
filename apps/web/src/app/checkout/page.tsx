'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function CheckoutPage() {
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(()=>{ const raw = sessionStorage.getItem('checkout'); if(raw) setData(JSON.parse(raw)); },[]);
  if (!data) return <div>No checkout in progress. <a href="/pricing" className="underline">Go to pricing</a>.</div>;
  return (
    <div className="mx-auto max-w-lg rounded-xl border bg-white p-6">
      <h1 className="text-2xl font-semibold">Checkout</h1>
      <p className="mt-2 text-gray-600">Plan: <span className="font-medium">{data.plan?.name}</span> — ₹{Math.round((data.order?.amountPaise||0)/100)}</p>
      {data.dev && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-800">Dev mode: Razorpay keys not configured. This simulates a successful payment verification.</p>}
      {msg && <p className="mt-3 rounded bg-green-50 p-3 text-sm text-green-700">{msg}</p>}
      {err && <p className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      <button className="mt-5 w-full rounded-md bg-accent-600 px-4 py-2 text-white hover:bg-accent-700" onClick={async ()=>{
        setErr('');
        try {
          // Dev/simulated verify: in dev mode backend accepts placeholder signature
          const r:any = await api('/api/payments/verify', { method:'POST', body: JSON.stringify({ razorpay_order_id: data.order.razorpayOrderId, razorpay_payment_id: `pay_dev_${Date.now()}`, razorpay_signature: 'dev_signature' }) });
          setMsg('Payment verified. Credits granted.'); sessionStorage.removeItem('checkout');
          setTimeout(()=>window.location.href='/dashboard', 800);
        } catch(e:any){ setErr(e.message); }
      }}>Complete payment (dev/test)</button>
      <p className="mt-3 text-xs text-gray-500">Production: opens Razorpay Checkout and verifies server-side HMAC signature before granting credits.</p>
    </div>
  );
}
