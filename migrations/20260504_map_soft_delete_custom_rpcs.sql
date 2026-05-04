-- Soft-delete RPCs for the parent UI (Cycle 3). Direct UPDATE through
-- PostgREST returns 403 because the post-update row no longer satisfies
-- the SELECT policy (soft_deleted_at IS NULL is in the SELECT filter), so
-- RETURNING comes back empty and PostgREST surfaces it as Forbidden.
-- SECURITY DEFINER RPCs bypass that round-trip while still enforcing
-- family ownership the same way map_publish_custom_question does.
--
-- Already applied 2026-05-04 via apply_migration; this file is for repo audit.

CREATE OR REPLACE FUNCTION public.map_soft_delete_custom_question(p_question_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.map_custom_questions
     SET soft_deleted_at = now(), updated_at = now()
   WHERE id = p_question_id
     AND family_id = public.map_current_family_id()
     AND soft_deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found, not yours, or already deleted';
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_soft_delete_custom_question(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.map_soft_delete_custom_passage(p_passage_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.map_custom_passages
     SET soft_deleted_at = now(), updated_at = now()
   WHERE id = p_passage_id
     AND family_id = public.map_current_family_id()
     AND soft_deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'passage not found, not yours, or already deleted';
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.map_soft_delete_custom_passage(uuid) TO authenticated;
