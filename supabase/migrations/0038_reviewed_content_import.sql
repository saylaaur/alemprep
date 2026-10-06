-- KT3a: small RU batches. KK adaptation follows the accepted translation validator.
-- No legacy question is modified and no draft is automatically approved.
BEGIN;
CREATE TABLE IF NOT EXISTS public.content_import_receipts (
  batch_id UUID PRIMARY KEY,
  batch_hash TEXT NOT NULL CHECK (batch_hash ~ '^[0-9a-f]{64}$'),
  request JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.content_version_sources (
  question_version_id UUID PRIMARY KEY REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  source_question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  source_snapshot JSONB NOT NULL,
  UNIQUE(source_question_id, source_hash)
);
ALTER TABLE public.content_import_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_version_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_import_receipts, public.content_version_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.content_import_receipts, public.content_version_sources TO service_role;
DROP TRIGGER IF EXISTS content_import_receipts_immutable ON public.content_import_receipts;
CREATE TRIGGER content_import_receipts_immutable BEFORE UPDATE OR DELETE ON public.content_import_receipts
  FOR EACH ROW EXECUTE FUNCTION public.reject_question_version_mutation();
DROP TRIGGER IF EXISTS content_version_sources_immutable ON public.content_version_sources;
CREATE TRIGGER content_version_sources_immutable BEFORE UPDATE OR DELETE ON public.content_version_sources
  FOR EACH ROW EXECUTE FUNCTION public.reject_question_version_mutation();

CREATE OR REPLACE FUNCTION public.content_source_snapshot_v1(source_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('topic_id',q.topic_id,'type',q.type,'difficulty',q.difficulty,
    'body',q.body,'explanation',q.explanation,'context_id',q.context_id,
    'context',CASE WHEN c.id IS NULL THEN null ELSE jsonb_build_object('id',c.id,'language',c.language,'title',c.title,'content',c.content) END)
  FROM public.questions q LEFT JOIN public.contexts c ON c.id=q.context_id WHERE q.id=source_id;
$$;

CREATE OR REPLACE FUNCTION public.content_import_reviewed_v1(batch_id UUID,batch_hash TEXT,locale TEXT,entries JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  prior public.content_import_receipts%ROWTYPE;
  q public.questions%ROWTYPE;
  lineage public.content_version_sources%ROWTYPE;
  v public.question_versions%ROWTYPE;
  entry JSONB; snapshot JSONB; context_value JSONB; request_value JSONB;
  family UUID; next_revision INTEGER; version_hash TEXT;
  versions JSONB := '[]'; result JSONB;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout','2s',true);
  PERFORM pg_catalog.set_config('statement_timeout','5s',true);
  IF batch_id IS NULL OR batch_hash IS NULL OR batch_hash !~ '^[0-9a-f]{64}$'
    OR locale IS DISTINCT FROM 'ru' OR jsonb_typeof(entries) IS DISTINCT FROM 'array'
    OR jsonb_array_length(entries) NOT BETWEEN 1 AND 100
    OR (SELECT count(DISTINCT x->>'sourceId') FROM jsonb_array_elements(entries) x) <> jsonb_array_length(entries) THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE='22023';
  END IF;
  request_value := jsonb_build_object('locale',locale,'entries',entries);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('content-import:'||batch_id::text,0));
  SELECT * INTO prior FROM public.content_import_receipts r WHERE r.batch_id=content_import_reviewed_v1.batch_id;
  IF FOUND THEN
    IF prior.batch_hash=batch_hash AND prior.request=request_value THEN RETURN prior.result; END IF;
    RETURN jsonb_build_object('error','operation-conflict');
  END IF;
  -- Global UUID order keeps overlapping batches from locking sources backwards.
  FOR entry IN SELECT x FROM jsonb_array_elements(entries) x ORDER BY x->>'sourceId' LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object'
      OR jsonb_typeof(entry->'sourceSnapshot') IS DISTINCT FROM 'object'
      OR entry->>'sourceHash' IS NULL OR entry->>'sourceHash' !~ '^[0-9a-f]{64}$'
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k NOT IN ('sourceId','sourceHash','sourceSnapshot')) THEN
      RAISE EXCEPTION 'invalid-input' USING ERRCODE='22023';
    END IF;
    SELECT * INTO q FROM public.questions WHERE id=(entry->>'sourceId')::uuid FOR UPDATE;
    IF NOT FOUND OR q.language <> 'ru' OR NOT q.is_published THEN
      RAISE EXCEPTION 'stale-source' USING ERRCODE='22023';
    END IF;
    IF q.context_id IS NOT NULL THEN
      PERFORM 1 FROM public.contexts c WHERE c.id=q.context_id AND c.language='ru' FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'stale-source' USING ERRCODE='22023'; END IF;
    END IF;
    snapshot := public.content_source_snapshot_v1(q.id);
    IF snapshot IS DISTINCT FROM entry->'sourceSnapshot' THEN
      RAISE EXCEPTION 'stale-source' USING ERRCODE='22023';
    END IF;
    IF jsonb_typeof(q.body) <> 'object' OR NOT (q.body ? 'correct') THEN
      RAISE EXCEPTION 'invalid-content' USING ERRCODE='22023';
    END IF;
    SELECT * INTO lineage FROM public.content_version_sources s
      WHERE s.source_question_id=q.id AND s.source_hash=entry->>'sourceHash';
    IF FOUND THEN
      IF lineage.source_snapshot IS DISTINCT FROM snapshot THEN
        RAISE EXCEPTION 'operation-conflict' USING ERRCODE='22023';
      END IF;
      SELECT * INTO v FROM public.question_versions WHERE id=lineage.question_version_id;
    ELSE
      IF (SELECT count(DISTINCT family_id) FROM public.question_versions WHERE question_id=q.id)>1 THEN
        RAISE EXCEPTION 'inconsistent-family' USING ERRCODE='22023';
      END IF;
      SELECT family_id INTO family FROM public.question_versions WHERE question_id=q.id ORDER BY revision LIMIT 1;
      family := coalesce(family,q.id);
      SELECT coalesce(max(revision),0)+1 INTO next_revision FROM public.question_versions WHERE question_id=q.id;
      context_value := snapshot->'context'->'content';
      IF context_value='null'::jsonb THEN context_value:=NULL; END IF;
      IF snapshot->'context'->>'title' IS NOT NULL THEN
        context_value := jsonb_build_object('blocks',
          jsonb_build_array(jsonb_build_object('type','text','value',snapshot->'context'->>'title'))
          || (context_value->'blocks'));
      END IF;
      version_hash := 'sha256:'||pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
        jsonb_build_object('locale','ru','type',q.type,'body',q.body,'explanation',q.explanation,'context',context_value)::text,'UTF8'),'sha256'),'hex');
      INSERT INTO public.question_versions(question_id,family_id,revision,locale,type,public_body,grading_body,explanation,context_snapshot,content_hash)
        VALUES(q.id,family,next_revision,'ru',q.type,q.body-'correct',q.body,q.explanation,context_value,version_hash) RETURNING * INTO v;
      INSERT INTO public.question_publications(question_version_id,status) VALUES(v.id,'draft');
      INSERT INTO public.content_version_sources VALUES(v.id,q.id,entry->>'sourceHash',snapshot);
    END IF;
    versions := versions||jsonb_build_array(jsonb_build_object('sourceId',q.id,'questionId',q.id,'versionId',v.id,'familyId',v.family_id,'contentHash',v.content_hash));
  END LOOP;
  result:=jsonb_build_object('batchId',batch_id,'versions',versions);
  INSERT INTO public.content_import_receipts VALUES(batch_id,batch_hash,request_value,result);
  INSERT INTO public.audit_events(actor_kind,event_type,entity_type,entity_id,operation_id,metadata)
    VALUES('system','content.batch.imported','content_batch',batch_id,batch_id,jsonb_build_object('result','accepted','count',jsonb_array_length(versions),'schema_version','v1'));
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.content_accept_version_v1(version_id UUID,content_hash TEXT,math_review_ref TEXT,language_review_ref TEXT,source_rights_ref TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  v public.question_versions%ROWTYPE;
  s public.content_version_sources%ROWTYPE;
  p public.question_publications%ROWTYPE;
  q public.questions%ROWTYPE;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout','2s',true);
  IF version_id IS NULL OR content_hash IS NULL
    OR coalesce(length(trim(math_review_ref)),0)=0 OR coalesce(length(trim(language_review_ref)),0)=0
    OR coalesce(length(trim(source_rights_ref)),0)=0 THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE='22023';
  END IF;
  SELECT * INTO s FROM public.content_version_sources WHERE question_version_id=version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not-found' USING ERRCODE='22023'; END IF;
  SELECT * INTO q FROM public.questions WHERE id=s.source_question_id FOR SHARE;
  IF NOT q.is_published OR q.language<>'ru' THEN RAISE EXCEPTION 'stale-source' USING ERRCODE='22023'; END IF;
  IF q.context_id IS NOT NULL THEN
    PERFORM 1 FROM public.contexts c WHERE c.id=q.context_id AND c.language='ru' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'stale-source' USING ERRCODE='22023'; END IF;
  END IF;
  IF public.content_source_snapshot_v1(q.id) IS DISTINCT FROM s.source_snapshot THEN
    RAISE EXCEPTION 'stale-source' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v FROM public.question_versions WHERE id=version_id;
  IF v.content_hash IS DISTINCT FROM content_hash THEN RAISE EXCEPTION 'hash-mismatch' USING ERRCODE='22023'; END IF;
  SELECT * INTO p FROM public.question_publications WHERE question_version_id=version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not-found' USING ERRCODE='22023'; END IF;
  IF p.status='quarantined' THEN RETURN jsonb_build_object('error','content-quarantined'); END IF;
  IF p.status='approved' THEN
    IF p.math_review_ref IS DISTINCT FROM math_review_ref OR p.language_review_ref IS DISTINCT FROM language_review_ref
      OR p.source_rights_ref IS DISTINCT FROM source_rights_ref THEN RETURN jsonb_build_object('error','operation-conflict'); END IF;
  ELSE
    UPDATE public.question_publications SET status='approved',math_review_ref=content_accept_version_v1.math_review_ref,
      language_review_ref=content_accept_version_v1.language_review_ref,source_rights_ref=content_accept_version_v1.source_rights_ref,
      updated_at=clock_timestamp() WHERE question_version_id=version_id;
    INSERT INTO public.audit_events(actor_kind,event_type,entity_type,entity_id,metadata)
      VALUES('system','content.version.approved','question_version',version_id,jsonb_build_object('result','accepted','schema_version','v1'));
  END IF;
  RETURN jsonb_build_object('versionId',version_id,'contentHash',v.content_hash,'status','approved');
END;
$$;
-- Auth-scoped aggregate metadata; no question bodies/keys or pending versions.
CREATE OR REPLACE FUNCTION public.content_topic_counts_v1(content_locale TEXT)
RETURNS TABLE(topic_id UUID,type public.question_type,question_count INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
  IF content_locale IS NULL OR content_locale NOT IN ('ru','kk') THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT q.topic_id,v.type,count(DISTINCT v.family_id)::integer
    FROM public.question_versions v
    JOIN public.question_publications p ON p.question_version_id=v.id AND p.status='approved'
    JOIN public.questions q ON q.id=v.question_id
    JOIN public.topics t ON t.id=q.topic_id
    JOIN public.subjects s ON s.id=t.subject_id AND s.is_active
    WHERE v.locale=content_locale GROUP BY q.topic_id,v.type ORDER BY q.topic_id,v.type;
END;
$$;
REVOKE ALL ON FUNCTION public.content_topic_counts_v1(TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.content_topic_counts_v1(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.content_source_snapshot_v1(UUID),
  public.content_import_reviewed_v1(UUID,TEXT,TEXT,JSONB),
  public.content_accept_version_v1(UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.content_source_snapshot_v1(UUID),
  public.content_import_reviewed_v1(UUID,TEXT,TEXT,JSONB),
  public.content_accept_version_v1(UUID,TEXT,TEXT,TEXT,TEXT) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
