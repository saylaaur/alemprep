-- L01: immutable content revisions and the storage boundary for trusted learning.
-- This is an expand-only migration. Existing sessions and attempts remain legacy
-- (integrity_version = 0) until the L02 service path creates v1 facts.

CREATE TABLE public.question_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  family_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  locale TEXT NOT NULL CHECK (locale IN ('ru', 'kk')),
  type public.question_type NOT NULL,
  public_body JSONB NOT NULL CHECK (NOT (public_body ? 'correct')),
  grading_body JSONB NOT NULL,
  explanation JSONB,
  context_snapshot JSONB,
  content_hash TEXT NOT NULL CHECK (char_length(content_hash) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id, revision)
);

CREATE TABLE public.question_publications (
  question_version_id UUID PRIMARY KEY REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'quarantined')),
  math_review_ref TEXT,
  language_review_ref TEXT,
  source_rights_ref TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sessions
  ADD COLUMN integrity_version SMALLINT NOT NULL DEFAULT 0 CHECK (integrity_version IN (0, 1)),
  ADD COLUMN operation_id UUID,
  ADD COLUMN status TEXT,
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD COLUMN scoring_version TEXT,
  ADD COLUMN manifest_hash TEXT,
  ADD COLUMN receipt JSONB;

UPDATE public.sessions
SET status = CASE WHEN finished_at IS NULL THEN 'active' ELSE 'submitted' END
WHERE status IS NULL;

ALTER TABLE public.sessions
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL,
  ADD CONSTRAINT sessions_status_check CHECK (status IN ('active', 'submitted', 'expired', 'cancelled'));

CREATE TABLE public.session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE RESTRICT,
  question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, position),
  UNIQUE (session_id, question_version_id)
);

ALTER TABLE public.attempts
  ADD COLUMN session_item_id UUID REFERENCES public.session_items(id) ON DELETE RESTRICT,
  ADD COLUMN integrity_version SMALLINT NOT NULL DEFAULT 0 CHECK (integrity_version IN (0, 1)),
  ADD COLUMN points INTEGER,
  ADD COLUMN max_points INTEGER;

ALTER TABLE public.attempts
  DROP CONSTRAINT attempts_question_id_fkey,
  ADD CONSTRAINT attempts_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT attempts_points_check CHECK (points IS NULL OR points >= 0),
  ADD CONSTRAINT attempts_max_points_check CHECK (max_points IS NULL OR max_points >= 0),
  ADD CONSTRAINT attempts_points_lte_max_check CHECK (
    points IS NULL OR max_points IS NULL OR points <= max_points
  );

CREATE UNIQUE INDEX attempts_session_item_unique
  ON public.attempts(session_item_id)
  WHERE session_item_id IS NOT NULL;

CREATE TABLE public.operation_receipts (
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('learning.start', 'learning.submit')),
  payload_hash TEXT NOT NULL CHECK (char_length(payload_hash) > 0),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, operation_id)
);

CREATE TABLE public.reward_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE RESTRICT,
  reward_key TEXT NOT NULL CHECK (char_length(reward_key) > 0),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, reward_key, day)
);

CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'operator', 'system')),
  event_type TEXT NOT NULL CHECK (char_length(event_type) > 0),
  entity_type TEXT NOT NULL CHECK (char_length(entity_type) > 0),
  entity_id UUID,
  school_id UUID,
  operation_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Audit metadata is deliberately a compact code-only envelope. It cannot be
-- used as a second payload store for answers, email addresses, cookies or keys.
CREATE OR REPLACE FUNCTION public.audit_metadata_is_safe(value JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  entry RECORD;
  scalar TEXT;
BEGIN
  IF pg_catalog.jsonb_typeof(value) <> 'object' THEN
    RETURN false;
  END IF;

  FOR entry IN SELECT * FROM pg_catalog.jsonb_each(value) LOOP
    scalar := entry.value #>> '{}';
    CASE entry.key
      WHEN 'result' THEN
        IF pg_catalog.jsonb_typeof(entry.value) <> 'string'
          OR scalar NOT IN ('accepted', 'rejected', 'started', 'completed', 'cancelled', 'failed') THEN
          RETURN false;
        END IF;
      WHEN 'reason_code' THEN
        IF pg_catalog.jsonb_typeof(entry.value) <> 'string'
          OR scalar NOT IN (
            'normal',
            'invalid-input',
            'forbidden',
            'expired',
            'already-submitted',
            'operation-conflict',
            'content-unavailable',
            'rate-limited',
            'temporarily-unavailable'
          ) THEN
          RETURN false;
        END IF;
      WHEN 'count' THEN
        IF pg_catalog.jsonb_typeof(entry.value) <> 'number'
          OR scalar !~ '^[0-9]{1,7}$' THEN
          RETURN false;
        END IF;
      WHEN 'schema_version' THEN
        IF entry.value <> '"v1"'::jsonb THEN
          RETURN false;
        END IF;
      ELSE
        RETURN false;
    END CASE;
  END LOOP;

  RETURN true;
END;
$$;

ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_safe_metadata_check CHECK (public.audit_metadata_is_safe(metadata));

CREATE OR REPLACE FUNCTION public.reject_question_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'question versions are immutable; create a new revision instead';
END;
$$;

CREATE TRIGGER question_versions_reject_update
  BEFORE UPDATE ON public.question_versions
  FOR EACH ROW EXECUTE FUNCTION public.reject_question_version_mutation();

CREATE TRIGGER question_versions_reject_delete
  BEFORE DELETE ON public.question_versions
  FOR EACH ROW EXECUTE FUNCTION public.reject_question_version_mutation();

-- No existing legacy history is upgraded to trusted data by this migration.
CREATE OR REPLACE FUNCTION public.reject_legacy_integrity_upgrade()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.integrity_version = 0 AND NEW.integrity_version <> 0 THEN
    RAISE EXCEPTION 'legacy learning facts cannot be upgraded in place';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sessions_reject_legacy_integrity_upgrade
  BEFORE UPDATE OF integrity_version ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.reject_legacy_integrity_upgrade();

CREATE TRIGGER attempts_reject_legacy_integrity_upgrade
  BEFORE UPDATE OF integrity_version ON public.attempts
  FOR EACH ROW EXECUTE FUNCTION public.reject_legacy_integrity_upgrade();

CREATE INDEX session_items_session_position_idx ON public.session_items(session_id, position);
CREATE INDEX attempts_session_idx ON public.attempts(session_id);
CREATE INDEX audit_events_school_occurred_idx ON public.audit_events(school_id, occurred_at DESC, id);
CREATE INDEX audit_events_entity_occurred_idx ON public.audit_events(entity_type, entity_id, occurred_at);
CREATE INDEX operation_receipts_created_idx ON public.operation_receipts(created_at);
CREATE INDEX reward_ledger_user_day_idx ON public.reward_ledger(user_id, day);

ALTER TABLE public.question_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- These tables are internal facts. L02 accesses them through service-only RPC;
-- browser roles get neither grants nor permissive RLS policies.
REVOKE ALL ON TABLE public.question_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.question_publications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.session_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.operation_receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reward_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.audit_events FROM PUBLIC, anon, authenticated;
