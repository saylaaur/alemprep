import { readFile,writeFile } from 'node:fs/promises';
import { getServiceClient,loadEnv } from './lib/db';
import { requirePrivateArtifactPath } from './lib/translation-command';
import { executeContentCommand,parseContentCommand,ruArtifactFromSourceBundle } from './lib/reviewed-content-import';

async function main() {
  const command=parseContentCommand(process.argv.slice(2));
  await requirePrivateArtifactPath(command.file,process.cwd());
  if(command.output) await requirePrivateArtifactPath(command.output,process.cwd());
  const raw:unknown=JSON.parse(await readFile(command.file,'utf8'));
  loadEnv();
  const result=command.mode==='export'?ruArtifactFromSourceBundle(raw,command.limit)
    :await executeContentCommand(command,raw,process.env.NEXT_PUBLIC_SUPABASE_URL??'',async(name,args)=>{
      const {data,error}=await getServiceClient().rpc(name,args);
      return {data,error};
    });
  if(command.output) await writeFile(command.output,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify(command.mode==='export'?{exported:true,output:command.output}:result));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Content command failed');process.exitCode=1;});
