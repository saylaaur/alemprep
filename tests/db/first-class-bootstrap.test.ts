import {readFile} from 'node:fs/promises';
import {afterEach,describe,expect,it} from 'vitest';
import {createDbHarness,type DbHarness} from './helpers';
import {waitForWaitingRowLock} from './lock-barrier';

let db:DbHarness;
afterEach(async()=>{await db?.close()});
async function bootstrap(values:{schoolId:string;groupId:string;operatorEmail:string;teacherEmail:string;groupName?:string},execute=(sql:string)=>db.execute(sql)){
  let sql=await readFile('docs/pilot/bootstrap-first-class.sql','utf8');
  for(const [name,value] of Object.entries({school_id:values.schoolId,group_id:values.groupId,operator_email:values.operatorEmail,teacher_email:values.teacherEmail,school_name:'Synthetic bootstrap school',group_name:values.groupName??'Synthetic bootstrap group'})){
    sql=sql.replace(`-- SET ${name}`,`v_${name} := '${value.replaceAll("'","''")}';`);
  }
  return execute(sql);
}
describe('operator first-class bootstrap',()=>{
  it.each(['teacher','group-teacher'] as const)('does not recreate %s when withdrawal commits during bootstrap row-lock wait',async(kind)=>{
    db=await createDbHarness();const operator=await db.actor('bootstrap-race-operator');const teacher=await db.actor('bootstrap-race-teacher');
    const args={schoolId:crypto.randomUUID(),groupId:crypto.randomUUID(),operatorEmail:operator.email,teacherEmail:teacher.email};await bootstrap(args);
    const writer=await db.connection();const requester=await db.connection();const observer=await db.connection();
    try{
      await writer.execute('BEGIN');
      await writer.scalar<string>('SELECT id FROM public.school_memberships WHERE school_id=$1 AND user_id=$2 FOR UPDATE',[args.schoolId,teacher.id]);
      if(kind==='teacher')await writer.execute('UPDATE public.school_memberships SET ended_at=clock_timestamp() WHERE school_id=$1 AND user_id=$2',[args.schoolId,teacher.id]);
      else await writer.execute('UPDATE public.group_teachers SET ended_at=clock_timestamp() WHERE group_id=$1',[args.groupId]);
      const pending=bootstrap(args,sql=>requester.execute(sql)).then(()=>({error:null}),error=>({error}));
      await waitForWaitingRowLock(observer,requester.backendPid);
      await writer.execute('COMMIT');
      expect((await pending).error).toMatchObject({message:'binding-withdrawn'});
      expect(await db.scalar<number>('SELECT count(*)::int FROM public.school_memberships WHERE school_id=$1',[args.schoolId])).toBe(2);
      expect(await db.scalar<number>('SELECT count(*)::int FROM public.group_teachers WHERE group_id=$1',[args.groupId])).toBe(1);
    }finally{await writer.execute('ROLLBACK');writer.release();requester.release();observer.release()}
  });
  it.each(['teacher','coordinator','group-teacher'] as const)('never restores withdrawn %s access on a saved-file retry',async(kind)=>{
    db=await createDbHarness();const operator=await db.actor('bootstrap-revoked-operator');const teacher=await db.actor('bootstrap-revoked-teacher');
    const args={schoolId:crypto.randomUUID(),groupId:crypto.randomUUID(),operatorEmail:operator.email,teacherEmail:teacher.email};
    await bootstrap(args);
    if(kind==='group-teacher')await db.execute('UPDATE public.group_teachers SET ended_at=clock_timestamp() WHERE group_id=$1',[args.groupId]);
    else await db.execute('UPDATE public.school_memberships SET ended_at=clock_timestamp() WHERE school_id=$1 AND user_id=$2',[args.schoolId,kind==='teacher'?teacher.id:operator.id]);
    await expect(bootstrap(args)).rejects.toThrow('binding-withdrawn');
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.school_memberships WHERE school_id=$1',[args.schoolId])).toBe(2);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.group_teachers WHERE group_id=$1',[args.groupId])).toBe(1);
    expect(await db.scalar<number>("SELECT count(*)::int FROM public.audit_events WHERE event_type='pilot.class_bootstrapped' AND entity_id=$1",[args.groupId])).toBe(1);
  });
  it('creates one class with coordinator/teacher access and safely replays the exact request',async()=>{
    db=await createDbHarness();
    const operator=await db.actor('bootstrap-coordinator');const teacher=await db.actor('bootstrap-teacher');
    const args={schoolId:crypto.randomUUID(),groupId:crypto.randomUUID(),operatorEmail:operator.email,teacherEmail:teacher.email};
    await Promise.all([bootstrap(args),bootstrap(args)]);await bootstrap(args);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.school_memberships WHERE school_id=$1',[args.schoolId])).toBe(2);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.group_teachers WHERE group_id=$1',[args.groupId])).toBe(1);
    for(const actor of [operator,teacher])expect(await db.rpc(actor,'pilot_teacher_dashboard_v1',{target_group_id:null})).toMatchObject({status:200,data:{groups:[{id:args.groupId}]}});
    expect(await db.scalar<number>("SELECT count(*)::int FROM public.audit_events WHERE event_type='pilot.class_bootstrapped' AND entity_id=$1",[args.groupId])).toBe(1);
  });
  it('rolls back a partial school when the group belongs elsewhere; never promotes a pupil into a teacher',async()=>{
    db=await createDbHarness();const operator=await db.actor('bootstrap-operator');const teacher=await db.actor('bootstrap-student');
    const schoolId=crypto.randomUUID();const groupId=crypto.randomUUID();
    const foreignSchool=await db.scalar<string>("INSERT INTO public.schools(name) VALUES('Synthetic bootstrap school') RETURNING id");
    await db.execute("INSERT INTO public.school_groups(id,school_id,name,locale) VALUES($1,$2,'Foreign','ru')",[groupId,foreignSchool]);
    await expect(bootstrap({schoolId,groupId,operatorEmail:operator.email,teacherEmail:teacher.email})).rejects.toThrow('group-conflict');
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.schools WHERE id=$1',[schoolId])).toBe(0);
    await db.execute("INSERT INTO public.school_memberships(school_id,user_id,role) VALUES($1,$2,'student')",[foreignSchool,teacher.id]);
    await expect(bootstrap({schoolId:foreignSchool,groupId:crypto.randomUUID(),operatorEmail:operator.email,teacherEmail:teacher.email})).rejects.toThrow('teacher-role-conflict');
    expect(await db.scalar<string>('SELECT role FROM public.school_memberships WHERE school_id=$1 AND user_id=$2',[foreignSchool,teacher.id])).toBe('student');
  });
  it('fails closed with unset values or an account that has not signed in',async()=>{
    db=await createDbHarness();
    await expect(db.execute(await readFile('docs/pilot/bootstrap-first-class.sql','utf8'))).rejects.toThrow('configure-bootstrap');
    const operator=await db.actor('bootstrap-missing-teacher');
    const schoolId=crypto.randomUUID();
    await expect(bootstrap({schoolId,groupId:crypto.randomUUID(),operatorEmail:operator.email,teacherEmail:'missing@example.test'})).rejects.toThrow('account-must-sign-in');
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.schools WHERE id=$1',[schoolId])).toBe(0);
  });
  it('supports a coordinator rehearsing the teacher path without a second membership and denies an authenticated SQL role',async()=>{
    db=await createDbHarness();const operator=await db.actor('bootstrap-rehearsal');
    const args={schoolId:crypto.randomUUID(),groupId:crypto.randomUUID(),operatorEmail:operator.email,teacherEmail:operator.email};
    await bootstrap(args);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.school_memberships WHERE school_id=$1',[args.schoolId])).toBe(1);
    const connection=await db.connection();
    try{
      await connection.execute('SET ROLE authenticated');
      await expect(connection.execute(await readFile('docs/pilot/bootstrap-first-class.sql','utf8'))).rejects.toThrow('operator-only');
    }finally{await connection.execute('RESET ROLE');connection.release()}
  });
});
