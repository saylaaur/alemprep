import { z } from 'zod';

// Shared by the trusted reader and private importer: drafts must be readable.
const optionSchema = z.object({ id: z.string().min(1).max(80), content: z.string() }).strict();
const textBlockSchema = z.object({ type: z.enum(['text', 'latex']).optional(), value: z.string() }).strict();
const imageBlockSchema = z.object({ type: z.literal('image'), value: z.string() }).strict();
const tableBlockSchema = z.object({
  type: z.literal('table'),
  columns: z.array(z.string()).max(30),
  rows: z.array(z.array(z.string()).max(30)).max(100),
}).strict();
const contentBlockSchema = z.union([textBlockSchema, imageBlockSchema, tableBlockSchema]);
export const blocksSchema = z.array(contentBlockSchema).max(100);
export const publicSingleSchema = z.object({ stem: z.string(), stem_blocks: blocksSchema.optional(), options: z.array(optionSchema).min(1).max(10) }).strict();
export const publicMatchingSchema = z.object({ stem: z.string(), stem_blocks: blocksSchema.optional(), left: z.array(optionSchema).min(1).max(10), right: z.array(z.string().min(1).max(512)).min(1).max(10) }).strict();
export const gradingSingleSchema = publicSingleSchema.extend({ correct: z.string().min(1).max(80) }).strict();
export const gradingMultiSchema = publicSingleSchema.extend({ correct: z.array(z.string().min(1).max(80)).min(1).max(10) }).strict();
const matchingCorrectSchema = z.record(z.string().min(1).max(80), z.string().min(1).max(512)).superRefine((value, context) => {
  if (Object.keys(value).length > 10) {
    context.addIssue({ code: 'too_big', maximum: 10, origin: 'object', inclusive: true, message: 'too many pairs' });
  }
});
export const gradingMatchingSchema = publicMatchingSchema.extend({ correct: matchingCorrectSchema }).strict();
export const contextSchema = z.object({ blocks: blocksSchema }).strict();
