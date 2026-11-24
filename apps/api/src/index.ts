import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { PLAN_SEED, OtpRequestSchema, OtpVerifySchema, CreateScanSchema, CheckoutRequestSchema, PaymentVerifySchema, type Scan } from '@repo/shared';
import { db, id, nowIso, ensureUser, grantPlan, canConsumeScan, consumeScan, refundScan, upsertScan } from './store.js';
import { scoreResume } from './scoring.js';
import { extractText } from './extract.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const APP_BASE = process.env.APP_BASE_URL || 'http://localhost:3000';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.use(helmet());
app.use(cors({ origin: APP_BASE, credentials: true }));
app.use('/api/webhooks/razorpay', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));

type AuthedReq = express.Request & { userId?: string; userEmail?: string };
function auth(req: AuthedReq, res: express.Response, next: express.NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: { code: 'unauthorized', message: 'Missing auth token' } });
  const userId = db.sessions.get(token);
  if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid session' } });
  const user = db.users.find(u => u.id === userId);
  req.userId = userId; req.userEmail = user?.email;
  next();
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(keyFn: (req: express.Request)=>string, limit: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = keyFn(req);
    const now = Date.now();
    const b = rateBuckets.get(key);
    if (!b || b.resetAt <= now) { rateBuckets.set(key, { count: 1, resetAt: now + windowMs }); return next(); }
    if (b.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests', details: { retry_after_seconds: retryAfter } } });
    }
    b.count += 1; next();
  };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, data: { status: 'ok', time: nowIso() } }));
app.get('/api/plans', (_req, res) => res.json({ ok: true, data: { plans: db.plans.filter(p => p.active) } }));

app.post('/api/auth/otp/request', rateLimit(r => `otp:${r.ip}:${(r.body?.email||'').toLowerCase()}`, 3, 10*60*1000), (req, res) => {
  const parsed = OtpRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'invalid_input', message: 'Valid email required' } });
  const email = parsed.data.email.toLowerCase();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.otps.push({ email, code, expiresAt: Date.now() + 10*60*1000 });
  // Dev fallback: log OTP when email provider not configured (PRD allows Resend; dev fallback documented)
  if (!process.env.RESEND_API_KEY) console.log(`[DEV OTP] ${email} -> ${code}`);
  return res.json({ ok: true, data: { sent: true, dev: !process.env.RESEND_API_KEY } });
});

app.post('/api/auth/otp/verify', rateLimit(r => `otp-verify:${r.ip}`, 10, 15*60*1000), (req, res) => {
  const parsed = OtpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'invalid_input', message: 'Email and code required' } });
  const { email, code } = parsed.data;
  const match = db.otps.find(o => o.email === email.toLowerCase() && o.code === code && o.expiresAt > Date.now());
  if (!match) return res.status(401).json({ error: { code: 'invalid_otp', message: 'Invalid or expired code' } });
  db.otps = db.otps.filter(o => !(o.email === email.toLowerCase() && o.code === code));
  const user = ensureUser(email);
  const token = id('sess');
  db.sessions.set(token, user.id);
  return res.json({ ok: true, data: { token, user: { id: user.id, email: user.email } } });
});

app.get('/api/auth/me', auth, (req: AuthedReq, res) => {
  const user = db.users.find(u => u.id === req.userId);
  return res.json({ ok: true, data: { user } });
});

const TMP = path.resolve(process.cwd(), 'tmp/uploads');
async function ensureTmp() { await fs.mkdir(TMP, { recursive: true }); }

app.post('/api/uploads', auth, upload.single('file'), async (req: AuthedReq, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: { code: 'missing_file', message: 'Resume file required' } });
  const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (!allowed.includes(file.mimetype)) return res.status(400).json({ error: { code: 'invalid_file_type', message: 'Only PDF or DOCX allowed' } });
  if (file.size > 5 * 1024 * 1024) return res.status(400).json({ error: { code: 'file_too_large', message: 'Max 5 MB' } });
  await ensureTmp();
  const ext = file.mimetype === 'application/pdf' ? 'pdf' : 'docx';
  const fileKey = `${id('file')}.${ext}`;
  await fs.writeFile(path.join(TMP, fileKey), file.buffer);
  return res.json({ ok: true, data: { fileKey, sizeBytes: file.size, mime: file.mimetype } });
});

