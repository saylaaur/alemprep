import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sourceHash } from './kazakh-coverage';
import { assertReadableContent } from './reviewed-content-check';
import { batchIdFromHash, validateKkCandidates } from './translation-candidate';

const snapshotSchema = z.object({
  topic_id:z.uuid(),type:z.enum(['single','multi','matching']),difficulty:z.number().int().min(1).max(5),
  body:z.unknown(),explanation:z.unknown(),context_id:z.uuid().nullable(),
  context:z.object({id:z.uuid(),language:z.literal('ru'),title:z.string().nullable(),content:z.unknown()}).strict().nullable(),
}).strict();
const entrySchema=z.object({sourceId:z.uuid(),sourceHash:z.string().regex(/^[0-9a-f]{64}$/),sourceSnapshot:snapshotSchema}).strict();
const ruArtifactSchema=z.object({schema:z.literal('alemprep-reviewed-ru-content-v1'),batchId:z.uuid(),entries:z.array(entrySchema).min(1).max(100)}).strict();
export type RuImportArtifact=z.infer<typeof ruArtifactSchema>;

export function parseRuImportArtifact(raw:unknown):RuImportArtifact {
  const artifact=ruArtifactSchema.parse(raw);
  if(new Set(artifact.entries.map(e=>e.sourceId)).size!==artifact.entries.length) throw new Error('Duplicate source');
  for(const entry of artifact.entries) {
    const s=entry.sourceSnapshot;
    if(sourceHash(s)!==entry.sourceHash) throw new Error('Source hash mismatch');
    if((s.context_id===null)!==(s.context===null)) throw new Error('Missing source context');
    if(s.context&&s.context.id!==s.context_id) throw new Error('Context identity mismatch');
    assertReadableContent(s.type,s.body,s.explanation,s.context&&{title:s.context.title,content:s.context.content});
  }
  return artifact;
}

export type ContentCommand={mode:'export'|'import'|'import-kk'|'accept';file:string;output?:string;apply:boolean;confirmProject?:string;limit:number;
  source?:string;reviewRef?:string;batchId?:string};
export function parseContentCommand(args:readonly string[]):ContentCommand {
  const values=new Map<string,string>();
  let apply=false;
  for(let i=0;i<args.length;i++) {
    const key=args[i];
    if(key==='--apply') {if(apply) throw new Error('Duplicate flag');apply=true;continue;}
    if(!['--mode','--file','--output','--confirm-project','--limit','--source','--review-ref','--batch-id'].includes(key)||values.has(key)
      ||!args[i+1]||args[i+1].startsWith('--')) throw new Error('Invalid command flags');
    values.set(key,args[++i]);
  }
  const mode=z.enum(['export','import','import-kk','accept']).parse(values.get('--mode')??'import');
  const file=values.get('--file');
  if(!file) throw new Error('--file is required');
  const limit=Number(values.get('--limit')??30);
  if(!Number.isInteger(limit)||limit<1||limit>100) throw new Error('Invalid limit');
  if(mode==='export'&&(!values.get('--output')||apply)) throw new Error('Export requires --output and never --apply');
  const source=values.get('--source'),reviewRef=values.get('--review-ref')?.trim(),batchId=values.get('--batch-id');
  if(mode==='import-kk') {
    // humanReviewed inside the file is never trusted: the operator names the review record.
    if(!source||!reviewRef||reviewRef.length>1000) throw new Error('import-kk requires --source and --review-ref');
    if(batchId!==undefined) z.uuid().parse(batchId);
  } else if(source!==undefined||reviewRef!==undefined||batchId!==undefined) {
    throw new Error('--source, --review-ref and --batch-id are only for import-kk');
  }
  return {mode,file,output:values.get('--output'),apply,confirmProject:values.get('--confirm-project'),limit,source,reviewRef,batchId};
}

