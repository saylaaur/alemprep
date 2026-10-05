import { describe, expect, it } from 'vitest';
import { parseContentCommand, parseRuImportArtifact, executeContentCommand } from './reviewed-content-import';
import { sourceHash } from './kazakh-coverage';

const snapshot = {topic_id:'10000000-0000-4000-8000-000000000001',type:'single',difficulty:2,
  body:{stem:'2+2?',options:[{id:'A',content:'4'},{id:'B',content:'5'}],correct:'A'},
  explanation:{blocks:[{value:'2+2=4'}]},context_id:null,context:null};
const artifact = {schema:'alemprep-reviewed-ru-content-v1',batchId:'20000000-0000-4000-8000-000000000002',
  entries:[{sourceId:'30000000-0000-4000-8000-000000000003',sourceHash:sourceHash(snapshot),sourceSnapshot:snapshot}]};

describe('small reviewed-content operator boundary', () => {
  it('rejects matching label collisions and content beyond the immutable reader limits', () => {
    const bodies = [
      {stem:'Match',left:[{id:'A',content:'a'},{id:'B',content:'b'}],right:['same','same'],correct:{A:'same',B:'same'}},
      {...snapshot.body,options:Array.from({length:11},(_,i)=>({id:String(i),content:String(i)})),correct:'0'},
      {...snapshot.body,options:[{id:'A'.repeat(81),content:'4'},{id:'B',content:'5'}],correct:'A'.repeat(81)},
      {...snapshot.body,stem_blocks:Array.from({length:101},()=>({value:'text'}))},
      {...snapshot.body,stem_blocks:[{type:'table',columns:Array.from({length:31},()=>''),rows:[Array.from({length:31},()=>'')]}]},
    ];
    for(const body of bodies) {
      const changed={...snapshot,type:'left' in body?'matching':'single',body};
      expect(()=>parseRuImportArtifact({...artifact,entries:[{...artifact.entries[0],sourceHash:sourceHash(changed),sourceSnapshot:changed}]})).toThrow();
    }
  });
  it('reserves the context-title block and preserves the full context identity/hash', () => {
    const contextId='40000000-0000-4000-8000-000000000004';
    const withContext=(count:number)=>({...snapshot,context_id:contextId,context:{id:contextId,language:'ru',title:'Title',content:{blocks:Array.from({length:count},()=>({value:'text'}))}}});
    const entry=(value:ReturnType<typeof withContext>)=>({...artifact,entries:[{...artifact.entries[0],sourceHash:sourceHash(value),sourceSnapshot:value}]});
    expect(parseRuImportArtifact(entry(withContext(99))).entries[0].sourceSnapshot.context?.id).toBe(contextId);
    expect(()=>parseRuImportArtifact(entry(withContext(100)))).toThrow();
    const emptyTitle=withContext(100);
    emptyTitle.context.title='';
    expect(()=>parseRuImportArtifact(entry(emptyTitle))).toThrow();
  });
  it('rejects a changed snapshot/hash and invalid grading keys instead of silently stripping data', () => {
    expect(parseRuImportArtifact(artifact).entries).toHaveLength(1);
    expect(()=>parseRuImportArtifact({...artifact,entries:[{...artifact.entries[0],sourceHash:'a'.repeat(64)}]})).toThrow();
    for(const body of [{...snapshot.body,correct:'C'},{...snapshot.body,hidden:'secret'},{...snapshot.body,options:[{id:'A',content:'4'},{id:'A',content:'5'}]}]) {
      const changed={...snapshot,body};
      expect(()=>parseRuImportArtifact({...artifact,entries:[{...artifact.entries[0],sourceHash:sourceHash(changed),sourceSnapshot:changed}]})).toThrow();
    }
  });
  it('rejects duplicate sources and incomplete or wrong-language context', () => {
    expect(()=>parseRuImportArtifact({...artifact,entries:[...artifact.entries,...artifact.entries]})).toThrow();
    const changed={...snapshot,context_id:'40000000-0000-4000-8000-000000000004',context:null};
    expect(()=>parseRuImportArtifact({...artifact,entries:[{...artifact.entries[0],sourceHash:sourceHash(changed),sourceSnapshot:changed}]})).toThrow();
  });
  it('requires a file and exact target for writes and defaults to a dry-run without any RPC', async () => {
    expect(()=>parseContentCommand([])).toThrow();
    const command=parseContentCommand(['--file','/private/tmp/review.json']);
    let called=false;
    const rpc=async()=>{called=true;throw new Error('must not write');};
    const result=await executeContentCommand(command,artifact,'https://example.supabase.co',rpc);
    expect(result).toMatchObject({dryRun:true,count:1});
    expect(called).toBe(false);
    await expect(executeContentCommand({...command,apply:true},artifact,'https://example.supabase.co',rpc)).rejects.toThrow();
    await expect(executeContentCommand({...command,apply:true,confirmProject:'other'},artifact,'https://example.supabase.co',rpc)).rejects.toThrow();
    expect(called).toBe(false);
  });
  it('requires explicit human review records and exact acceptance receipts', async () => {
    const reviewed={schema:'alemprep-content-acceptance-v1',versions:[{
      versionId:'50000000-0000-4000-8000-000000000005',contentHash:'sha256:'+ 'a'.repeat(64),
      review:{reviewer:'Synthetic reviewer',reviewedAt:'2026-10-05T10:00:00Z',status:'accepted',mathRef:'fixture/math',languageRef:'fixture/ru',sourceRef:'fixture/source'},
    }]};
    const command=parseContentCommand(['--mode','accept','--file','/private/tmp/review.json']);
    const rpc=async()=>({data:{versionId:reviewed.versions[0].versionId,contentHash:reviewed.versions[0].contentHash,status:'approved'},error:null});
    await expect(executeContentCommand(command,reviewed,'',async()=>{throw new Error('dry-run wrote');})).resolves.toMatchObject({dryRun:true,count:1});
    for(const review of [{...reviewed.versions[0].review,reviewer:''},{...reviewed.versions[0].review,status:'draft'},{...reviewed.versions[0].review,mathRef:' '}]) {
      await expect(executeContentCommand(command,{...reviewed,versions:[{...reviewed.versions[0],review}]},'',rpc)).rejects.toThrow();
    }
    const apply={...command,apply:true,confirmProject:'example'};
    await expect(executeContentCommand(apply,reviewed,'https://example.supabase.co',rpc)).resolves.toMatchObject({accepted:[{status:'approved'}]});
    await expect(executeContentCommand(apply,reviewed,'https://example.supabase.co',async()=>({data:{versionId:reviewed.versions[0].versionId,contentHash:'wrong',status:'approved'},error:null}))).rejects.toThrow('Invalid approval receipt');
  });
});