async function processScan(scan: Scan, fileKey: string, jobDescription?: string) {
  try {
    scan.status = 'processing'; scan.step = 'Reading'; scan.updatedAt = nowIso(); upsertScan(scan);
    const filePath = path.join(TMP, fileKey);
    const text = await extractText(filePath, fileKey.endsWith('.pdf') ? 'pdf' : 'docx');
    scan.step = 'Scoring'; scan.updatedAt = nowIso(); upsertScan(scan);
    const report = scoreResume(text, jobDescription);
    scan.step = 'Writing tips'; scan.updatedAt = nowIso(); upsertScan(scan);
    scan.status = 'done'; scan.step = 'Done'; scan.score = report.overallScore; scan.report = report; scan.updatedAt = nowIso(); upsertScan(scan);
  } catch (e: any) {
    scan.status = 'failed'; scan.error = e?.message || 'processing_failed'; scan.updatedAt = nowIso(); upsertScan(scan);
    refundScan(scan.userId, (scan as any).planSlug || 'free');
  }
}

app.post('/api/scans', auth, rateLimit(r => `scan:${(r as AuthedReq).userId||r.ip}`, 10, 60*60*1000), async (req: AuthedReq, res) => {
  const parsed = CreateScanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'invalid_input', message: 'Invalid scan request', details: parsed.error.flatten() } });
  const { fileKey, targetRole, jobDescription } = parsed.data;
  const consumed = consumeScan(req.userId!);
  if (!consumed.ok) {
    res.setHeader('Retry-After', '3600');
    return res.status(429).json({ error: { code: 'free_daily_limit', message: 'Free daily scan limit reached', details: { retry_after_seconds: 3600 } } });
  }
  const scan: Scan = { id: id('scan'), userId: req.userId!, status: 'queued', step: 'Uploading', score: null, report: null, targetRole: targetRole || null, jdHash: jobDescription ? crypto.createHash('sha256').update(jobDescription).digest('hex') : null, error: null, createdAt: nowIso(), updatedAt: nowIso() };
  (scan as any).planSlug = consumed.planSlug;
  upsertScan(scan);
  setImmediate(() => processScan(scan, fileKey, jobDescription));
  return res.status(202).json({ ok: true, data: { scan: { id: scan.id, status: scan.status, step: scan.step } } });
});

app.get('/api/scans/:id', auth, (req: AuthedReq, res) => {
  const scan = db.scans.find(s => s.id === req.params.id && s.userId === req.userId);
  if (!scan) return res.status(404).json({ error: { code: 'not_found', message: 'Scan not found' } });
  return res.json({ ok: true, data: { scan: { id: scan.id, status: scan.status, step: scan.step, score: scan.score, error: scan.error, updatedAt: scan.updatedAt } } });
});

app.get('/api/scans/:id/report', auth, (req: AuthedReq, res) => {
  const scan = db.scans.find(s => s.id === req.params.id && s.userId === req.userId);
  if (!scan) return res.status(404).json({ error: { code: 'not_found', message: 'Scan not found' } });
  if (scan.status !== 'done' || !scan.report) return res.status(409).json({ error: { code: 'report_not_ready', message: 'Report not ready' } });
  return res.json({ ok: true, data: { scan, report: scan.report } });
});

