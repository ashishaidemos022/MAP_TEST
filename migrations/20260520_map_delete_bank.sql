-- =========================================================================
-- Migration: map_delete_bank  (Delete a Bank)
-- Project:   klhzfwxpztaojekwgzcg
-- Spec:      docs/superpowers/specs/2026-05-19-delete-bank-design.md
--
-- Adds map_soft_delete_bank(p_bank_id): family-scoped soft-delete of a
-- question bank. Blocks when ANY map_bank_assignments row references the
-- bank. No schema change (map_question_banks.soft_deleted_at already exists;
-- listBanks already filters it). Idempotent, single transaction.
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.map_soft_delete_bank(p_bank_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.map_current_family_id();
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'no family for current user';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.map_question_banks
     WHERE id = p_bank_id
       AND family_id = v_family
       AND soft_deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'bank not found or not yours';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.map_bank_assignments WHERE bank_id = p_bank_id
  ) THEN
    RAISE EXCEPTION 'This bank has been assigned and can''t be deleted. Revoke its assignments first.';
  END IF;
  UPDATE public.map_question_banks
     SET soft_deleted_at = now(), updated_at = now()
   WHERE id = p_bank_id AND family_id = v_family;
END
$$;

COMMIT;
