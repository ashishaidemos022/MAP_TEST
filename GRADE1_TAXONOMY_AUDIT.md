# Grade 1 Misconception Taxonomy Audit

> **Status:** Proposal. Not yet applied to `map_misconception_tags`.
> Per `Grade1Seeding_Guide.md` §9 step 4: bring DROP/KEEP/ADD calls back for confirmation before the `extend_misconception_taxonomy_for_grade_1` migration runs.

---

## How to review

Same convention as the standards review: **A** (approve), **E** (edit), **D** (drop), or "approve all unmarked." I'll regenerate with your edits applied, then write the migration.

The migration shape is per §5.4 of the brief: `UPDATE` to `array_cat` Grade 1 codes onto KEEP tags, `INSERT` for ADD-NEW tags. DROP tags are *not* deleted — they stay live for Grade 2+ and just don't get Grade 1 codes added.

---

## Summary

| Subject | Existing | KEEP-with-G1 | DROP-for-G1 | ADD-NEW | Total after |
|---|---:|---:|---:|---:|---:|
| math | 18 | 14 | 4 | 4 | **22** |
| reading | 12 | 11 (+1 conditional) | 0 | 2 | **14** |
| language | 15 | 11 | 4 | 3 | **18** |
| **total** | **45** | **36** | **8** | **9** | **54** |

Brief's §5.4 expectations: math ≥ 18, reading ≥ 14, language ≥ 16. Result hits all three.

**Two deviations from the brief's §5.1–§5.3 proposals**, both surfaced as findings (not silently applied):

1. **Math:** brief proposal accepted in full (4 DROPs, 14 KEEPs, 4 ADDs). No deviations.
2. **Reading:** `affix_meaning_confusion` flagged as "conditional KEEP" — its existing description is derivational (un-, re-, -ful, -less), but Grade 1 only has inflectional endings (-s, -ed, -ing). Two clean options listed in §2.1 below.
3. **Language:** brief proposed KEEPing `compound_word_formation` and `confused_synonym_with_antonym` for Grade 1, but TAC §110.3(b)(11)(D) doesn't include compound words or synonyms/antonyms as Grade 1 conventions. **Recommendation: DROP both for Grade 1.** See §3.1 below.

---

## 1. Math — 22 tags after audit

### 1.1 KEEP-with-G1-codes-added (14 tags)

| Tag | Grade 1 codes to add |
|---|---|
| `_misc_other` | (none — universal catch-all) |
| `comparison_ordering_misread` | `1.2E`, `1.2F`, `1.2G` |
| `fraction_equal_parts_or_size` | `1.6G`, `1.6H` |
| `graph_or_table_misread` | `1.8B`, `1.8C` |
| `measurement_unit_size` | `1.7B`, `1.7C`, `1.7D` |
| `money_value_or_notation` | `1.4A`, `1.4B`, `1.4C` |
| `number_line_position` | `1.2F`, `1.5B`, `1.5C` |
| `off_by_one_count` | `1.2A`, `1.3B`, `1.5B`, `1.5D`, `1.7A`, `1.7B`, `1.7D`, `1.8A` |
| `operation_swap_add_subtract` | `1.3A`, `1.3B`, `1.3D`, `1.3F`, `1.5D`, `1.5F` |
| `place_value_concatenated_digits` | `1.2A`, `1.2B`, `1.2C`, `1.3A`, `1.3D` |
| `place_value_misread_column` | `1.2A`, `1.2B`, `1.2C`, `1.2D`, `1.2E` |
| `shape_attribute_partial_match` | `1.6A`, `1.6B`, `1.6D`, `1.6E`, `1.6F` |
| `skip_count_wrong_amount` | `1.5B`, `1.5C` |
| `time_clock_reading` | `1.7E` |

### 1.2 DROP-for-G1 (4 tags — leave alone, do not add G1 codes)

