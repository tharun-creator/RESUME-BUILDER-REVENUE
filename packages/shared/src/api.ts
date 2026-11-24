import { z } from 'zod';
import { PlanSchema } from './plans';
import { ScanSchema, ScanStatusSchema } from './scan';

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const OtpRequestSchema = z.object({ email: z.string().email() });
export const OtpVerifySchema = z.object({ email: z.string().email(), code: z.string().min(4).max(8) });
export const AuthUserSchema = z.object({ id: z.string(), email: z.string().email(), name: z.string().nullable().optional() });
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const UploadRequestSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.enum(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
});

export const CreateScanSchema = z.object({
  fileKey: z.string().min(1),
  targetRole: z.string().max(120).optional(),
  jobDescription: z.string().max(20000).optional(),
  consent: z.literal(true),
});

export const ScanStatusResponseSchema = z.object({
  scan: ScanSchema.pick({ id: true, status: true, step: true, score: true, error: true, updatedAt: true }),
});

export const PlansResponseSchema = z.object({ plans: z.array(PlanSchema) });
export const CheckoutRequestSchema = z.object({ planId: z.string().min(1) });
export const CheckoutResponseSchema = z.object({
  order: z.object({ id: z.string(), razorpayOrderId: z.string(), amountPaise: z.number().int(), currency: z.literal('INR') }),
  razorpayKeyId: z.string(),
  plan: PlanSchema,
});
export const PaymentVerifySchema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

export const ApiOkSchema = <T extends z.ZodTypeAny>(data: T) => z.object({ ok: z.literal(true), data });