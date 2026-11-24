import { z } from 'zod';

export const PlanSlugSchema = z.enum(['free', 'starter', 'pro', 'premium']);
export type PlanSlug = z.infer<typeof PlanSlugSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  slug: PlanSlugSchema,
  name: z.string(),
  pricePaise: z.number().int().nonnegative(),
  currency: z.literal('INR'),
  validityDays: z.number().int().positive().nullable(),
  scans: z.number().int().positive(),
  scanReset: z.enum(['daily', 'pack']),
  features: z.record(z.unknown()),
  badge: z.string().nullable().optional(),
  active: z.boolean().default(true),
});
export type Plan = z.infer<typeof PlanSchema>;

// PRD §5 seed data - used by DB seed/mocks; application reads from plans table in prod.
export const PLAN_SEED: Plan[] = [
  { id: 'plan_free', slug: 'free', name: 'Free', pricePaise: 0, currency: 'INR', validityDays: null, scans: 1, scanReset: 'daily', badge: null, active: true, features: { atsScore: true, sectionBreakdown: false, keywordGap: 'top_3', jdMatching: false, aiBullets: false, coverLetter: false, linkedinTips: false, pdfDownload: false, emailReport: false, priority: false } },
  { id: 'plan_starter', slug: 'starter', name: 'Starter', pricePaise: 5000, currency: 'INR', validityDays: 7, scans: 1, scanReset: 'pack', badge: null, active: true, features: { atsScore: true, sectionBreakdown: true, keywordGap: true, jdMatching: false, aiBullets: '5_bullets', coverLetter: false, linkedinTips: false, pdfDownload: true, emailReport: true, priority: false } },
  { id: 'plan_pro', slug: 'pro', name: 'Pro', pricePaise: 29900, currency: 'INR', validityDays: 30, scans: 10, scanReset: 'pack', badge: 'Best value', active: true, features: { atsScore: true, sectionBreakdown: true, keywordGap: true, jdMatching: { enabled: true, jdLimit: 10 }, aiBullets: 'full_resume', coverLetter: false, linkedinTips: 'basic', pdfDownload: true, emailReport: true, priority: false } },
  { id: 'plan_premium', slug: 'premium', name: 'Premium', pricePaise: 59900, currency: 'INR', validityDays: 30, scans: 30, scanReset: 'pack', badge: null, active: true, features: { atsScore: true, sectionBreakdown: true, keywordGap: true, jdMatching: { enabled: true, jdLimit: 30 }, aiBullets: 'full_resume_plus_versions', coverLetter: { enabled: true, letters: 5 }, linkedinTips: 'full', pdfDownload: true, emailReport: true, priority: true } },
];