| Tag | Reason |
|---|---|
| `equal_groups_or_array_count` | Multiplication concept; Grade 2 (2.6 series) and up. |
| `even_odd_ending_digit` | Grade 2 introduces odd/even formally (TEKS 2.7A); not in Grade 1 TAC. |
| `regrouping_borrow_error` | Grade 1 sub within 20 uses fact strategies (decompose to 10), not algorithmic borrowing. |
| `regrouping_forgot_carry` | Same — Grade 1 add within 20 uses making-10 fact strategies, not formal carry. |

### 1.3 ADD-NEW math tags (4)

All four match the brief §5.1 exactly. Field values below.

#### `teen_number_reversal`
- **display_name:** Reverses or mishears teen numbers
- **description:** Hears or writes 13 as "31", or confuses "fourteen" with "forty". Reverses tens/ones in two-digit numbers ≤ 19.
- **remediation_hint:** Use ten-frames showing 10 + 3, 10 + 4, etc. Connect the spoken word to the visible "ten and some more." Drill 13/30, 14/40, etc., as confusable pairs.
- **related_teks:** `['1.2A','1.2B','1.2C','1.2D']`
- **child_cta:** Get stronger at teen numbers

#### `make_a_ten_strategy_missed`
- **display_name:** Doesn't decompose to make 10
- **description:** When adding within 20 (e.g., 8+5), the child doesn't decompose 5 into 2+3 to make 10 first. Resorts to counting on by ones, often miscounts.
- **remediation_hint:** Practice "what makes 10?" pairs (8+2, 7+3, 6+4). For 8+5, break 5 into 2+3, build 10, add 3 more = 13.
- **related_teks:** `['1.3C','1.3D','1.5G']`
- **child_cta:** Get stronger at making 10

#### `cardinality_count_to_total`
- **display_name:** Counts items but doesn't recognize the last number as the total
- **description:** Counts 1, 2, 3, 4, 5 but when asked "how many?" recounts or guesses. Foundational K/Grade 1 number sense gap.
- **remediation_hint:** Stop after counting and ask "so how many?" The last number you said IS the total. Practice with small sets (3-7 items).
- **related_teks:** `['1.2A','1.2C','1.5B','1.8A']`
- **child_cta:** Get stronger at counting totals

#### `addition_subtraction_inverse_missed`
- **display_name:** Doesn't recognize add/subtract as inverse operations
- **description:** Doesn't see that 8+? = 13 is the same as 13−8. Treats fact-family relationships as separate facts to memorize.
- **remediation_hint:** Use fact-family triangles: 8, 5, 13 in three corners. Show all four equations: 8+5=13, 5+8=13, 13−8=5, 13−5=8. Same numbers, different arrangements.
- **related_teks:** `['1.3D','1.5F','1.5G']`
- **child_cta:** Get stronger at fact families

---

## 2. Reading — 14 tags after audit

### 2.1 KEEP-with-G1-codes-added (11 confident + 1 conditional)

| Tag | Grade 1 codes to add | Notes |
|---|---|---|
| `feelings_mismatch_evidence` | `1.6.F`, `1.7.C`, `1.8.B` | |
| `figurative_taken_literally` | `1.6.F`, `1.10.D` | |
| `genre_or_purpose_confusion` | `1.9.A`, `1.9.B`, `1.9.C`, `1.9.D.i`, `1.9.E`, `1.10.A` | |
| `inferred_without_evidence` | `1.6.F`, `1.7.C`, `1.8.A`, `1.8.B`, `1.8.C` | |
| `main_idea_picked_detail` | `1.6.G`, `1.9.D.i` | |
| `opposite_of_evidence` | `1.6.F`, `1.7.C`, `1.8.B`, `1.10.D` | |
| `response_off_topic_or_vague` | `1.6.E`, `1.7.A` | |
| `sequence_wrong_step` | `1.6.G`, `1.8.C`, `1.9.D.iii` | |
| `setting_character_misidentified` | `1.8.B`, `1.8.D` | |
| `text_features_misread` | `1.9.D.ii`, `1.10.C` | |
| `vocab_skipped_context_clues` | `1.3.B`, `1.3.D` | |
| **`affix_meaning_confusion`** | **(conditional — see below)** | Existing description is derivational (un-, re-, -ful, -less) but Grade 1 TEKS only covers inflectional endings (-s, -ed, -ing). Three options: |

