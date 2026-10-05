import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { SingleBodySchema, MultiBodySchema, MatchingBodySchema, ExplanationSchema } from './schema';
import { gradingSingleSchema, gradingMultiSchema, gradingMatchingSchema, contextSchema } from '../../lib/content/immutable-content-schemas';
import { sourceHash } from './kazakh-coverage';

const snapshotSchema = z.object({
  topic_id:z.uuid(),type:z.enum(['single','multi','matching']),difficulty:z.number().int().min(1).max(5),
  body:z.unknown(),explanation:z.unknown(),context_id:z.uuid().nullable(),
  context:z.object({id:z.uuid(),language:z.literal('ru'),title:z.string().nullable(),content:z.unknown()}).strict().nullable(),
}).strict();
const entrySchema=z.object({sourceId:z.uuid(),sourceHash:z.string().regex(/^[0-9a-f]{64}$/),sourceSnapshot:snapshotSchema}).strict();
const ruArtifactSchema=z.object({schema:z.literal('alemprep-reviewed-ru-content-v1'),batchId:z.uuid(),entries:z.array(entrySchema).min(1).max(100)}).strict();
export type RuImportArtifact=z.infer<typeof ruArtifactSchema>;

/** Compare parsed and raw values: the legacy validators strip unknown keys. */
function exactParse<T>(schema:z.ZodType<T>,raw:unknown):T {
  const parsed=schema.parse(raw);
  if(sourceHash(parsed)!==sourceHash(raw)) throw new Error('Unknown content fields');
  return parsed;
}
export function parseRuImportArtifact(raw:unknown):RuImportArtifact {
  const artifact=ruArtifactSchema.parse(raw);
  if(new Set(artifact.entries.map(e=>e.sourceId)).size!==artifact.entries.length) throw new Error('Duplicate source');
  for(const entry of artifact.entries) {
    const s=entry.sourceSnapshot;
    if(sourceHash(s)!==entry.sourceHash) throw new Error('Source hash mismatch');
    const body=s.type==='single'?exactParse(SingleBodySchema,s.body)
      :s.type==='multi'?exactParse(MultiBodySchema,s.body):exactParse(MatchingBodySchema,s.body);
    (s.type==='single'?gradingSingleSchema:s.type==='multi'?gradingMultiSchema:gradingMatchingSchema).parse(body);
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
    if(s.explanation!==null) {
      exactParse(ExplanationSchema,s.explanation);
      contextSchema.parse(s.explanation);
    }
    // An explanation is required for the initial pilot subset, not inferred.
    if(s.explanation===null) throw new Error('Missing explanation');
    if((s.context_id===null)!==(s.context===null)) throw new Error('Missing source context');
    if(s.context) {
      if(s.context.id!==s.context_id) throw new Error('Context identity mismatch');
      exactParse(ExplanationSchema,s.context.content);
      const content=contextSchema.parse(s.context.content);
      contextSchema.parse({blocks:[...(s.context.title!==null?[{type:'text',value:s.context.title}]:[]),...content.blocks]});
    }
  }
  return artifact;
}

export type ContentCommand={mode:'export'|'import'|'accept';file:string;output?:string;apply:boolean;confirmProject?:string;limit:number};
export function parseContentCommand(args:readonly string[]):ContentCommand {
  const values=new Map<string,string>();
  let apply=false;
  for(let i=0;i<args.length;i++) {
    const key=args[i];
    if(key==='--apply') {if(apply) throw new Error('Duplicate flag');apply=true;continue;}
    if(!['--mode','--file','--output','--confirm-project','--limit'].includes(key)||values.has(key)
      ||!args[i+1]||args[i+1].startsWith('--')) throw new Error('Invalid command flags');
    values.set(key,args[++i]);
  }
  const mode=z.enum(['export','import','accept']).parse(values.get('--mode')??'import');
  const file=values.get('--file');
  if(!file) throw new Error('--file is required');
  const limit=Number(values.get('--limit')??30);
  if(!Number.isInteger(limit)||limit<1||limit>100) throw new Error('Invalid limit');
  if(mode==='export'&&(!values.get('--output')||apply)) throw new Error('Export requires --output and never --apply');
  return {mode,file,output:values.get('--output'),apply,confirmProject:values.get('--confirm-project'),limit};
}

