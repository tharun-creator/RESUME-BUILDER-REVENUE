'use client';
import { useState } from 'react';
import { api, setToken } from '@/lib/api';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-white p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-gray-600">Email OTP sign-in. In dev, OTP is logged by the API server.</p>
      {msg && <p className="mt-3 rounded bg-green-50 p-2 text-sm text-green-700">{msg}</p>}
      {err && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      <label className="mt-4 block text-sm font-medium">Email</label>
      <input className="mt-1 w-full rounded-md border px-3 py-2" value={email} onChange={e=>setEmail(e.target.value)} type="email" />
      {!sent ? (
        <button className="mt-4 w-full rounded-md bg-accent-600 px-4 py-2 text-white hover:bg-accent-700" onClick={async ()=>{ setErr(''); try { await api('/api/auth/otp/request',{method:'POST',body:JSON.stringify({email})}); setSent(true); setMsg('OTP sent. Check your email (or API console in dev).'); } catch(e:any){ setErr(e.message);} }}>Send OTP</button>
      ) : (
        <>
          <label className="mt-4 block text-sm font-medium">OTP code</label>
          <input className="mt-1 w-full rounded-md border px-3 py-2" value={code} onChange={e=>setCode(e.target.value)} />
          <button className="mt-4 w-full rounded-md bg-accent-600 px-4 py-2 text-white hover:bg-accent-700" onClick={async ()=>{ setErr(''); try { const r:any = await api('/api/auth/otp/verify',{method:'POST',body:JSON.stringify({email,code})}); setToken(r.data.token); window.location.href='/dashboard'; } catch(e:any){ setErr(e.message);} }}>Verify & continue</button>
        </>
      )}
    </div>
  );
}
