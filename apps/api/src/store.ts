import { PLAN_SEED, type Plan, type Scan, type ScanStatus, type ScanStep, type Report } from '@repo/shared';
import { nanoid } from 'nanoid';

export type User = { id: string; email: string; name?: string | null; createdAt: string };
export type Otp = { email: string; code: string; expiresAt: number };
export type CreditWallet = { userId: string; planId: string; remaining: number; expiresAt: string | null };
export type Order = { id: string; userId: string; planId: string; razorpayOrderId: string; amountPaise: number; currency: 'INR'; status: 'created'|'paid'|'failed'|'refunded' };
export type Payment = { id: string; orderId: string; razorpayPaymentId: string; status: 'captured'|'failed'|'refunded'; rawEventId?: string };

export const db = {
  plans: [...PLAN_SEED] as Plan[],
  users: [] as User[],
  otps: [] as Otp[],
  sessions: new Map<string, string>(), // token -> userId
  wallets: [] as CreditWallet[],
  scans: [] as Scan[],
  orders: [] as Order[],
  payments: [] as Payment[],
  webhookEvents: new Set<string>(),
};

export const nowIso = () => new Date().toISOString();
export const id = (p: string) => `${p}_${nanoid(12)}`;

export function getUserByEmail(email: string) { return db.users.find(u => u.email.toLowerCase() === email.toLowerCase()); }
export function ensureUser(email: string) {
  let u = getUserByEmail(email);
  if (!u) { u = { id: id('usr'), email: email.toLowerCase(), createdAt: nowIso() }; db.users.push(u); }
  return u;
}
export function grantPlan(userId: string, planId: string) {
  const plan = db.plans.find(p => p.id === planId || p.slug === planId);
  if (!plan) throw new Error('plan_not_found');
  const expiresAt = plan.validityDays ? new Date(Date.now() + plan.validityDays * 86400000).toISOString() : null;
  const existing = db.wallets.find(w => w.userId === userId && w.planId === plan.id && (w.expiresAt === null || w.expiresAt > nowIso()));
  if (existing) { existing.remaining += plan.scans; existing.expiresAt = expiresAt ?? existing.expiresAt; return existing; }
  const w: CreditWallet = { userId, planId: plan.id, remaining: plan.scans, expiresAt };
  db.wallets.push(w);
  return w;
}
export function getActiveWallet(userId: string) {
  // free daily wallet is virtual; paid wallets here
  return db.wallets.find(w => w.userId === userId && w.remaining > 0 && (!w.expiresAt || w.expiresAt > nowIso()));
}
export function canConsumeScan(userId: string) {
  const paid = getActiveWallet(userId);
  if (paid) return { ok: true, wallet: paid, planSlug: db.plans.find(p=>p.id===paid.planId)?.slug ?? 'starter' };
  // free: 1/day
  const start = new Date(); start.setHours(0,0,0,0);
  const usedToday = db.scans.filter(s => s.userId === userId && s.createdAt >= start.toISOString()).length;
  if (usedToday >= 1) return { ok: false as const, reason: 'free_daily_limit' };
  return { ok: true, wallet: null, planSlug: 'free' as const };
}
export function consumeScan(userId: string) {
  const check = canConsumeScan(userId);
  if (!check.ok) return check;
  if (check.wallet) check.wallet.remaining -= 1;
  return check;
}
export function refundScan(userId: string, planSlug: string) {
  if (planSlug === 'free') return;
  const plan = db.plans.find(p => p.slug === planSlug);
  const w = db.wallets.find(x => x.userId === userId && x.planId === plan?.id);
  if (w) w.remaining += 1;
}

export function upsertScan(scan: Scan) {
  const i = db.scans.findIndex(s => s.id === scan.id);
  if (i >= 0) db.scans[i] = scan; else db.scans.push(scan);
  return scan;
}