const acceptanceSchema=z.object({schema:z.literal('alemprep-content-acceptance-v1'),versions:z.array(z.object({
  versionId:z.uuid(),contentHash:z.string().regex(/^sha256:[0-9a-f]{64}$/),
  review:z.object({reviewer:z.string().trim().min(1),reviewedAt:z.iso.datetime(),status:z.literal('accepted'),
    mathRef:z.string().trim().min(1).max(1000),languageRef:z.string().trim().min(1).max(1000),sourceRef:z.string().trim().min(1).max(1000)}).strict(),
}).strict()).min(1).max(100)}).strict();
export type ContentRpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message?:string}|null}>;
function requireTarget(command:ContentCommand,url:string) {
  const target=new URL(url);
  if(!['https:','http:'].includes(target.protocol)) throw new Error('Invalid target');
  const local=['localhost','127.0.0.1','[::1]'].includes(target.hostname);
  if(!local&&(target.protocol!=='https:'||command.confirmProject!==target.hostname.replace(/\.supabase\.co$/,''))) {
    throw new Error('--apply requires --confirm-project matching the target project');
  }
}
export async function executeContentCommand(command:ContentCommand,raw:unknown,url:string,rpc:ContentRpc):Promise<unknown> {
  if(command.mode==='export') throw new Error('Export is a local artifact conversion');
  const artifact=command.mode==='import'?parseRuImportArtifact(raw):acceptanceSchema.parse(raw);
  const count='entries' in artifact?artifact.entries.length:artifact.versions.length;
  if(!command.apply) return {dryRun:true,mode:command.mode,count};
  requireTarget(command,url);
  if('entries' in artifact) {
    const response=await rpc('content_import_reviewed_v1',{batch_id:artifact.batchId,
      batch_hash:sourceHash({locale:'ru',entries:artifact.entries}),locale:'ru',entries:artifact.entries});
    if(response.error) throw new Error(response.error.message??'Import failed');
    const result=z.object({batchId:z.uuid(),versions:z.array(z.object({sourceId:z.uuid(),questionId:z.uuid(),versionId:z.uuid(),familyId:z.uuid(),contentHash:z.string()}))}).parse(response.data);
    if(result.batchId!==artifact.batchId||result.versions.length!==count
      ||new Set(result.versions.map(v=>v.sourceId)).size!==count
      ||result.versions.some(v=>!artifact.entries.some(e=>e.sourceId===v.sourceId))) throw new Error('Invalid import result');
    return result;
  }
  const accepted=[];
  for(const version of artifact.versions) {
    const r=await rpc('content_accept_version_v1',{version_id:version.versionId,content_hash:version.contentHash,
      math_review_ref:version.review.mathRef,language_review_ref:version.review.languageRef,source_rights_ref:version.review.sourceRef});
    if(r.error) throw new Error(r.error.message??'Approval failed');
    const receipt=z.object({versionId:z.uuid(),contentHash:z.string(),status:z.literal('approved')}).parse(r.data);
    if(receipt.versionId!==version.versionId||receipt.contentHash!==version.contentHash) throw new Error('Invalid approval receipt');
    accepted.push(receipt);
  }
  return {accepted};
}

/** Converts the already delivered private source bundle, never claims review. */
export function ruArtifactFromSourceBundle(raw:unknown,limit:number):RuImportArtifact {
  const bundle=z.object({schema:z.literal('alemprep-ru-kk-review-source-v1'),sources:z.array(z.object({
    sourceId:z.uuid(),sourceHash:z.string(),topic:z.object({id:z.uuid()}),
    question:z.object({type:z.enum(['single','multi','matching']),difficulty:z.number(),body:z.unknown(),explanation:z.unknown()}),
    context:z.object({id:z.uuid(),language:z.literal('ru'),title:z.string().nullable(),content:z.unknown()}).nullable(),
  })).min(1).max(100)}).parse(raw);
  return parseRuImportArtifact({schema:'alemprep-reviewed-ru-content-v1',batchId:randomUUID(),
    entries:bundle.sources.slice(0,limit).map(s=>({sourceId:s.sourceId,sourceHash:s.sourceHash,sourceSnapshot:{
      topic_id:s.topic.id,type:s.question.type,difficulty:s.question.difficulty,body:s.question.body,
      explanation:s.question.explanation,context_id:s.context?.id??null,
      context:s.context,
    }}))});
}
