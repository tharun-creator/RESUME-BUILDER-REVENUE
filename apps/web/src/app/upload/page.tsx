'use client';
import { useState } from 'react';
import { api, getToken } from '@/lib/api';

const STEPS = ['Uploading', 'Reading', 'Scoring', 'Writing tips'];

export default function UploadPage() {
  const [file, setFile] = useState<File|null>(null);
  const [jd, setJd] = useState('');
  const [role, setRole] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle'|'running'|'done'|'error'>('idle');
  const [step, setStep] = useState('Uploading');
  const [err, setErr] = useState('');
  const [scanId, setScanId] = useState('');

  async function submit() {
    setErr('');
    if (!getToken()) { window.location.href='/auth'; return; }
    if (!file) return setErr('Please select a PDF or DOCX file.');
    if (file.size > 5*1024*1024) return setErr('Max file size is 5 MB.');
    if (!consent) return setErr('Consent is required to analyze your resume.');
    setStatus('running'); setStep('Uploading');
    try {
      const fd = new FormData(); fd.append('file', file);
      const up:any = await api('/api/uploads', { method:'POST', body: fd });
      setStep('Reading');
      const created:any = await api('/api/scans', { method:'POST', body: JSON.stringify({ fileKey: up.data.fileKey, targetRole: role || undefined, jobDescription: jd || undefined, consent: true }) });
      const id = created.data.scan.id; setScanId(id);
      // poll
      for (let i=0;i<60;i++) {
        await new Promise(r=>setTimeout(r,1500));
        const s:any = await api(`/api/scans/${id}`);
        if (s.data.scan.step) setStep(s.data.scan.step);
        if (s.data.scan.status === 'done') { setStatus('done'); window.location.href=`/report/${id}`; return; }
        if (s.data.scan.status === 'failed') throw new Error(s.data.scan.error || 'Scan failed');
      }
      throw new Error('Timed out waiting for scan');
    } catch(e:any) { setStatus('error'); setErr(e.message); }
  }

  return (
    <div className="mx-auto max-w-2xl rounded-xl border bg-white p-6">
      <h1 className="text-2xl font-semibold">Upload your resume</h1>
      <p className="mt-2 text-sm text-gray-600">PDF or DOCX, max 5 MB. Your data is handled privately.</p>
      {err && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      <label className="mt-4 block text-sm font-medium">Resume file</label>
      <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="mt-1 w-full rounded-md border px-3 py-2" onChange={e=>setFile(e.target.files?.[0]||null)} />
      <label className="mt-4 block text-sm font-medium">Target role (optional)</label>
      <input className="mt-1 w-full rounded-md border px-3 py-2" value={role} onChange={e=>setRole(e.target.value)} />
      <label className="mt-4 block text-sm font-medium">Job description (optional)</label>
      <textarea className="mt-1 w-full rounded-md border px-3 py-2" rows={5} value={jd} onChange={e=>setJd(e.target.value)} />
      <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} /> I consent to processing this resume for ATS analysis.</label>
      <button disabled={status==='running'} className="mt-5 rounded-md bg-accent-600 px-5 py-2 text-white hover:bg-accent-700 disabled:opacity-50" onClick={submit}>{status==='running'?'Analyzing...':'Analyze resume'}</button>
      {status==='running' && <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm"><div className="font-medium">Analyzing</div><ul className="mt-2 space-y-1">{STEPS.map(s=><li key={s} className={s===step?'text-accent-700 font-medium':'text-gray-500'}>{s===step?'• ':''}{s}</li>)}</ul></div>}
    </div>
  );
}
