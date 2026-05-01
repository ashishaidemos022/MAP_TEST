# Grade 4 — Reading passages: guidance and topic banks

> Hand this to Claude Code. Goal: produce a roster of ~95 reading passages for Grade 4, anchored to TEKS §110.6 (ELAR) and grounded in topics that overlap the rest of a 4th-grader's Texas curriculum (TEKS §113.15 Social Studies, §112.15 Science) and Plano ISD's scope and sequence. **Do not seed passages yet.** This brief defines the topic plan, authoring rules, and the schema insert pattern. Passage generation is a separate pass.

---

## 0. Why these topics, why this distribution

Three principles drive everything below:

1. **Reading practice should reinforce what a Plano ISD 4th grader is already learning elsewhere.** Texas-specific Social Studies content (Texas geography, Texas history, Native peoples of Texas, missions, Republic-era figures) and Texas-relevant Science content (regional ecosystems, weather, life cycles, Texas wildlife) are the highest-value informational topics because they double as content review.
2. **Genre coverage has to be broad enough to support every TEKS comprehension and craft standard we seeded.** Drama (4.9C) and argumentative (4.9E) need their own passages — you can't teach dramatic structure with a fiction excerpt. Poetry (4.9B) needs to be real poetry, not prose chopped into lines.
3. **Difficulty calibration is per-passage, not per-question.** A passage's `rit_band` constrains who sees it. Set it deliberately, then write the passage to match. Don't write whatever comes naturally and reverse-engineer the band.

The 95-passage target breaks down to roughly 33 literary / 33 informational / 14 poetry / 15 drama. Adjust by ±2 within a genre if it makes the topic bank cleaner.

---

## 1. Authoring rules (apply to every passage)

### 1.1 Length and difficulty by RIT band

The `rit_band` column on `map_reading_passages` is the difficulty anchor. Passages don't have a `grade` column — they're tied to grade implicitly through the questions that reference them.

| `rit_band` | Word count | Approx. Lexile | Sentence length | Vocabulary |
|---|---|---|---|---|
| `191_200` | 140–200 | 640L–740L | 8–12 words | High-frequency + a few grade-level academic words |
| `201_210` | 180–260 | 740L–840L | 10–14 words | Grade-level academic vocabulary; some inferred-meaning words |
| `211_220` | 220–300 | 840L–940L | 12–16 words | Tier-2 vocabulary common; one or two domain-specific terms |
| `221_230` | 260–340 | 940L–1010L | 13–18 words | Multiple Tier-2 words; sentence variety expected |
| `above_230` | 280–380 | 1000L+ | Mix of 14–22 word sentences | Tier-3 / academic; figurative density okay |

Poetry is the exception: word count is much shorter (60–160 words) regardless of band. Difficulty in poetry comes from figurative density and inference load, not length.

### 1.2 Counts that map to questions

Each passage gets **4–6 questions**. The composer pulls whole passages, never partial. So at 95 passages × ~5 questions = ~475 reading questions, which lines up with the 460-question target from the seeding brief.

### 1.3 Universal authoring rules

- **Original prose. No copyrighted material.** No reproduction of TEA frameworks, Plano ISD curriculum text, Khan Academy passages, or any published children's book. Topical reference only.
- **One main idea per passage.** A 4th-grade comprehension passage that branches into three loosely connected sub-ideas is unteachable.
- **Inferences must have textual evidence.** If a child can't point to two specific sentences that support an inference, the passage isn't ready for an inference question.
- **Diverse names and contexts.** Use the established naming pool: Maya, Ethan, Priya, Liam, Ava, Aarav, Zoe, Diego, Hana, Soren, Imani, Theo, Nia. Plano is genuinely diverse — children of South Asian, East Asian, Hispanic, Black, and white families should all see themselves in the literary content.
- **Age-appropriate.** No on-page violence, no romantic content, no scary content beyond mild suspense. Texas history topics like the Alamo are covered at the level of "what happened and why people remember it" — not battlefield detail. Slavery and Reconstruction are excluded from this pass; they require careful handling that's better done with parent-side review.
- **Read-aloud-friendly.** TTS still has to read these. Avoid layouts that depend on visual alignment (charts in prose, ASCII art).
- **No accents transcribed phonetically.** Diverse characters speak in their own grammatically standard voice.
- **Respect Texas without mythologizing.** The Battle of the Alamo passage describes what happened and why it became a Texas symbol; it doesn't romanticize. Spanish missions are described with both their religious purpose and their effect on Indigenous peoples. Native peoples of Texas are described as living, present-day communities, not artifacts.