app.get('/api/dashboard', auth, (req: AuthedReq, res) => {
  const scans = db.scans.filter(s => s.userId === req.userId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const wallet = db.wallets.find(w => w.userId === req.userId && w.remaining > 0 && (!w.expiresAt || w.expiresAt > nowIso()));
  const plan = wallet ? db.plans.find(p => p.id === wallet.planId) : db.plans.find(p => p.slug === 'free');
  return res.json({ ok: true, data: { plan, creditsRemaining: wallet?.remaining ?? (canConsumeScan(req.userId!).ok ? 1 : 0), scans } });
});

function rzpSecret() { return process.env.RAZORPAY_KEY_SECRET || ''; }
function rzpKeyId() { return process.env.RAZORPAY_KEY_ID || ''; }

app.post('/api/checkout', auth, async (req: AuthedReq, res) => {
  const parsed = CheckoutRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'invalid_input', message: 'planId required' } });
  const plan = db.plans.find(p => p.id === parsed.data.planId || p.slug === parsed.data.planId);
  if (!plan) return res.status(404).json({ error: { code: 'plan_not_found', message: 'Plan not found' } });
  if (plan.pricePaise === 0) { grantPlan(req.userId!, plan.id); return res.json({ ok: true, data: { free: true, plan } }); }
  if (!rzpKeyId() || !rzpSecret() || rzpSecret().startsWith('replace')) {
    // Dev-mode mock order so UI flow is testable without live keys
    if (process.env.NODE_ENV !== 'production') {
      const order = { id: id('ord'), userId: req.userId!, planId: plan.id, razorpayOrderId: `order_dev_${nanoid(10)}`, amountPaise: plan.pricePaise, currency: 'INR' as const, status: 'created' as const };
      db.orders.push(order);
      return res.json({ ok: true, data: { order, razorpayKeyId: 'rzp_test_dev', plan, dev: true } });
    }
    return res.status(503).json({ error: { code: 'payments_not_configured', message: 'Razorpay keys not configured' } });
  }
  // Real Razorpay order creation would go here (fetch to Razorpay API). For MVP skeleton, create local order record.
  const order = { id: id('ord'), userId: req.userId!, planId: plan.id, razorpayOrderId: `order_${nanoid(14)}`, amountPaise: plan.pricePaise, currency: 'INR' as const, status: 'created' as const };
  db.orders.push(order);
  return res.json({ ok: true, data: { order, razorpayKeyId: rzpKeyId(), plan } });
});

app.post('/api/payments/verify', auth, (req: AuthedReq, res) => {
  const parsed = PaymentVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'invalid_input', message: 'Missing payment fields' } });
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;
  const order = db.orders.find(o => o.razorpayOrderId === razorpay_order_id && o.userId === req.userId);
  if (!order) return res.status(404).json({ error: { code: 'order_not_found', message: 'Order not found' } });
  const secret = rzpSecret();
  const devMode = process.env.NODE_ENV !== 'production' && (!secret || secret.startsWith('replace'));
  if (!devMode) {
    const expected = crypto.createHmac('sha256', secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if (expected !== razorpay_signature) return res.status(400).json({ error: { code: 'invalid_signature', message: 'Payment signature verification failed' } });
  }
  if (db.payments.some(p => p.razorpayPaymentId === razorpay_payment_id)) {
    return res.json({ ok: true, data: { alreadyProcessed: true } });
  }
  db.payments.push({ id: id('pay'), orderId: order.id, razorpayPaymentId: razorpay_payment_id, status: 'captured' });
  order.status = 'paid';
  grantPlan(order.userId, order.planId);
  return res.json({ ok: true, data: { verified: true, planId: order.planId } });
});

app.post('/api/webhooks/razorpay', (req, res) => {
  // Signature verification required in prod; idempotent by event id.
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  const sig = req.headers['x-razorpay-signature'];
  if (process.env.NODE_ENV === 'production') {
    const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
    if (expected !== sig) return res.status(400).json({ error: { code: 'invalid_signature', message: 'Invalid webhook signature' } });
  }
  let event: any;
  try { event = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).json({ error: { code: 'invalid_json', message: 'Invalid JSON' } }); }
  if (event?.id && db.webhookEvents.has(event.id)) return res.json({ ok: true, data: { duplicate: true } });
  if (event?.id) db.webhookEvents.add(event.id);
  // Handle payment.captured / payment.failed / refund.processed (minimal)
  return res.json({ ok: true, data: { received: true } });
});

app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));