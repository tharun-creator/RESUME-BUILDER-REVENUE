import { z } from 'zod';

export const ScanStatusSchema = z.enum(['queued', 'processing', 'done', 'failed']);
export type ScanStatus = z.infer<typeof ScanStatusSchema>;

export const ScanStepSchema = z.enum(['Uploading', 'Reading', 'Scoring', 'Writing tips', 'Done']);
export type ScanStep = z.infer<typeof ScanStepSchema>;

export const SubScoresSchema = z.object({
  formatting: z.number().min(0).max(25),
  sections: z.number().min(0).max(15),
  keywords: z.number().min(0).max(25),
  bullets: z.number().min(0).max(20),
  lengthGrammar: z.number().min(0).max(15),
});
export type SubScores = z.infer<typeof SubScoresSchema>;

export const ReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  subScores: SubScoresSchema,
  topFixes: z.array(z.object({ title: z.string(), detail: z.string(), impact: z.enum(['high', 'medium', 'low']) })).max(10),
  keywordGaps: z.array(z.string()).max(50),
  bulletRewrites: z.array(z.object({ before: z.string(), after: z.string() })).max(20),
  summary: z.string(),
});
export type Report = z.infer<typeof ReportSchema>;

export const ScanSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: ScanStatusSchema,
  step: ScanStepSchema.optional(),
  score: z.number().min(0).max(100).nullable(),
  report: ReportSchema.nullable(),
  targetRole: z.string().nullable().optional(),
  jdHash: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Scan = z.infer<typeof ScanSchema>;