**Options for `affix_meaning_confusion`:**

- **(a) Don't add Grade 1 codes.** Tag stays Grade 2+. For Grade 1 inflectional-ending vocabulary errors, distractors use `vocab_skipped_context_clues` instead. (Brief's caveat suggested this.)
- **(b) Add `1.3.C`** and broaden the tag's description to cover both inflectional and derivational. The misconception (ignoring an affix as a meaning cue) is the same error type either way.
- **(c) Add a new tag** `inflectional_ending_confusion` for Grade 1 -s/-ed/-ing errors. Keeps `affix_meaning_confusion` derivational and clean.

**My pick: (b).** Inflectional and derivational errors share the same root mechanism — the kid ignores the morpheme and just looks at the stem. Splitting tags creates taxonomy bloat for ~18 questions of authoring volume. If the migration goes (b), suggest description update to:
> "When a word has an affix — inflectional (-s, -ed, -ing) at Grade 1, derivational (un-, re-, -ful, -less) at Grade 2+ — the child ignores the affix as a meaning cue and picks a word based on the stem alone or by surface similarity."

### 2.2 DROP-for-G1: none

All 12 existing reading tags fit Grade 1 (with the conditional above).

### 2.3 ADD-NEW reading tags (2)

#### `picture_only_response`
- **display_name:** Answers from the picture instead of the text
- **description:** When a passage has both an illustration and text, picks an answer from what the picture shows rather than what the text says. Defining Grade 1 picture-book error.
- **remediation_hint:** Cover the picture and re-read the text. The answer is what the WORDS say, not what the picture shows. Picture and text usually agree, but when they don't, trust the text.
- **related_teks:** `['1.6.F','1.7.C','1.8.B','1.8.D','1.10.C']`
- **child_cta:** Get stronger at reading the words, not just the picture

#### `decoding_similar_word_picked`
- **display_name:** Picks a visually similar wrong word
- **description:** At Grade 1 decoding stage, picks "hop" instead of "hope", "ran" instead of "run", or "thin" instead of "think" — confused by visual similarity rather than meaning.
- **remediation_hint:** Slow down. Read the whole word, not just the first three letters. Check whether the meaning fits the sentence — if it doesn't, you read it wrong.
- **related_teks:** `['1.3.B','1.3.C','1.3.D']`
- **child_cta:** Get stronger at reading the whole word

---

## 3. Language — 18 tags after audit

### 3.1 Two brief recommendations I'm pushing back on

The brief's §5.3 said KEEP `compound_word_formation` (with the caveat "light — Grade 1 introduces some compounds") and KEEP `confused_synonym_with_antonym` (with attribution to "1.3.D opposites"). TAC verification:

- **`compound_word_formation`:** TAC §110.3(b)(11)(D) lists 10 sub-letters; none cover compound words. Grade 1 phonics §110.3(b)(2)(B)(iv) mentions "decode common compound words" but that's an oral decoding skill, not a 1.11.D convention. **My recommendation: DROP for Grade 1.**
- **`confused_synonym_with_antonym`:** TAC 1.3.D is "use words that name actions, directions, positions, sequences, categories, and locations" — not synonyms/antonyms. The brief misattributed to Grade 2's 2.3.D.lang. Synonyms/antonyms aren't really in Grade 1 ELAR. **My recommendation: DROP for Grade 1.**

