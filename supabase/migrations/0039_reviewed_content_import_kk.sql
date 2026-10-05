-- KT3b: KK drafts for already approved RU families. 0038 is not modified.
-- A KK version is created only for an RU source whose reviewed source hash has an
-- approved RU version and whose current snapshot still equals that reviewed one.
-- The KK version joins the SAME family as that RU version and starts as draft.
-- No existing question, context or version row is updated; approval is a separate
-- service-only call with an exact content hash and explicit review references.
BEGIN;
-- One KK context per source context and translated content. A changed translation
-- gets a new row instead of an UPDATE of an existing context.
CREATE TABLE IF NOT EXISTS public.content_translation_contexts (
  source_context_id UUID NOT NULL REFERENCES public.contexts(id) ON DELETE RESTRICT,
  locale TEXT NOT NULL CHECK (locale = 'kk'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  context_id UUID NOT NULL UNIQUE REFERENCES public.contexts(id) ON DELETE RESTRICT,
  PRIMARY KEY (source_context_id, locale, content_hash)
);
CREATE TABLE IF NOT EXISTS public.content_translation_sources (
  question_version_id UUID PRIMARY KEY REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  source_question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  source_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  source_snapshot JSONB NOT NULL,
  locale TEXT NOT NULL CHECK (locale = 'kk'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  UNIQUE (source_question_id, locale, source_hash, content_hash)
);
ALTER TABLE public.content_translation_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_translation_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_translation_contexts, public.content_translation_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.content_translation_contexts, public.content_translation_sources TO service_role;
DROP TRIGGER IF EXISTS content_translation_contexts_immutable ON public.content_translation_contexts;
CREATE TRIGGER content_translation_contexts_immutable BEFORE UPDATE OR DELETE ON public.content_translation_contexts
  FOR EACH ROW EXECUTE FUNCTION public.reject_question_version_mutation();
DROP TRIGGER IF EXISTS content_translation_sources_immutable ON public.content_translation_sources;
CREATE TRIGGER content_translation_sources_immutable BEFORE UPDATE OR DELETE ON public.content_translation_sources
  FOR EACH ROW EXECUTE FUNCTION public.reject_question_version_mutation();
CREATE INDEX IF NOT EXISTS content_translation_sources_source_idx
  ON public.content_translation_sources(source_question_id, locale);

CREATE OR REPLACE FUNCTION public.content_sha256_v1(value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT pg_catalog.encode(extensions.digest(pg_catalog.convert_to(value,'UTF8'),'sha256'),'hex');
$$;

CREATE OR REPLACE FUNCTION public.content_import_reviewed_kk_v1(batch_id UUID,batch_hash TEXT,review_ref TEXT,entries JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  prior public.content_import_receipts%ROWTYPE;
  q public.questions%ROWTYPE;
  kq public.questions%ROWTYPE;
  ru_v public.question_versions%ROWTYPE;
  v public.question_versions%ROWTYPE;
  lineage public.content_version_sources%ROWTYPE;
  tl public.content_translation_sources%ROWTYPE;
  entry JSONB; body JSONB; ru_body JSONB; ctx JSONB; snapshot JSONB; context_value JSONB; request_value JSONB;
  pair RECORD; ctx_key TEXT;
  family UUID; kk_context UUID; ctx_hash TEXT; next_revision INTEGER; version_hash TEXT;
  versions JSONB := '[]'; result JSONB;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout','2s',true);
  PERFORM pg_catalog.set_config('statement_timeout','5s',true);
  IF batch_id IS NULL OR batch_hash IS NULL OR batch_hash !~ '^[0-9a-f]{64}$'
    OR coalesce(length(trim(review_ref)),0) NOT BETWEEN 1 AND 1000
    OR jsonb_typeof(entries) IS DISTINCT FROM 'array'
    OR jsonb_array_length(entries) NOT BETWEEN 1 AND 100
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(entries) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
      OR NOT (x ?& ARRAY['sourceId','sourceHash','body','explanation','context'])
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(x) k WHERE k NOT IN ('sourceId','sourceHash','body','explanation','context'))
      OR coalesce(x->>'sourceId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR coalesce(x->>'sourceHash','') !~ '^[0-9a-f]{64}$'
      OR jsonb_typeof(x->'context') NOT IN ('null','object')
      OR (jsonb_typeof(x->'context')='object'
        AND coalesce(x->'context'->>'sourceContextId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
    OR (SELECT count(DISTINCT x->>'sourceId') FROM jsonb_array_elements(entries) x) <> jsonb_array_length(entries)
    -- One translated context per source context inside a batch.
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(entries) x WHERE jsonb_typeof(x->'context')='object'
      GROUP BY x->'context'->>'sourceContextId' HAVING count(DISTINCT x->'context')>1) THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE='22023';
  END IF;
  request_value := jsonb_build_object('locale','kk','reviewRef',review_ref,'entries',entries);
  -- Same key as 0038: both importers share one receipt namespace.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('content-import:'||batch_id::text,0));
  SELECT * INTO prior FROM public.content_import_receipts r WHERE r.batch_id=content_import_reviewed_kk_v1.batch_id;
  IF FOUND THEN
    IF prior.batch_hash=batch_hash AND prior.request=request_value THEN RETURN prior.result; END IF;
    RETURN jsonb_build_object('error','operation-conflict');
  END IF;
  -- Global order: every translated context first, then every source by UUID.
  FOR ctx_key IN SELECT DISTINCT x->'context'->>'sourceContextId' FROM jsonb_array_elements(entries) x
    WHERE jsonb_typeof(x->'context')='object' ORDER BY 1 LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('content-context:kk:'||ctx_key,0));
  END LOOP;
  FOR entry IN SELECT x FROM jsonb_array_elements(entries) x ORDER BY x->>'sourceId' LOOP
    SELECT * INTO q FROM public.questions WHERE id=(entry->>'sourceId')::uuid FOR UPDATE;
    IF NOT FOUND OR q.language <> 'ru' OR NOT q.is_published OR q.source_question_id IS NOT NULL THEN
      RAISE EXCEPTION 'stale-source' USING ERRCODE='22023';
    END IF;
    IF q.context_id IS NOT NULL THEN
      PERFORM 1 FROM public.contexts c WHERE c.id=q.context_id AND c.language='ru' FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'stale-source' USING ERRCODE='22023'; END IF;
    END IF;
    snapshot := public.content_source_snapshot_v1(q.id);
    -- The reviewed RU lineage carries the hash the translator saw.
    SELECT s.* INTO lineage FROM public.content_version_sources s
      JOIN public.question_versions rv ON rv.id=s.question_version_id AND rv.question_id=q.id AND rv.locale='ru'
      JOIN public.question_publications p ON p.question_version_id=rv.id AND p.status='approved'
      WHERE s.source_question_id=q.id AND s.source_hash=entry->>'sourceHash'
      ORDER BY rv.revision DESC LIMIT 1 FOR SHARE OF p;
    IF NOT FOUND THEN
      IF EXISTS(SELECT 1 FROM public.question_versions rv JOIN public.question_publications p
        ON p.question_version_id=rv.id AND p.status='approved' WHERE rv.question_id=q.id AND rv.locale='ru') THEN
        RAISE EXCEPTION 'stale-source' USING ERRCODE='22023';
      END IF;
      RAISE EXCEPTION 'source-not-approved' USING ERRCODE='22023';
    END IF;
    IF lineage.source_snapshot IS DISTINCT FROM snapshot THEN
      RAISE EXCEPTION 'stale-source' USING ERRCODE='22023';
    END IF;
    SELECT * INTO ru_v FROM public.question_versions WHERE id=lineage.question_version_id;
    IF (SELECT count(DISTINCT family_id) FROM public.question_versions WHERE question_id=q.id)>1 THEN
      RAISE EXCEPTION 'inconsistent-family' USING ERRCODE='22023';
    END IF;
    family := ru_v.family_id;
    body := entry->'body'; ru_body := ru_v.grading_body;
    -- Grading keys and structure must equal the approved RU version; text may differ.
    IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR NOT (body ? 'correct') OR NOT (body ? 'stem')
      OR jsonb_typeof(entry->'explanation') IS DISTINCT FROM 'object'
      OR jsonb_typeof(entry->'explanation'->'blocks') IS DISTINCT FROM 'array'
      OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k)
        IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(ru_body) k) THEN
      RAISE EXCEPTION 'invalid-content' USING ERRCODE='22023';
    END IF;
    IF q.type IN ('single','multi') THEN
      IF body->'correct' IS DISTINCT FROM ru_body->'correct'
        OR jsonb_typeof(body->'options') IS DISTINCT FROM 'array'
        OR jsonb_path_query_array(body,'$.options[*].id') IS DISTINCT FROM jsonb_path_query_array(ru_body,'$.options[*].id')
        OR jsonb_array_length(body->'options') <> jsonb_array_length(ru_body->'options') THEN
        RAISE EXCEPTION 'invalid-content' USING ERRCODE='22023';
      END IF;
    ELSE
      IF jsonb_typeof(body->'left') IS DISTINCT FROM 'array' OR jsonb_typeof(body->'right') IS DISTINCT FROM 'array'
        OR jsonb_typeof(body->'correct') IS DISTINCT FROM 'object'
        OR jsonb_path_query_array(body,'$.left[*].id') IS DISTINCT FROM jsonb_path_query_array(ru_body,'$.left[*].id')
        OR jsonb_array_length(body->'left') <> jsonb_array_length(ru_body->'left')
        OR jsonb_array_length(body->'right') <> jsonb_array_length(ru_body->'right')
        OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(body->'right') r) <> jsonb_array_length(body->'right')
        OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body->'correct') k)
          IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(ru_body->'correct') k) THEN
        RAISE EXCEPTION 'invalid-content' USING ERRCODE='22023';
      END IF;
      -- Matching stores the right label: the KK key must point at the same index.
      FOR pair IN SELECT key, value FROM jsonb_each(ru_body->'correct') LOOP
        IF (SELECT min(i) FROM jsonb_array_elements(ru_body->'right') WITH ORDINALITY r(val,i) WHERE r.val=pair.value)
          IS DISTINCT FROM
          (SELECT min(i) FROM jsonb_array_elements(body->'right') WITH ORDINALITY r(val,i) WHERE r.val=body->'correct'->pair.key) THEN
          RAISE EXCEPTION 'invalid-content' USING ERRCODE='22023';
        END IF;
      END LOOP;
    END IF;
    ctx := entry->'context';
    kk_context := NULL; context_value := NULL;
    IF q.context_id IS NULL THEN
      IF jsonb_typeof(ctx) IS DISTINCT FROM 'null' THEN RAISE EXCEPTION 'invalid-content' USING ERRCODE='22023'; END IF;
    ELSE
      IF jsonb_typeof(ctx) IS DISTINCT FROM 'object'
        OR EXISTS(SELECT 1 FROM jsonb_object_keys(ctx) k WHERE k NOT IN ('sourceContextId','title','content'))
        OR NOT (ctx ?& ARRAY['sourceContextId','title','content'])
        OR ctx->>'sourceContextId' IS DISTINCT FROM q.context_id::text
        OR jsonb_typeof(ctx->'content') IS DISTINCT FROM 'object' OR jsonb_typeof(ctx->'content'->'blocks') IS DISTINCT FROM 'array'
        OR (snapshot->'context'->>'title' IS NULL) <> (jsonb_typeof(ctx->'title')='null')
        OR (jsonb_typeof(ctx->'title')='string' AND length(trim(ctx->>'title'))=0)
        OR jsonb_typeof(ctx->'title') NOT IN ('null','string') THEN
        RAISE EXCEPTION 'invalid-content' USING ERRCODE='22023';
      END IF;
      ctx_hash := public.content_sha256_v1(jsonb_build_object('title',ctx->'title','content',ctx->'content')::text);
      SELECT t.context_id INTO kk_context FROM public.content_translation_contexts t
        WHERE t.source_context_id=q.context_id AND t.locale='kk' AND t.content_hash=ctx_hash;
      IF NOT FOUND THEN
        INSERT INTO public.contexts(topic_id,language,title,content)
          SELECT c.topic_id,'kk',ctx->>'title',ctx->'content' FROM public.contexts c WHERE c.id=q.context_id
          RETURNING id INTO kk_context;
        INSERT INTO public.content_translation_contexts VALUES(q.context_id,'kk',ctx_hash,kk_context);
      END IF;
      context_value := ctx->'content';
      IF ctx->>'title' IS NOT NULL THEN
        context_value := jsonb_build_object('blocks',
          jsonb_build_array(jsonb_build_object('type','text','value',ctx->>'title')) || (context_value->'blocks'));
      END IF;
    END IF;
    version_hash := 'sha256:'||public.content_sha256_v1(
      jsonb_build_object('locale','kk','type',q.type,'body',body,'explanation',entry->'explanation','context',context_value)::text);
    SELECT * INTO tl FROM public.content_translation_sources s
      WHERE s.source_question_id=q.id AND s.locale='kk' AND s.source_hash=entry->>'sourceHash' AND s.content_hash=version_hash;
    IF FOUND THEN
      IF tl.source_snapshot IS DISTINCT FROM snapshot THEN
        RAISE EXCEPTION 'operation-conflict' USING ERRCODE='22023';
      END IF;
      SELECT * INTO v FROM public.question_versions WHERE id=tl.question_version_id;
    ELSE
      -- Find or create the single KK row of this source (unique index from 0018).
      SELECT * INTO kq FROM public.questions k WHERE k.source_question_id=q.id AND k.language='kk' FOR UPDATE;
      IF NOT FOUND THEN
        -- Shaped like legacy KK rows, but never published on the legacy path.
        INSERT INTO public.questions(topic_id,context_id,source_question_id,language,type,difficulty,body,explanation,source,is_published,sort_order)
          VALUES(q.topic_id,kk_context,q.id,'kk',q.type,q.difficulty,body,entry->'explanation','reviewed_kk_translation',false,q.sort_order)
          RETURNING * INTO kq;
      ELSIF kq.topic_id<>q.topic_id OR kq.type<>q.type THEN
        RAISE EXCEPTION 'inconsistent-translation' USING ERRCODE='22023';
      END IF;
      IF EXISTS(SELECT 1 FROM public.question_versions x WHERE x.question_id=kq.id AND (x.family_id<>family OR x.locale<>'kk')) THEN
        RAISE EXCEPTION 'inconsistent-family' USING ERRCODE='22023';
      END IF;
      SELECT coalesce(max(revision),0)+1 INTO next_revision FROM public.question_versions WHERE question_id=kq.id;
      INSERT INTO public.question_versions(question_id,family_id,revision,locale,type,public_body,grading_body,explanation,context_snapshot,content_hash)
        VALUES(kq.id,family,next_revision,'kk',q.type,body-'correct',body,entry->'explanation',context_value,version_hash) RETURNING * INTO v;
      INSERT INTO public.question_publications(question_version_id,status) VALUES(v.id,'draft');
      INSERT INTO public.content_translation_sources VALUES(v.id,q.id,ru_v.id,entry->>'sourceHash',snapshot,'kk',version_hash);
    END IF;
    versions := versions||jsonb_build_array(jsonb_build_object('sourceId',q.id,'questionId',v.question_id,
      'versionId',v.id,'familyId',v.family_id,'contentHash',v.content_hash,'locale','kk'));
  END LOOP;
  result:=jsonb_build_object('batchId',batch_id,'locale','kk','versions',versions);
  INSERT INTO public.content_import_receipts VALUES(batch_id,batch_hash,request_value,result);
  INSERT INTO public.audit_events(actor_kind,event_type,entity_type,entity_id,operation_id,metadata)
    VALUES('system','content.translation.imported','content_batch',batch_id,batch_id,jsonb_build_object('result','accepted','count',jsonb_array_length(versions),'schema_version','v1'));
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.content_accept_version_kk_v1(version_id UUID,content_hash TEXT,math_review_ref TEXT,language_review_ref TEXT,source_rights_ref TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  v public.question_versions%ROWTYPE;
  s public.content_translation_sources%ROWTYPE;
  p public.question_publications%ROWTYPE;
  q public.questions%ROWTYPE;
  ru_status TEXT; ru_family UUID;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout','2s',true);
  IF version_id IS NULL OR content_hash IS NULL
    OR coalesce(length(trim(math_review_ref)),0)=0 OR coalesce(length(trim(language_review_ref)),0)=0
    OR coalesce(length(trim(source_rights_ref)),0)=0 THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE='22023';
  END IF;
  SELECT * INTO s FROM public.content_translation_sources WHERE question_version_id=version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not-found' USING ERRCODE='22023'; END IF;
  SELECT * INTO q FROM public.questions WHERE id=s.source_question_id FOR SHARE;
  IF NOT FOUND OR NOT q.is_published OR q.language<>'ru' THEN RAISE EXCEPTION 'stale-source' USING ERRCODE='22023'; END IF;
  IF q.context_id IS NOT NULL THEN
    PERFORM 1 FROM public.contexts c WHERE c.id=q.context_id AND c.language='ru' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'stale-source' USING ERRCODE='22023'; END IF;
  END IF;
  IF public.content_source_snapshot_v1(q.id) IS DISTINCT FROM s.source_snapshot THEN
    RAISE EXCEPTION 'stale-source' USING ERRCODE='22023';
  END IF;
  -- The RU version the translation was made from must still be approved.
  SELECT rp.status, rv.family_id INTO ru_status, ru_family FROM public.question_publications rp
    JOIN public.question_versions rv ON rv.id=rp.question_version_id
    WHERE rp.question_version_id=s.source_version_id FOR SHARE OF rp;
  IF ru_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'source-not-approved' USING ERRCODE='22023'; END IF;
  SELECT * INTO v FROM public.question_versions WHERE id=version_id;
  IF v.family_id IS DISTINCT FROM ru_family OR v.locale<>'kk' THEN RAISE EXCEPTION 'inconsistent-family' USING ERRCODE='22023'; END IF;
  IF v.content_hash IS DISTINCT FROM content_hash THEN RAISE EXCEPTION 'hash-mismatch' USING ERRCODE='22023'; END IF;
  SELECT * INTO p FROM public.question_publications WHERE question_version_id=version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not-found' USING ERRCODE='22023'; END IF;
  IF p.status='quarantined' THEN RETURN jsonb_build_object('error','content-quarantined'); END IF;
  IF p.status='approved' THEN
    IF p.math_review_ref IS DISTINCT FROM math_review_ref OR p.language_review_ref IS DISTINCT FROM language_review_ref
      OR p.source_rights_ref IS DISTINCT FROM source_rights_ref THEN RETURN jsonb_build_object('error','operation-conflict'); END IF;
  ELSE
    UPDATE public.question_publications SET status='approved',math_review_ref=content_accept_version_kk_v1.math_review_ref,
      language_review_ref=content_accept_version_kk_v1.language_review_ref,source_rights_ref=content_accept_version_kk_v1.source_rights_ref,
      updated_at=clock_timestamp() WHERE question_version_id=version_id;
    INSERT INTO public.audit_events(actor_kind,event_type,entity_type,entity_id,metadata)
      VALUES('system','content.translation.approved','question_version',version_id,jsonb_build_object('result','accepted','schema_version','v1'));
  END IF;
  RETURN jsonb_build_object('versionId',version_id,'contentHash',v.content_hash,'status','approved','locale','kk');
END;
$$;
REVOKE ALL ON FUNCTION public.content_sha256_v1(TEXT),
  public.content_import_reviewed_kk_v1(UUID,TEXT,TEXT,JSONB),
  public.content_accept_version_kk_v1(UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.content_sha256_v1(TEXT),
  public.content_import_reviewed_kk_v1(UUID,TEXT,TEXT,JSONB),
  public.content_accept_version_kk_v1(UUID,TEXT,TEXT,TEXT,TEXT) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
