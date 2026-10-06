import { z } from 'zod';
import { SingleBodySchema, MultiBodySchema, MatchingBodySchema, ExplanationSchema } from './schema';
import { gradingSingleSchema, gradingMultiSchema, gradingMatchingSchema, contextSchema } from '../../lib/content/immutable-content-schemas';
import { sourceHash } from './kazakh-coverage';

/** Compare parsed and raw values: the legacy validators strip unknown keys. */
export function exactParse<T>(schema:z.ZodType<T>,raw:unknown):T {
  const parsed=schema.parse(raw);
  if(sourceHash(parsed)!==sourceHash(raw)) throw new Error('Unknown content fields');
  return parsed;
}

/** One content check for RU sources and KK drafts: the trusted reader must accept it. */
export function assertReadableContent(type:'single'|'multi'|'matching',rawBody:unknown,explanation:unknown,
  context:{title:string|null;content:unknown}|null):void {
  const body=type==='single'?exactParse(SingleBodySchema,rawBody)
    :type==='multi'?exactParse(MultiBodySchema,rawBody):exactParse(MatchingBodySchema,rawBody);
  (type==='single'?gradingSingleSchema:type==='multi'?gradingMultiSchema:gradingMatchingSchema).parse(body);
  if('options' in body) {
    const ids=body.options.map(o=>o.id);
    const correct=typeof body.correct==='string'?[body.correct]:body.correct;
    if(!Array.isArray(correct)||new Set(ids).size!==ids.length||ids.some(id=>!id)
      ||new Set(correct).size!==correct.length||correct.some(id=>!ids.includes(id))) throw new Error('Invalid grading key');
  } else {
    const ids=body.left.map(o=>o.id);
    if(new Set(ids).size!==ids.length||ids.some(id=>!id)||new Set(body.right).size!==body.right.length
      ||Object.keys(body.correct).length!==ids.length||ids.some(id=>!body.right.includes(body.correct[id]))) throw new Error('Invalid matching key');
  }
  // An explanation is required for the initial pilot subset, not inferred.
  if(explanation===null) throw new Error('Missing explanation');
  exactParse(ExplanationSchema,explanation);
  contextSchema.parse(explanation);
  if(context) {
    exactParse(ExplanationSchema,context.content);
    const content=contextSchema.parse(context.content);
    contextSchema.parse({blocks:[...(context.title!==null?[{type:'text',value:context.title}]:[]),...content.blocks]});
  }
}