If you push back ("don't trim further"), the alternative is: KEEP `compound_word_formation` with related_teks `1.11.D.x` (since compound-word *spelling* is plausibly orthographic), and KEEP `confused_synonym_with_antonym` with related_teks `1.3.D` (loose fit on "categories"). Both feel forced. Saying so up front since this is exactly the verification-finding pattern from the standards review.

### 3.2 KEEP-with-G1-codes-added (11 tags, assuming the §3.1 calls land as DROP)

| Tag | Grade 1 codes to add |
|---|---|
| `capitalization_rules` | `1.11.D.viii` |
| `part_of_speech_confusion` | `1.11.D.iii`, `1.11.D.iv`, `1.11.D.v`, `1.11.D.vi`, `1.11.D.vii` |
| `plural_form_confusion` | `1.11.D.iii` |
| `preposition_use` | `1.11.D.vi` |
| `pronoun_mismatch` | `1.11.D.vii` |
| `punctuation_rules` | `1.11.D.ix` |
| `sentence_completeness` | `1.11.D.i` |
| `spelling_pattern_confusion` | `1.11.D.x` |
| `spelling_recognition` | `1.11.D.x` |
| `subject_verb_agreement` | `1.11.D.i` |
| `verb_tense_confusion` | `1.11.D.ii` |

**Note on `verb_tense_confusion` description:** existing tag mentions "future" tense ("present when future is needed", "going / will go"). Grade 1 TAC §110.3(b)(11)(D)(ii) is past + present only — no future. The tag works at Grade 1 with a tightened scope; description doesn't need to change unless you want it to. (Future-tense subset stays Grade 2+.)

**Note on `plural_form_confusion`:** Grade 1 TAC says "singular, plural, common, and proper nouns" without specifying irregular plurals. The tag's description includes "mouses → mice" examples that are more Grade 2/3. Authoring discipline can stay regular-plurals-only at Grade 1 without changing the tag.

### 3.3 DROP-for-G1 (4 tags — 2 from brief + 2 from §3.1)

| Tag | Reason |
|---|---|
| `apostrophe_use_confusion` | Contractions and possessives are Grade 2+ (2.11.D.xi). Not in Grade 1 TAC. |
| `conjunction_use` | Coordinating conjunctions are Grade 2+ (2.11.D.viii). Not in Grade 1 TAC. |
| `compound_word_formation` | Not in 1.11.D (see §3.1). |
| `confused_synonym_with_antonym` | Not in Grade 1 vocabulary scope (see §3.1). |

### 3.4 ADD-NEW language tags (3)

#### `article_a_an_misuse`
- **display_name:** Picks the wrong article (a / an / the)
- **description:** Picks "a apple" or "an dog" — doesn't apply the vowel-sound rule for "an", or omits the definite article when needed. Defining Grade 1 article error.
- **remediation_hint:** Use "an" before a vowel sound (an apple, an egg). Use "a" before a consonant sound (a dog, a car). Read the sentence aloud — "a apple" sounds wrong because the two vowels collide.
- **related_teks:** `['1.11.D.iv']`
- **child_cta:** Get stronger at picking a, an, or the

#### `cvc_short_vowel_confusion`
- **display_name:** Picks the wrong short vowel in a CVC word
- **description:** When a sentence calls for "cat" the child picks "cot" or "cut" — confusing the short-a, short-o, short-u vowel sounds. Phonics-stage spelling/recognition error.
- **remediation_hint:** Anchor each short vowel to a keyword: short-a = apple, short-e = egg, short-i = igloo, short-o = octopus, short-u = umbrella. Read the word aloud and match to the keyword sound.
- **related_teks:** `['1.11.D.x']`
- **child_cta:** Get stronger at short-vowel sounds