const acceptanceSchema=z.object({schema:z.literal('alemprep-content-acceptance-v1'),versions:z.array(z.object({
  versionId:z.uuid(),contentHash:z.string().regex(/^sha256:[0-9a-f]{64}$/),
  // Omitted means RU (0038). KK versions are approved through the 0039 function.
  locale:z.enum(['ru','kk']).optional(),
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

/** The RU side of a KK batch: the reviewed RU artifact or the delivered source bundle. */
export function parseRuSource(raw:unknown):RuImportArtifact {
  const schema=z.object({schema:z.string()}).loose().parse(raw).schema;
  return schema==='alemprep-ru-kk-review-source-v1'?ruArtifactFromSourceBundle(raw,100):parseRuImportArtifact(raw);
}

const importResultSchema=z.object({batchId:z.uuid(),versions:z.array(z.object({sourceId:z.uuid(),questionId:z.uuid(),versionId:z.uuid(),familyId:z.uuid(),contentHash:z.string()}))});
function checkImportResult(response:{data:unknown;error:{message?:string}|null},batchId:string,sourceIds:readonly string[]) {
  if(response.error) throw new Error(response.error.message??'Import failed');
  const result=importResultSchema.parse(response.data);
  if(result.batchId!==batchId||result.versions.length!==sourceIds.length
    ||new Set(result.versions.map(v=>v.sourceId)).size!==sourceIds.length
    ||result.versions.some(v=>!sourceIds.includes(v.sourceId))) throw new Error('Invalid import result');
  return result;
}

async function importKk(command:ContentCommand,raw:unknown,url:string,rpc:ContentRpc,sourceRaw:unknown) {
  const validation=validateKkCandidates(raw,parseRuSource(sourceRaw));
  const entries=validation.entries;
  const reviewRef=command.reviewRef??'';
  const batchHash=sourceHash({locale:'kk',reviewRef,entries});
  const batchId=command.batchId??batchIdFromHash(batchHash);
  const summary={mode:command.mode,locale:'kk',count:entries.length,batchId,batchHash,reviewRef,
    warnings:validation.warnings.length,warningDetails:validation.warnings.slice(0,50),withIssues:validation.withIssues};
  if(!command.apply) return {dryRun:true,...summary};
  requireTarget(command,url);
  const response=await rpc('content_import_reviewed_kk_v1',{batch_id:batchId,batch_hash:batchHash,review_ref:reviewRef,entries});
  const result=checkImportResult(response,batchId,entries.map(e=>e.sourceId));
  // Imported KK versions are drafts until content_accept_version_kk_v1.
  return {...result,locale:'kk',publication:'draft',versions:result.versions.map(v=>({...v,locale:'kk'}))};
}

export async function executeContentCommand(command:ContentCommand,raw:unknown,url:string,rpc:ContentRpc,sourceRaw?:unknown):Promise<unknown> {
  if(command.mode==='export') throw new Error('Export is a local artifact conversion');
  if(command.mode==='import-kk') return importKk(command,raw,url,rpc,sourceRaw);
  const artifact=command.mode==='import'?parseRuImportArtifact(raw):acceptanceSchema.parse(raw);
  const count='entries' in artifact?artifact.entries.length:artifact.versions.length;
  if(!command.apply) return {dryRun:true,mode:command.mode,count};
  requireTarget(command,url);
  if('entries' in artifact) {
    const response=await rpc('content_import_reviewed_v1',{batch_id:artifact.batchId,
      batch_hash:sourceHash({locale:'ru',entries:artifact.entries}),locale:'ru',entries:artifact.entries});
    return checkImportResult(response,artifact.batchId,artifact.entries.map(e=>e.sourceId));
  }
  const accepted=[];
  for(const version of artifact.versions) {
    const name=version.locale==='kk'?'content_accept_version_kk_v1':'content_accept_version_v1';
    const r=await rpc(name,{version_id:version.versionId,content_hash:version.contentHash,
      math_review_ref:version.review.mathRef,language_review_ref:version.review.languageRef,source_rights_ref:version.review.sourceRef});
    if(r.error) throw new Error(r.error.message??'Approval failed');
    const receipt=z.object({versionId:z.uuid(),contentHash:z.string(),status:z.literal('approved')}).parse(r.data);
    if(receipt.versionId!==version.versionId||receipt.contentHash!==version.contentHash) throw new Error('Invalid approval receipt');
    accepted.push({...receipt,locale:version.locale??'ru'});
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