### 1.4 Genre-specific rules

**Literary fiction** — must have:
- A named main character with a clear small problem or change
- A setting specific enough to picture (school cafeteria, grandmother's kitchen, Big Bend trail — not "a place")
- One or two figurative language moments (simile, metaphor, personification) that support TEKS 4.9B questions
- A satisfying or thought-provoking ending — not a cliffhanger

**Informational** — must have:
- A clear central idea stated or strongly implied in the first or last paragraph (supports 4.9D.i and 4.6G)
- 2–4 supporting details with concrete examples (numbers, names, places)
- At least one *text feature* on most passages: a heading, a labeled diagram (inline SVG), a fact box, a caption, or a bolded key term. This supports 4.9D.ii questions; without features, that whole standard goes untested.
- An "author's purpose" that's identifiable (inform, explain how, describe) and distinct from argumentative

**Poetry** — must have:
- A clear poetic form (free verse, rhymed couplets, quatrains, concrete/shape, haiku-style — not a paragraph with line breaks)
- At least two figurative language devices the child can name and locate
- A discernible mood or speaker stance (so 4.10E point-of-view questions have something to hook into)

**Drama** — must have:
- A title with act/scene labels (e.g., "The Lost Library Book — Scene 1")
- A character list at the top
- Stage directions in italics or square brackets, distinct from dialogue
- Character tags on every line of dialogue (`MAYA: ...`)
- A conflict that resolves within the scene

**Argumentative** (subset of informational, ~3 passages) — must have:
- A clearly stated claim
- 2–3 reasons supporting the claim
- At least one identifiable opinion word vs. fact statement contrast
- A target audience the reader can name (kids, parents, school board, etc.)

---

## 2. Topic banks

These are intentionally over-listed. Pick from them; don't feel obligated to use every entry. Where Texas content overlaps another grade-level subject, that overlap is called out explicitly.

### 2.1 Literary fiction (~33 passages)

The bank is organized by *story type*, not topic, because the same setting (a Texas ranch, a Plano apartment, a school) can produce many different stories. Aim for variety across types.

**Realistic contemporary (16 passages)** — set in present-day Texas, school, neighborhood, family.
- A new student at Plano ISD navigating their first week (Aarav, Hana, or similar)
- A child convincing a grandparent to try a food the grandparent thinks is "not for them"
- Two siblings dividing chores fairly when one wants to renegotiate
- A child who breaks something accidentally and has to decide whether to confess
- A backyard project (garden, fort, lemonade stand) that runs into an unexpected problem
- A pet (dog, cat, parakeet, lizard) that has a quiet need the family doesn't notice at first
- A school cafeteria moment about who sits with whom
- A library or bookstore discovery that changes a kid's reading
- Cricket match between cousins where the youngest player makes the difference (cricket is widely played in Plano's South Asian community)
- A community event (Diwali, Lunar New Year, Día de los Muertos, Eid, a neighborhood block party) seen through a child's eyes
- A talent show where the child rethinks what "winning" means
- A family road trip stop in a small Texas town
- Sibling teaching another sibling to ride a bike or skateboard
- A kid noticing a classmate is having a bad day and quietly helping
- A piece of art project that doesn't go as planned
- A snow day in north Texas (rare, memorable, supports an inference about pacing)

**Historical fiction set in Texas (8 passages)** — connect to TEKS §113.15 Social Studies content.
- A Caddo child's day in an East Texas village (pre-contact era; daily life, family roles)
- A child traveling with the Old Three Hundred settlers to Stephen F. Austin's colony
- A child in San Antonio in the 1830s witnessing the early Republic
- A child working at a 19th-century cattle ranch alongside a Tejano vaquero
- A child arriving at Galveston as part of the wave of German or Czech immigrants in the 1840s–50s
- A child in a small Texas town during the Spindletop oil boom (1901)
- A Mexican-American child in 1930s South Texas during the Great Depression
- A child in 1960s Houston watching a relative who works at NASA's Mission Control

**Adventure / problem-solving (5 passages)**
- A class field trip to Big Bend where someone gets briefly separated
- A camping trip on the Texas coast where weather changes
- A geocaching or scavenger hunt with a misread clue
- A bicycle breakdown on a long trail
- A power outage during a thunderstorm

**Animal protagonist or strong animal element (4 passages)**
- A horned lizard hiding from a hawk (uses real Texas wildlife)
- A monarch butterfly's stop in Texas during fall migration
- A barn cat solving a mouse problem on a Hill Country ranch
- An armadillo getting into a backyard

### 2.2 Informational (~33 passages)

Cluster A and Cluster B are the highest-leverage groups because they reinforce other curriculum.

**Cluster A — Texas geography and natural history (8 passages)**
- The four regions of Texas: Mountains and Basins, Great Plains, North Central Plains, Coastal Plains (one passage that overviews them, plus one focused on a single region)
- The Rio Grande from headwaters to gulf
- Big Bend National Park ecosystems
- Hurricanes on the Texas Gulf Coast (what they are, how they form, why they matter — recent examples like Harvey 2017 are appropriate as factual reference)
- The Edwards Aquifer and why groundwater matters in central Texas
- Texas drought and the Trinity River
- Native trees of Texas: live oak, pecan (state tree), bald cypress
- The Llano Estacado (Staked Plains) and how its flatness shaped settlement

**Cluster B — Texas history and people (8 passages)**
- Cabeza de Vaca's journey across what is now Texas (1528–1536)
- Spanish missions in San Antonio (the UNESCO site context, including their effect on Indigenous peoples)
- Stephen F. Austin and the founding of Anglo Texas settlement
- The Battle of the Alamo and what it represents (factual, not glorified)
- Sam Houston's life across three governments (US, Republic of Texas, US again)
- The Buffalo Soldiers in West Texas
- Bessie Coleman, first African-American woman to earn a pilot's license, born near Atlanta, Texas
- The Caddo Confederacy: a sophisticated mound-building society in East Texas

**Cluster C — Science topics aligned to Grade 4 Science TEKS (8 passages)**
- The water cycle, with Texas weather as the example
- Food chains in a Texas prairie ecosystem
- Adaptations: how the horned lizard, roadrunner, or jackrabbit survive
- The phases of the moon (4th-grade science)
- Why Texas has tornadoes (and what to do during one)
- The life cycle of the monarch butterfly (with the Texas migration corridor)
- States of matter using everyday Texas examples (ice in a cooler, water on a hot road, steam from a kettle)
- How a hurricane forms over the Gulf

**Cluster D — Biographies and people (5 passages)**
- A scientist or inventor (Mae Jemison; Norman Borlaug, Iowa-born but University of Texas connection; or a contemporary Texan scientist)
- An athlete (Simone Biles trained in Texas; or a state-level figure)
- A Plano ISD or DFW-area community figure (a librarian, fire captain, civic role)
- An author who writes for kids (Joan Lowery Nixon; Pat Mora; in the spirit of, not quoting from)
- A musician with Texas roots (Selena, written age-appropriately about her musical legacy)

**Cluster E — How things work / general informational (4 passages)**
- How a public library works behind the scenes
- How a dam generates electricity (Lake Buchanan or Lake Travis)
- How a cotton plant becomes a t-shirt
- How a city handles trash and recycling

### 2.3 Poetry (~14 passages)

Poetry needs *form* variety, not just topic variety. Aim for:

**Form coverage:**
- 3 free verse
- 3 rhymed quatrains or couplets
- 2 haiku-style (3-line nature observations)
- 2 concrete / shape poems (for example, a poem about a tree shaped like a tree)
- 2 narrative poems (a tiny story in verse)
- 2 list poems

**Topic ideas (pick to fit forms):**
- A bluebonnet field in spring
- The sound of cicadas at dusk in Texas summer
- A grandmother's hands while making tortillas, samosas, or biscuits
- The first day of school
- A pet dog dreaming
- A thunderstorm rolling in
- A library on a Saturday morning
- A favorite hoodie
- The night sky over West Texas
- Ice cream truck arriving
- Walking home in the rain
- A jar of fireflies (or a jar of marbles)
- A letter from a cousin far away
- The Gulf at sunrise
- A skateboard
- An empty playground after school

Make sure at least 8 of the 14 contain *named* figurative devices (simile, metaphor, personification) so 4.9B questions have material.

### 2.4 Drama (~15 passages)

Drama is the most underserved genre in most reading practice — kids rarely encounter it. Each scene is one short scene (a complete unit of action, ~200–320 words including stage directions).

**Format coverage:**
- 5 contemporary realistic
- 4 historical (Texas history settings, kid-appropriate)
- 3 folktale / fable adaptations (original wording, traditional structure)
- 3 informational/educational dramatizations (a science concept dramatized as a scene)

**Specific scene ideas:**

*Contemporary realistic:*
- "The Lost Library Book" — a kid retracing where they left a book
- "Soccer Tryouts" — two friends with different skill levels supporting each other
- "The Family Recipe" — three generations debating how to make a dish
- "Science Fair Morning" — last-minute project crisis
- "The New Neighbor" — first conversation between two future friends

*Historical:*
- A scene at a Spanish mission school, 1750s
- A scene with a child meeting Sam Houston during the Republic era
- A Galveston dock scene with a newly arrived immigrant family, 1850s
- A scene at a small-town general store during the oil boom

*Folktale adaptations (original wording, attributed in source_note):*
- A Texas-flavored coyote-and-roadrunner trickster scene
- A South Asian Panchatantra-inspired tale (the user's child has South Asian heritage; this belongs in the bank)
- A Mexican folktale, e.g., "La Llorona" reframed for age — actually skip La Llorona, too scary; use a kinder tale like "The Tortilla Lady" instead

*Educational dramatizations:*
- "Inside a Cloud" — water droplets as characters discussing the water cycle
- "The Settlers' Decision" — a fictional family discussing whether to homestead, embedded with real geography
- "Court of the Vowels" — a grammatical concept dramatized (also useful for 4.11D.* language passages if you want cross-subject reuse)

---

## 3. Distribution targets and band assignment

Across all 95 passages, the band distribution should mirror the overall reading-bank target from the seeding brief:

| Band | Passage share | ~count | Notes |
|---|---|---|---|
| `191_200` | 15% | ~14 | Below-on-grade; shorter passages, simpler vocabulary |
| `201_210` | 35% | ~33 | Densest tier; on-grade BOY/MOY |
| `211_220` | 30% | ~28 | Second-densest; on-grade MOY/EOY |
| `221_230` | 12% | ~12 | Stretch |
| `above_230` | 8% | ~8 | High stretch / gifted |

**Band-by-genre guidance:**
- Drama tilts on-grade (`201_210`, `211_220`); the format itself adds difficulty even at moderate vocabulary.
- Poetry can go all the way up — figurative density makes the band, not word count. Put your 1–2 most figuratively dense pieces in `above_230`.
- Texas-history informational passages cluster `211_220`+ because the named places, dates, and people raise vocabulary load.
- Animal-protagonist literary fiction is a good place for `191_200` accessibility.

**Set the band before writing.** Write the passage to fit the band, not the other way around.

---

## 4. Schema mechanics

### 4.1 Insert pattern

```sql
INSERT INTO map_reading_passages (title, body, genre, word_count, lexile, rit_band, source, topic)
VALUES (
  'The Horned Lizard''s Quiet Day',
  $body$Out on the dry edge of West Texas, where the sun bakes the rocks and the wind smells of mesquite, a horned lizard sat very, very still.

[... full passage body, paragraphs separated by blank lines ...]
$body$,
  'literary',
  214,           -- actual count of body words
  780,           -- estimated Lexile
  '201_210',
  'original',    -- always 'original' for this pass
  'Texas wildlife: horned lizard adaptation'  -- short topic tag for indexing
);
```

Notes:
- `body` uses `$body$ ... $body$` dollar-quoting so apostrophes and quotes inside don't need escaping.
- `word_count` should be the actual count, not the target. Compute it before insert.
- `lexile` is a best-estimate integer. You don't need a Lexile API; aim for the band table in §1.1 and round to the nearest 10.
- `genre` is one of: `literary`, `informational`, `poetry`, `drama` (the existing enum).
- `topic` is freeform short text — useful for filtering and avoiding duplicates. Keep it ≤80 chars. Examples: "Texas geography: four regions", "Caddo daily life", "First-day-of-school anxiety".
- `source` stays `'original'` for everything in this pass.

### 4.2 Drama formatting in `body`

Drama passages need a stable internal structure so the runner UI can render them readably. Use this convention:

```
THE LOST LIBRARY BOOK
Scene 1

Characters:
  PRIYA — a fourth grader
  MR. CHEN — the school librarian
  ETHAN — Priya's classmate

[The school library, after lunch. PRIYA stands at the front desk, looking worried.]

PRIYA: Mr. Chen, I think I lost it.

MR. CHEN: Lost what, Priya?

PRIYA: [reaching into her backpack] The book about Cabeza de Vaca. I had it yesterday at recess.

[ETHAN enters, holding a book.]

ETHAN: Is this the one?
```

Stage directions in square brackets. Character tags in ALL CAPS followed by colon. Blank line between speakers. Title and scene at top, character list under "Characters:" header.

### 4.3 Poetry formatting in `body`

Preserve line breaks exactly. Don't justify. Title on the first line, blank line, then the poem.

```
Bluebonnet Field

The hill puts on her purple dress
in April, just for show.
She does not know
how many cars will slow,
how many phones will tilt to take her picture.
She only knows the wind, the bees,
and how to stand still
while spring goes by.
```

### 4.4 Inline SVG for informational text features

When a passage needs a labeled diagram (water cycle, map of Texas regions, food chain) to support 4.9D.ii questions, the diagram lives **on the passage's questions**, not inside `body`. Specifically:

- The passage `body` contains the prose only.
- A single dedicated question on that passage uses `stem_image_svg` for the labeled diagram.
- Other questions on the same passage can reference the diagram in their stems ("Look at the diagram. Which arrow shows…").

This keeps `body` clean for TTS read-aloud and lets the diagram render at appropriate size in the question UI.

### 4.5 Topic uniqueness check

Before inserting, query for likely duplicates:

```sql
SELECT topic, count(*) FROM map_reading_passages
GROUP BY topic HAVING count(*) > 1;
```

Two passages can share a topic tag (e.g., two different poems about Texas weather) but you should be able to articulate what's distinct about them.

---

## 5. Order of operations

1. **Decide the topic plan.** Pick exactly which passages from the §2 banks you'll author, write the list, and assign each its genre, target band, target word count, and topic tag. Surface the list before writing any passages — confirms the genre and band distribution before you've spent generation budget.
2. **Author Cluster A and Cluster B informational first** (Texas geography, Texas history). These have the most concrete factual content and are the slowest to author well; doing them while attention is fresh prevents accuracy drift.
3. **Author drama next.** Drama is the most format-heavy and the most easily botched. Doing it second means the format conventions are still calibrated.
4. **Author literary fiction in batches by story type.** Realistic contemporary, then historical fiction, then adventure, then animal stories.
5. **Author poetry last.** Poetry is the easiest to revise quickly if patterns emerge. Doing it last means you've seen what a 4th-grade reading bank looks like.
6. **Author argumentative passages alongside informational** — they're easy to forget because they're a small subset.
7. **Insert in batches of 5–10.** After each batch, run the validation queries in §6 and a quick spot-read.

Don't author all 95 in one prompt. Quality collapses. Aim for 3–5 passages per generation call, with explicit band, genre, target word count, and topic given in the prompt.

---

## 6. Validation

Run these after each batch and at the end.

```sql
-- Total passage count by genre
SELECT genre, count(*) FROM map_reading_passages GROUP BY genre ORDER BY genre;
-- target: literary ~33, informational ~33, poetry ~14, drama ~15

-- Band distribution
SELECT rit_band, count(*) FROM map_reading_passages GROUP BY rit_band ORDER BY rit_band;
-- compare to §3 targets (within ±3 in any single band is fine)

-- Word counts within band ranges
SELECT rit_band, min(word_count), avg(word_count)::int, max(word_count)
FROM map_reading_passages WHERE genre <> 'poetry'
GROUP BY rit_band ORDER BY rit_band;
-- compare to §1.1 ranges; anything outside the range needs a band reassignment or a rewrite

-- Lexile sanity
SELECT rit_band, min(lexile), avg(lexile)::int, max(lexile)
FROM map_reading_passages WHERE genre <> 'poetry'
GROUP BY rit_band ORDER BY rit_band;
-- the average per band should sit roughly within the §1.1 lexile column

-- No empty topic tags
SELECT count(*) FROM map_reading_passages WHERE topic IS NULL OR topic = '';
-- expect 0

-- Duplicate-title check
SELECT title, count(*) FROM map_reading_passages
GROUP BY title HAVING count(*) > 1;
-- expect 0 rows
```

A read-aloud spot check: pick 10 random passages and run them through `window.speechSynthesis`. If a poem reads as gibberish, its line breaks and punctuation aren't TTS-friendly. If a drama passage reads as continuous prose, its character tags need rework.

---

## 7. Sources used to design this plan

These informed the topic banks. Don't quote from them; topical reference only.

- **TEKS §110.6** — English Language Arts and Reading, Grade 4 (Texas Administrative Code). Defines the genre coverage, comprehension skills, and craft elements. https://tea.texas.gov
- **TEKS §113.15** — Social Studies, Grade 4. Texas history is the spine of Grade 4 SS in Texas; reading passages that overlap this content reinforce learning across both subjects. https://tea.texas.gov
- **TEKS §112.15** — Science, Grade 4. Drives the Cluster C science topic choices. https://tea.texas.gov
- **STAAR Grade 4 Reading test specifications** — informs which genres and skills get tested, how often. https://tea.texas.gov/student-assessment/staar/staar-resources
- **Plano ISD ELAR Scope and Sequence** — what's taught, in roughly what order, across the year. https://www.pisd.edu/Page/16620
- **Lexile Framework / MetaMetrics** — text complexity calibration. The 740L–940L range for on-grade Grade 4 is widely cited; we're using 640L–1010L+ across our band span. https://lexile.com
- **NWEA MAP Growth Reading goal areas** — Literature, Informational Text, Vocabulary, Foundational Skills. The genre mix in §3 maps to these goal areas. https://www.nwea.org
- **NAEP Reading Framework, Grade 4** — for "what 4th graders read" benchmarks (literary 50% / informational 50% on NAEP, which we approximate with our 35/35 + 15/15 split). https://nces.ed.gov/nationsreportcard/reading
- **Texas Almanac** (Texas State Historical Association) — for factual checking on Texas geography, history, and natural history topics. https://www.texasalmanac.com

---

## 8. What NOT to include

- No on-page violence, graphic detail of historical battles, or scary imagery beyond mild suspense.
- No romantic content. Crushes, dating, kissing — all out of scope.
- No reproduction of copyrighted children's books, poems, or song lyrics. Original wording always.
- No partisan political content. Texas civics topics that involve current political debate (border policy, redistricting, contemporary state-vs-federal disputes) are out of scope.
- No religious content presented as fact. Religious topics can appear as cultural background (a Diwali celebration in a story, a Spanish mission's purpose) but never proselytize.
- No content depicting modern Indigenous peoples as historical artifacts. Caddo, Comanche, and Apache people exist today; passages set in the past should make this clear or stay in the past tense without "the Caddo were…" framing that suggests extinction.
- No trauma-heavy historical content in this pass. Slavery, the Trail of Tears, the Mexican-American War, lynching-era violence: all real, all part of Texas history, all out of scope for a single Grade 4 reading passage. These need adult mediation; deferring them is the right call.
- No real, identifiable, living public figures by name in literary fiction. Historical figures in informational passages are fine.

---

## 9. Stop here

Once the topic plan is reviewed and confirmed, the next step is passage generation. **Do not generate passages as part of this brief.** Surface the topic plan first, get sign-off, and then move to authoring.