#### `high_frequency_word_misspell`
- **display_name:** Misspells a common sight word
- **description:** Picks the wrong spelling of a high-frequency sight word — "the/teh", "was/wuz", "said/sed", "you/u", "they/thay". Sight-word foundation error.
- **remediation_hint:** Sight words have to be memorized — they don't follow regular spelling patterns. Practice with flashcards: see the word, say it, write it, check it.
- **related_teks:** `['1.11.D.x']`
- **child_cta:** Get stronger at sight-word spelling

---

## 4. Validation queries the migration will run after apply

```sql
-- Subject counts after migration
SELECT subject, count(*) AS n
FROM map_misconception_tags
GROUP BY subject ORDER BY subject;
-- expect math=22, reading=14, language=18

-- Tag/code coverage check
SELECT count(*) FROM map_misconception_tags
WHERE related_teks && ARRAY(SELECT teks_code FROM map_standards WHERE grade = 1);
-- expect ~36 (all KEEP-with-G1 + ADD-NEW have at least one G1 code)

-- Verify no Grade 1 standard is unreachable from the taxonomy
SELECT s.teks_code, s.subject
FROM map_standards s
WHERE s.grade = 1
  AND NOT EXISTS (
    SELECT 1 FROM map_misconception_tags t
    WHERE t.subject = s.subject AND t.related_teks @> ARRAY[s.teks_code]
  )
ORDER BY s.subject, s.sort_order;
-- expect: a few (some standards genuinely don't have a misconception fit, e.g.,
-- 1.11.D.viii capitalization is only covered by capitalization_rules; lighter-coverage
-- TEKS like 1.9.F multimodal may show up here)
```

---

## 5. Open questions

1. **`affix_meaning_confusion`** — pick (a), (b), or (c) from §2.1. My recommendation: (b) — add `1.3.C`, broaden description.
2. **`compound_word_formation` and `confused_synonym_with_antonym`** — confirm DROP for Grade 1 (per §3.1), or override and instruct me to KEEP with the loose mappings.
3. **Description rewrites** — do you want me to update tag descriptions for `verb_tense_confusion` (drop "future" examples for G1) and `plural_form_confusion` (call out regular vs irregular)? Or leave alone?
4. **`_misc_other` related_teks** — currently `[]`. Leave as universal catch-all, or add Grade 1 codes for completeness? Recommendation: leave as `[]`.

---

## 6. Migration shape (preview, not yet written)

```sql
-- 6a: extend related_teks on KEEP tags
UPDATE map_misconception_tags
SET related_teks = related_teks || ARRAY['1.2E','1.2F','1.2G']::text[]
WHERE tag = 'comparison_ordering_misread';
-- ... ~26 UPDATE statements (14 math KEEPs, 11-12 reading KEEPs, 11 language KEEPs)

-- 6b: insert ADD-NEW tags
INSERT INTO map_misconception_tags
  (tag, subject, display_name, description, remediation_hint, related_teks, child_cta)
VALUES
  ('teen_number_reversal', 'math', ..., ARRAY['1.2A','1.2B','1.2C','1.2D'], ...),
  ('make_a_ten_strategy_missed', 'math', ..., ARRAY['1.3C','1.3D','1.5G'], ...),
  -- ... 9 rows total (4 math + 2 reading + 3 language)
;
```

Single transaction. Idempotent UPDATEs (using `array_cat`-style append; if applied twice, codes duplicate — so the migration uses `array(SELECT DISTINCT unnest(...))` to dedupe).

---

## 7. Action you take next

Reply with:

- **"approve all"** — go with the proposal as written. Migration runs as described in §6.
- **"approve, but [Q1 pick / Q2 override / Q3 yes / Q4 specify]"** — partial approval with specific overrides on the open questions.
- Per-row edits — say "edit `tag_name` codes to X, Y, Z" or "drop `tag_name`" or "add G1 codes to `tag_name`".
- **"hold"** — surface specific concerns; I won't write the migration yet.

After your reply: write `extend_misconception_taxonomy_for_grade_1` migration as a single transaction, run §4 validation queries, then stop before Phase 3.3 (content authoring).
