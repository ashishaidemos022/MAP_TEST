// scripts/seed-g5-reading-batch01.mjs
// Grade 5 READING vetted-bank seed — batch 01. 10 passages + 48 questions.
//
// Why a node script and not a .sql migration: the vetted-bank tables
// (map_reading_passages, map_questions, map_question_choices) take plain row
// INSERTs — no DDL — so supabase-js with the service-role key can both author
// and apply them, the same way every other script in scripts/ connects. The
// G5 math seeds are DO-block .sql files that require the Supabase MCP/CLI to
// apply; this batch is self-applying and idempotent instead.
//
// Authoring rules honored (5thGradeSeedingGuide.md §6/§8 + CLAUDE.md §11):
//   - genre spread (literary/informational/poetry/drama — enum has no
//     'argumentative', so the persuasive piece is stored as informational)
//   - band spread weighted to 201_210..231_240 (above_210 deprecated for G5)
//   - >=40% inference/purpose/craft, ~0% literal recall
//   - every distractor carries free-text misconception + a tag that exists in
//     map_misconception_tags (validated against the live table before insert)
//   - names only from the §11.3 allow-list
//
// Usage:
//   node --env-file=.env.local scripts/seed-g5-reading-batch01.mjs --dry-run
//   node --env-file=.env.local scripts/seed-g5-reading-batch01.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).')
  process.exit(1)
}
const DRY_RUN = process.argv.includes('--dry-run')
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const SOURCE_NOTE = 'Khan Academy: Grade 5 reading comprehension'

// Allowed first names (5thGradeSeedingGuide §5 / CLAUDE.md §11.3).
const NAME_POOL = ['Maya','Ethan','Priya','Liam','Ava','Aarav','Zoe','Noor','Diego','Mei',
  'Caleb','Jamal','Selena','Hiroshi','Imani','Theo','Sofia','Ravi']

// ─────────────────────────────────────────────────────────────────────────
// Content
// ─────────────────────────────────────────────────────────────────────────
const PASSAGES = [
  // 1 ────────────────────────────────────────────────────────────────────
  {
    title: 'The Last Booth at the Fair',
    genre: 'literary', band: '201_210', lexile: 780,
    topic: 'Literary: courage and friendship at a school fair',
    body: `Maya had run the face-painting booth at the spring fair for three years, and every year the line stretched halfway across the gym. This year was different. A new booth across the aisle, selling glittery tattoos that lasted a week, had pulled her whole crowd away by noon.

By two o'clock, Maya had painted exactly four cheeks. She wiped her brushes and watched the tattoo line snake past her table. Her hands felt useless.

Diego, who ran the lemonade stand beside her, leaned over. "You okay? You've been staring at that empty chair like it owes you money."

"Nobody wants paint when they can get a tattoo," Maya said. "I should just pack up."

Diego thought for a moment. Then he grabbed a paper cup, dipped Maya's thinnest brush in blue, and asked her to paint a tiny wave curling around his wrist. When she finished, he held it up to the passing crowd. "Look, she paints whatever you imagine. The tattoos only come in twelve shapes."

A girl stopped. Then her brother. Then three kids from the soccer team, each asking for something the tattoo booth did not have: a green dragon, a comet, a cricket bat with flames. Word spread the way it only can at a school fair, one excited kid telling the next.

Maya's hands stopped feeling useless. They flew. She mixed colors she had never tried, inventing as she went, and the line that had drifted away came curling back, not because her booth was the same as before, but because Diego had reminded everyone it was the one thing the fair could not copy.

When the fair closed, Maya had painted thirty-one faces. She handed Diego a lemonade and, on the back of his hand, a small blue wave.`,
    questions: [
      { teks: '5.8B', difficulty: 'medium',
        stem: "What does Diego's action with the paper cup and brush show about him?",
        explanation: "Diego saw that Maya was discouraged and, without being asked, found a way to draw a crowd to her booth. His action shows thoughtfulness and friendship.",
        choices: [
          ['A', 'He wanted Maya to paint something for him for free.', false, 'Reads his action as self-interest rather than helping a friend.', 'character_relationship_misread'],
          ['B', 'He noticed Maya was discouraged and found a way to help her.', true, null, null],
          ['C', 'He was bored at his lemonade stand and needed something to do.', false, 'Picks a feeling the text does not support.', 'feelings_mismatch_evidence'],
          ['D', 'He wanted the tattoo booth to be shut down.', false, 'Adds an idea the passage never states.', 'inference_unsupported'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'The sentence "Her hands felt useless" mostly shows that Maya—',
        explanation: "Nothing has hurt Maya's hands. The phrase is figurative: with no customers, she feels discouraged because no one wants her work.",
        choices: [
          ['A', 'had hurt her hands while painting.', false, 'Takes a figurative phrase literally.', 'inference_literal_only'],
          ['B', 'felt discouraged because no one wanted her work.', true, null, null],
          ['C', 'was tired and wanted to go home to rest.', false, 'Chooses a feeling the evidence does not match.', 'feelings_mismatch_evidence'],
          ['D', 'was angry at Diego for talking to her.', false, 'Invents a reaction the text does not support.', 'inference_unsupported'],
        ] },
      { teks: '5.2B', difficulty: 'medium',
        stem: 'In "watched the tattoo line snake past her table," the word "snake" most nearly means—',
        explanation: "Here \"snake\" is a verb describing how the line moved: in a long, winding path past her table.",
        choices: [
          ['A', 'a reptile crawling in the gym.', false, 'Uses the common noun meaning instead of the verb meaning in context.', 'vocab_wrong_sense_of_polysemous_word'],
          ['B', 'to move in a long, winding line.', true, null, null],
          ['C', 'to move quickly in a straight line.', false, 'Chooses nearly the opposite of the winding meaning.', 'vocab_antonym'],
          ['D', 'to disappear from sight.', false, 'Picks a meaning unrelated to the word.', 'vocab_unrelated'],
        ] },
      { teks: '5.8A', difficulty: 'hard',
        stem: 'Which sentence best states a theme of the story?',
        explanation: "The crowd returns because Maya's booth offers something no other booth can. The theme is that what makes you different can be your strength.",
        choices: [
          ['A', 'Face painting is more fun than temporary tattoos.', false, 'States a topic, not a deeper lesson.', 'theme_picked_topic'],
          ['B', 'The thing that makes you different can be your strength.', true, null, null],
          ['C', 'A girl named Maya works hard at a spring fair.', false, 'Names the subject rather than a theme.', 'theme_picked_topic'],
          ['D', 'Diego sells lemonade next to Maya at the fair.', false, 'Picks a single event instead of a theme.', 'theme_picked_event'],
        ] },
      { teks: '5.7C', difficulty: 'medium',
        stem: "Which detail best shows that Maya's booth offered something the tattoo booth could not?",
        explanation: 'Diego tells the crowd, "she paints whatever you imagine," while "the tattoos only come in twelve shapes." That contrast is the strongest evidence.',
        choices: [
          ['A', '"Maya had painted exactly four cheeks."', false, 'Shows her slow afternoon, not what made her booth special.', 'evidence_wrong_detail'],
          ['B', '"She paints whatever you imagine. The tattoos only come in twelve shapes."', true, null, null],
          ['C', '"She handed Diego a lemonade."', false, 'A closing detail unrelated to the claim.', 'text_evidence_misread'],
          ['D', '"the line stretched halfway across the gym."', false, 'Describes past years, not what set her apart this year.', 'evidence_wrong_paragraph'],
        ] },
    ],
  },

  // 2 ────────────────────────────────────────────────────────────────────
  {
    title: "Ravi's Slow Over",
    genre: 'literary', band: '211_220', lexile: 850,
    topic: 'Literary: patience and pressure in a cricket match',
    body: `The match came down to Ravi's final over. Six balls left, eleven runs for the other team to win, and the late sun threw long shadows across the pitch like dark fingers reaching for the wickets.

Ravi's heart drummed. His older cousins had told him that fast bowlers win games, so all season he had hurled the ball as hard as he could. Today it had not worked. The batters had simply swung harder. Each time he sprinted in and let the ball fly, the score climbed, and his confidence sank a little lower.

His coach jogged over between overs. "Stop trying to break the sound barrier," she said quietly. "Slow it down. Make them wait."

Slow it down? With the whole team watching? Ravi wanted to argue, but the coach had already turned away.

He took a breath and bowled his first ball gently, almost lazily. The batter, expecting a rocket, swung early and missed. The second ball floated even slower. The batter lunged, top-edged it, and a fielder swallowed the catch. The crowd gasped.

Now Ravi understood. Speed had made him predictable. Slowness made him a puzzle. Ball after ball, he changed the pace, slow, then slower, then a sudden quick one that cracked into the stumps. Each delivery asked a different question, and the batters ran out of answers. One swung so wildly at a floating delivery that he nearly toppled over, and his own teammates groaned from the boundary.

When the last ball thudded harmlessly into the keeper's gloves, the game was won. Ravi's cousins lifted him onto their shoulders, shouting about his arm. But Ravi knew the truth. He had not won by throwing harder. He had won the moment he stopped.`,
    questions: [
      { teks: '5.8C', difficulty: 'medium',
        stem: 'Which moment is the turning point of the story?',
        explanation: "The story turns when Ravi decides to follow his coach's advice and slow the ball down. Everything that leads to the win flows from that choice.",
        choices: [
          ['A', "Ravi's cousins lift him onto their shoulders.", false, 'This is the resolution, not the turning point.', 'plot_event_confusion'],
          ['B', "Ravi decides to follow his coach's advice and slow down.", true, null, null],
          ['C', "The match comes down to Ravi's final over.", false, 'Sets up the conflict but is not the turning point.', 'plot_picked_detail'],
          ['D', 'The coach jogs over between overs.', false, 'A small detail leading up to the change.', 'plot_picked_detail'],
        ] },
      { teks: '5.10D', difficulty: 'hard',
        stem: 'The phrase "long shadows across the pitch like dark fingers reaching for the wickets" helps the reader feel that—',
        explanation: 'Comparing the shadows to dark fingers reaching for the wickets makes the moment feel tense and a little threatening.',
        choices: [
          ['A', 'the sun was simply setting in the evening.', false, 'Notices only the literal time of day, not the mood.', 'imagery_literal_detail'],
          ['B', 'the moment was tense and a little threatening.', true, null, null],
          ['C', 'the pitch was dirty and covered in marks.', false, 'Reads the comparison literally as real marks.', 'figurative_taken_literally'],
          ['D', 'it was about to rain on the field.', false, 'Adds an idea the image does not suggest.', 'inference_unsupported'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: "Why did the batter swing early and miss at Ravi's first slow ball?",
        explanation: 'The batter expected a fast "rocket" and timed the swing for that speed, so the slow ball arrived after the swing was over.',
        choices: [
          ['A', 'The ball was too fast to see clearly.', false, 'Contradicts the text, which says the ball was slow.', 'inference_literal_only'],
          ['B', 'The batter expected a fast ball and swung too soon.', true, null, null],
          ['C', 'A fielder distracted the batter.', false, 'Adds a cause the passage never mentions.', 'inference_unsupported'],
          ['D', 'Ravi bowled the ball crookedly.', false, 'Invents a reason not in the text.', 'inference_unsupported'],
        ] },
      { teks: '5.8A', difficulty: 'hard',
        stem: 'What lesson does Ravi learn?',
        explanation: 'Ravi wins by bowling cleverly, not forcefully. The lesson is that doing something cleverly can matter more than doing it with brute force.',
        choices: [
          ['A', 'Cricket is the best sport to play.', false, 'States a topic, not the lesson.', 'theme_picked_topic'],
          ['B', 'Being clever can matter more than being forceful.', true, null, null],
          ['C', 'You should always do what your cousins say.', false, 'Contradicts the story, where the cousins were wrong.', 'theme_picked_event'],
          ['D', 'Fast bowlers always win games.', false, 'Repeats the belief the story disproves.', 'theme_picked_topic'],
        ] },
      { teks: '5.6C', difficulty: 'medium',
        stem: 'Early in the story, what can the reader predict will happen if Ravi keeps bowling as fast as he can?',
        explanation: 'The text says fast bowling had not worked all day because the batters "simply swung harder," so more fast bowling would likely keep getting hit.',
        choices: [
          ['A', 'The batters will keep hitting his bowling.', true, null, null],
          ['B', 'He will immediately win the match.', false, 'Nothing supports a sudden win from the same approach.', 'inference_unsupported'],
          ['C', 'The coach will take him out of the game.', false, 'Stretches beyond what the text suggests.', 'inference_overgeneralized'],
          ['D', 'He will bowl even faster and set a record.', false, 'Adds an outcome the passage does not point to.', 'inference_unsupported'],
        ] },
    ],
  },

  // 3 ────────────────────────────────────────────────────────────────────
  {
    title: 'Two Kitchens',
    genre: 'literary', band: '221_230', lexile: 900,
    topic: 'Literary: belonging across two cultures',
    body: `In our apartment there were two kitchens, though only one had a stove.

The first kitchen was the real one, small and bright, where my mother packed my lunch each morning. The second kitchen lived in my grandmother's memory. Nai Nai had cooked for forty years in a village halfway around the world, and when she stirred a pot here, she was also stirring one there.

For a long time I was embarrassed by the second kitchen. When Nai Nai sent me to school with steamed buns instead of sandwiches, I hid them under my desk. The other kids ate food with names I could pronounce. I wanted, more than anything, to be ordinary.

One autumn afternoon, Nai Nai asked me to help her fold dumplings. I sighed loudly so she would know I was being forced. But as we worked, she told me about her own grandmother, who had taught her the same pinch-and-fold by a clay stove, in winters so cold the windows wore feathers of frost.

"Each dumpling is a little package of where you come from," she said, pressing one into my palm. "You can hide it, or you can share it."

The next day I did something that surprised even me. At lunch, I opened my container of dumplings right on top of the table. A boy named Caleb leaned over. "Those smell amazing," he said. "What are they?"

So I told him. I told him about the village, and the frost on the windows, and the grandmother before the grandmother. By the end of lunch, three kids had tried a dumpling, and I had stopped wishing to be ordinary.

That night I realized our apartment did not really have two kitchens. It had one, stretched across an ocean and many years, and I was finally old enough to cook in all of it.`,
    questions: [
      { teks: '5.8A', difficulty: 'hard',
        stem: 'Which statement best expresses a theme of the story?',
        explanation: 'The narrator moves from hiding her food to proudly sharing it. A theme is that sharing where you come from can turn embarrassment into pride.',
        choices: [
          ['A', 'Steamed buns taste better than sandwiches.', false, 'States a topic, not a theme.', 'theme_picked_topic'],
          ['B', 'Sharing where you come from can turn embarrassment into pride.', true, null, null],
          ['C', 'A girl helps her grandmother fold dumplings one day.', false, 'Names one event instead of a theme.', 'theme_picked_event'],
          ['D', 'Grandmothers usually know how to cook well.', false, 'A broad topic, not the story’s message.', 'theme_picked_topic'],
        ] },
      { teks: '5.8D', difficulty: 'hard',
        stem: 'The "second kitchen" in Nai Nai’s memory mainly represents—',
        explanation: 'The second kitchen is not a real room; it stands for the family’s history and homeland, carried in memory across the years.',
        choices: [
          ['A', 'a real room in the apartment with a broken stove.', false, 'Takes a symbolic idea as a literal place.', 'figurative_language_literal_interpretation'],
          ['B', "the family's history and homeland carried in memory.", true, null, null],
          ['C', 'a restaurant the family used to own.', false, 'Adds a detail the text never gives.', 'inference_unsupported'],
          ['D', 'the school cafeteria where the kids eat.', false, 'Confuses the symbol with an unrelated setting.', 'setting_character_misidentified'],
        ] },
      { teks: '5.2B', difficulty: 'medium',
        stem: 'In "the windows wore feathers of frost," the word "wore" most nearly means—',
        explanation: 'The windows did not wear clothing; "wore" here means they were covered with frost.',
        choices: [
          ['A', 'became damaged from heavy use.', false, 'Uses another meaning of "wear" that does not fit.', 'vocab_wrong_sense_of_polysemous_word'],
          ['B', 'were covered with.', true, null, null],
          ['C', 'removed or wiped away.', false, 'Chooses the opposite of "covered."', 'vocab_antonym'],
          ['D', 'bought from a store.', false, 'Picks an unrelated meaning.', 'vocab_unrelated'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'Why did the narrator open the dumplings right on top of the table the next day?',
        explanation: "Nai Nai's words about hiding or sharing helped the narrator decide to share her food instead of hiding it.",
        choices: [
          ['A', 'She had run out of places to hide them.', false, 'Invents a reason the text does not give.', 'inference_unsupported'],
          ['B', "Nai Nai's words helped her decide to share rather than hide.", true, null, null],
          ['C', 'She wanted to throw the dumplings away.', false, 'Contradicts her pride by the end of lunch.', 'feelings_mismatch_evidence'],
          ['D', 'The teacher told her she had to.', false, 'Adds an instruction not in the passage.', 'inference_unsupported'],
        ] },
      { teks: '5.9A', difficulty: 'medium',
        stem: 'Which feature shows that this passage is realistic fiction rather than an informational article?',
        explanation: 'Realistic fiction tells a personal story with characters, feelings, and a change over time, which this passage does.',
        choices: [
          ['A', 'It gives numbered steps for making dumplings.', false, 'No recipe steps appear; this is a story feature error.', 'genre_feature_confusion'],
          ['B', 'It tells a personal story with characters, feelings, and change.', true, null, null],
          ['C', 'It lists facts about different countries.', false, 'Mistakes the story for an informational list.', 'genre_feature_confusion'],
          ['D', 'It uses headings and a labeled diagram.', false, 'Names text features the passage does not have.', 'text_features_misread'],
        ] },
    ],
  },

  // 4 ────────────────────────────────────────────────────────────────────
  {
    title: 'The Quiet Work of Earthworms',
    genre: 'informational', band: '201_210', lexile: 760,
    topic: 'Informational science: earthworms and healthy soil',
    body: `Most people walk over earthworms without a second thought. Yet beneath our feet, these small creatures are doing some of the most important work on the planet.

An earthworm spends its life tunneling through soil. As it moves, it swallows dirt, leaves, and bits of dead plants. Inside the worm's body, this material is broken down and pushed out the other end as tiny, dark pellets called castings. Castings are packed with the nutrients that plants need to grow. In a single year, the worms in one field can produce many tons of this natural fertilizer, far more than any bag a gardener could buy at a store.

The tunnels matter just as much as the castings. Each tunnel is a narrow hallway for air and water. When rain falls, it can slide down these hallways instead of running off the surface, so the soil stays moist and roots can drink. The tunnels also loosen packed earth, making room for roots to spread. Without these channels, heavy rain would simply puddle on top and wash the best soil away.

Because of this hidden work, soil with earthworms is usually richer than soil without them. Farmers and gardeners have learned to welcome worms rather than wash them away. Some even raise worms on purpose, feeding them kitchen scraps and using the castings to feed their plants.

The next time you see an earthworm on a wet sidewalk, remember: it is not a pest. It is a tiny, tireless farmer, turning yesterday's dead leaves into tomorrow's living plants.`,
    questions: [
      { teks: '5.9D.i', difficulty: 'medium',
        stem: 'What is the central idea of the passage?',
        explanation: 'Every paragraph explains how earthworms help soil. The central idea is that earthworms do important work that keeps soil healthy.',
        choices: [
          ['A', 'Earthworms are pests that should be washed away.', false, 'Contradicts the passage and misses the main point.', 'main_idea_picked_detail'],
          ['B', 'Earthworms do important work that keeps soil healthy.', true, null, null],
          ['C', 'Some farmers feed kitchen scraps to worms.', false, 'A supporting detail, not the central idea.', 'main_idea_picked_detail'],
          ['D', 'Earthworms live underground in tunnels.', false, 'True but too narrow to be the central idea.', 'main_idea_picked_detail'],
        ] },
      { teks: '5.9D.iii', difficulty: 'hard',
        stem: 'How is most of the information in the passage organized?',
        explanation: 'The passage mainly explains the effects earthworms have on soil, such as adding nutrients and letting in air and water.',
        choices: [
          ['A', 'As a story told in order from beginning to end.', false, 'Picks a structure the passage does not use.', 'text_structure_picked_first_one_recognized'],
          ['B', 'By explaining the effects earthworms have on soil.', true, null, null],
          ['C', 'By comparing two different kinds of worms.', false, 'No two worms are compared.', 'text_structure_picked_content'],
          ['D', 'By listing problems and solutions to pollution.', false, 'Pollution is never discussed.', 'text_structure_picked_content'],
        ] },
      { teks: '5.2B', difficulty: 'medium',
        stem: 'In the passage, the word "castings" refers to—',
        explanation: 'The passage defines castings as the tiny, nutrient-rich pellets a worm pushes out after digesting soil and leaves.',
        choices: [
          ['A', 'the tunnels that worms dig.', false, 'Ignores the sentence that defines the word.', 'vocab_skipped_context_clues'],
          ['B', 'the nutrient-rich pellets a worm leaves behind.', true, null, null],
          ['C', 'the leaves that worms eat.', false, 'Names the food, not the castings.', 'vocab_skipped_context_clues'],
          ['D', 'the eggs that worms lay.', false, 'Picks an unrelated idea.', 'vocab_unrelated'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'Based on the passage, why might a gardener add earthworms to their soil?',
        explanation: 'Worms make soil richer with castings and loosen it so air and water reach roots, which helps plants grow.',
        choices: [
          ['A', 'Worms keep insects away from the plants.', false, 'A benefit the passage never claims.', 'inference_unsupported'],
          ['B', 'Worms make soil richer and let air and water reach roots.', true, null, null],
          ['C', 'Worms make the garden look nicer to visitors.', false, 'Not supported by the text.', 'inference_unsupported'],
          ['D', 'Worms eat all the weeds in a garden.', false, 'Stretches beyond what the passage says.', 'inference_overgeneralized'],
        ] },
      { teks: '5.7D', difficulty: 'hard',
        stem: 'Which sentence would be the BEST summary of the passage?',
        explanation: 'A good summary captures the main point: worms enrich and loosen soil through their castings and tunnels, helping plants grow.',
        choices: [
          ['A', 'Earthworms sometimes crawl onto sidewalks when it rains.', false, 'A minor detail, not a summary.', 'summary_included_minor_detail'],
          ['B', 'Earthworms enrich and loosen soil with castings and tunnels, helping plants grow.', true, null, null],
          ['C', 'Most people walk over earthworms without thinking.', false, 'Copies the opening line instead of summarizing.', 'summary_copied_first_sentence'],
          ['D', 'Some farmers raise worms and feed them kitchen scraps.', false, 'A small detail rather than the whole passage.', 'summary_included_minor_detail'],
        ] },
    ],
  },

  // 5 ────────────────────────────────────────────────────────────────────
  {
    title: 'How a Bridge Holds Its Weight',
    genre: 'informational', band: '211_220', lexile: 870,
    topic: 'Informational science: the forces that act on bridges',
    body: `A bridge looks like it is simply lying still, but it is actually in a constant, silent struggle. Every bridge must fight two opposite forces at the same time: pushing and pulling.

When you stand in the middle of a beam bridge, a flat bridge resting on supports, your weight presses down. The top of the beam gets squeezed together. Engineers call this squeezing force compression. At the same moment, the bottom of the beam gets stretched apart. That stretching force is called tension. If either force grows too strong, the beam will crack.

Different bridge designs handle these forces in clever ways. An arch bridge curves downward, so the weight pushing on it travels along the curve and out to the solid ground at each end. The ground pushes back, and the arch stays standing. This is why stone arch bridges built two thousand years ago are still standing today: stone is excellent at resisting compression.

A suspension bridge does the opposite. Its roadway hangs from huge cables draped between tall towers. The weight of cars pulls down on the cables, putting them under enormous tension. The cables carry that pull up to the towers and down into deep anchors buried in the earth. Because steel cable is superb at handling tension, a suspension bridge can stretch across distances no arch could ever cross.

So the next time you cross a bridge, picture the invisible tug-of-war beneath you. The bridge is not resting at all. It is winning, quietly, against forces that never stop pushing and pulling.`,
    questions: [
      { teks: '5.9D.iii', difficulty: 'hard',
        stem: 'The author mainly organizes the passage by—',
        explanation: 'The passage names a problem, the forces on a bridge, and then explains how different designs solve it.',
        choices: [
          ['A', 'telling the history of one famous bridge.', false, 'No single bridge’s history is told.', 'text_structure_picked_content'],
          ['B', 'explaining a problem and how different designs solve it.', true, null, null],
          ['C', 'listing the steps to build a bridge in order.', false, 'Mistakes the explanation for a how-to sequence.', 'text_structure_picked_first_one_recognized'],
          ['D', 'describing one day spent crossing a bridge.', false, 'No such narrative appears.', 'text_structure_picked_content'],
        ] },
      { teks: '5.9D.i', difficulty: 'medium',
        stem: 'Which sentence best states the central idea?',
        explanation: 'The whole passage is about how bridges are designed to handle the forces of compression and tension.',
        choices: [
          ['A', 'Stone arch bridges can be two thousand years old.', false, 'A detail, not the central idea.', 'main_idea_picked_detail'],
          ['B', 'Bridges are designed to handle compression and tension.', true, null, null],
          ['C', 'A suspension bridge has tall towers and cables.', false, 'One detail about one design.', 'main_idea_picked_detail'],
          ['D', 'Cars are heavy and press down on bridges.', false, 'A small fact, not the main point.', 'main_idea_picked_detail'],
        ] },
      { teks: '5.10A', difficulty: 'medium',
        stem: 'The author most likely wrote this passage to—',
        explanation: 'The passage explains how bridges stay standing under weight; that is its main purpose.',
        choices: [
          ['A', 'convince readers to become engineers.', false, 'Goes beyond the author’s actual aim.', 'purpose_picked_topic_overgeneralization'],
          ['B', 'explain how bridges stay standing under weight.', true, null, null],
          ['C', 'tell an exciting story about crossing a bridge.', false, 'Names the wrong kind of writing.', 'purpose_picked_genre_mismatch'],
          ['D', 'describe how to repair a cracked beam.', false, 'Names a topic, not the real purpose.', 'purpose_confused_topic_with_purpose'],
        ] },
      { teks: '5.2C', difficulty: 'hard',
        stem: 'The word "suspension" comes from a root meaning "to hang." How does this meaning fit a suspension bridge?',
        explanation: 'A suspension bridge’s roadway hangs from cables, which matches the root meaning "to hang."',
        choices: [
          ['A', 'The bridge is built mostly out of springs.', false, 'Connects the root to an unrelated idea.', 'affix_meaning_confusion'],
          ['B', 'The roadway hangs from cables between tall towers.', true, null, null],
          ['C', 'The bridge can be taken apart and moved.', false, 'Links the root to a meaning it does not have.', 'affix_meaning_confusion'],
          ['D', 'The bridge is held up by stone arches.', false, 'Describes a different bridge type.', 'inference_unsupported'],
        ] },
      { teks: '5.6F', difficulty: 'hard',
        stem: 'Based on the passage, why can a suspension bridge cross a wider gap than an arch bridge?',
        explanation: 'Steel cable handles tension extremely well, which lets the roadway hang across very long distances.',
        choices: [
          ['A', 'Steel cable handles tension, so the roadway can span long distances.', true, null, null],
          ['B', 'Suspension bridges are built out of stone.', false, 'Contradicts the passage about steel cable.', 'text_evidence_misread'],
          ['C', 'Arch bridges are always older and weaker.', false, 'Overstates a claim the text does not make.', 'inference_overgeneralized'],
          ['D', 'Suspension bridges have no forces acting on them.', false, 'Contradicts the whole passage.', 'inference_unsupported'],
        ] },
    ],
  },

  // 6 ────────────────────────────────────────────────────────────────────
  {
    title: 'The Woman Who Planted Millions of Trees',
    genre: 'informational', band: '211_220', lexile: 880,
    topic: 'Informational biography: Wangari Maathai and the Green Belt Movement',
    body: `When Wangari Maathai was a girl in Kenya, the hills near her home were green with trees, and a clear stream ran past her family's farm. She once watched tadpoles wriggle in its cool water. Years later, when she returned as a grown woman, the trees were gone. Companies had cut them down, the stream had dried up, and the soil had washed away. The land she loved was disappearing.

Maathai had studied science in school and become the first woman in her region to earn an advanced college degree. She could have spent her life in a quiet laboratory. Instead, she asked a simple question: what if ordinary people planted trees?

In the late 1970s she began paying small groups of women a few coins for every tree they grew that survived. The idea spread. Women who had felt powerless discovered they could change the land with their own hands. The effort grew into the Green Belt Movement, and over the years its members planted tens of millions of trees across Kenya.

Not everyone was pleased. Powerful people who profited from cutting forests tried to stop her. Maathai was threatened and even arrested. Still she refused to quit, because she believed that healthy land and fair treatment of people grew from the same root.

In 2004, Maathai was given the Nobel Peace Prize, the first time it had ever gone to someone honored for protecting the environment. She accepted it not only for herself but for every woman who had knelt in the dirt to plant a seedling.

Wangari Maathai died in 2011, but the forests she inspired are still growing. Each tree is a small, living answer to the question she once dared to ask.`,
    questions: [
      { teks: '5.6G', difficulty: 'medium',
        stem: 'What is the central message of this biography?',
        explanation: 'The passage shows how one determined person inspired ordinary people to heal the land, which is its central message.',
        choices: [
          ['A', 'Kenya has many green hills and clear streams.', false, 'A setting detail, not the message.', 'main_idea_picked_detail'],
          ['B', 'One determined person can inspire others to heal the land.', true, null, null],
          ['C', 'Wangari Maathai studied science in school.', false, 'A single fact, not the message.', 'main_idea_picked_detail'],
          ['D', 'Trees need water and good soil to grow.', false, 'Off the central message.', 'main_idea_picked_detail'],
        ] },
      { teks: '5.7C', difficulty: 'medium',
        stem: 'Which detail best supports the idea that Maathai faced serious opposition?',
        explanation: '"Maathai was threatened and even arrested" directly shows the serious opposition she faced.',
        choices: [
          ['A', '"She once watched tadpoles wriggle in its cool water."', false, 'A childhood image, unrelated to opposition.', 'evidence_wrong_detail'],
          ['B', '"Maathai was threatened and even arrested."', true, null, null],
          ['C', '"She had studied science in school."', false, 'From a different part of her life.', 'evidence_wrong_paragraph'],
          ['D', '"its members planted tens of millions of trees."', false, 'Shows success, not opposition.', 'text_evidence_misread'],
        ] },
      { teks: '5.6F', difficulty: 'hard',
        stem: 'The sentence "healthy land and fair treatment of people grew from the same root" suggests that Maathai believed—',
        explanation: 'The phrase uses "root" figuratively to mean that caring for nature and caring for people are connected.',
        choices: [
          ['A', 'trees grow best when the weather is fair.', false, 'Reads the figurative phrase literally.', 'figurative_language_literal_interpretation'],
          ['B', 'caring for nature and caring for people are connected.', true, null, null],
          ['C', 'only trained scientists can solve big problems.', false, 'Contradicts her work with ordinary women.', 'inference_unsupported'],
          ['D', 'roots are the most important part of a tree.', false, 'Takes "root" literally and misses the point.', 'inference_literal_only'],
        ] },
      { teks: '5.2B', difficulty: 'medium',
        stem: 'In the passage, the word "powerless" describes the women before they—',
        explanation: 'The context says the women felt powerless until they "discovered they could change the land with their own hands."',
        choices: [
          ['A', 'lost all of their money.', false, 'Ignores the context clue that follows.', 'vocab_skipped_context_clues'],
          ['B', 'discovered they could change the land themselves.', true, null, null],
          ['C', 'moved away from Kenya for good.', false, 'Not supported by the passage.', 'inference_unsupported'],
          ['D', 'became famous scientists.', false, 'Unrelated to the meaning of the word.', 'vocab_unrelated'],
        ] },
      { teks: '5.10A', difficulty: 'hard',
        stem: 'Why does the author end with "Each tree is a small, living answer to the question she once dared to ask"?',
        explanation: "The ending shows that Maathai's idea still makes a difference today, long after she asked her question.",
        choices: [
          ['A', 'to give step-by-step instructions for planting a tree.', false, 'Names a topic, not the purpose of the ending.', 'purpose_confused_topic_with_purpose'],
          ['B', "to show that Maathai's idea still makes a difference today.", true, null, null],
          ['C', 'to prove that trees can speak and answer questions.', false, 'Takes the figurative line literally.', 'figurative_taken_literally'],
          ['D', 'to explain exactly how the Nobel Prize is chosen.', false, 'Off the author’s real purpose.', 'author_purpose_topic_not_purpose'],
        ] },
    ],
  },

  // 7 ────────────────────────────────────────────────────────────────────
  {
    title: 'A Letter About the Recess Garden',
    genre: 'informational', band: '221_230', lexile: 900,
    topic: 'Argumentative (persuasive letter): a student proposes a school garden',
    body: `Dear Principal,

My name is Selena, and I am a fifth grader who believes our school should turn the empty lot behind the gym into a recess garden. I know this is a big request, so let me explain why it would be worth the effort.

First, a garden would give students a new way to spend recess. Not everyone enjoys running on the blacktop. Some of us would rather plant seeds, pull weeds, and watch something grow. A garden makes room for those students too.

Second, a garden is a living classroom. In science we are learning how plants turn sunlight into food. Reading about it in a book is useful, but measuring a sunflower we planted ourselves would make the lesson stick. Our teachers could hold real lessons outside, with real plants.

Some people might argue that a garden costs too much money and takes too much time. That is a fair concern. But many of the supplies, such as seeds, soil, and tools, can be donated, and students can do the daily watering ourselves. The cost would be small, and the work would be shared.

Finally, a garden would give back to the whole community. Vegetables we grow could be donated to the food pantry on Main Street, so that our learning would help feed neighbors in need.

A bare lot grows nothing but weeds. With your permission, that same lot could grow vegetables, lessons, and pride. I hope you will give our idea a chance.

Sincerely,
Selena`,
    questions: [
      { teks: '5.9E', difficulty: 'hard',
        stem: "What is Selena's main claim in the letter?",
        explanation: 'Her main claim, stated in the first paragraph, is that the school should turn the empty lot into a recess garden. The other points are reasons supporting it.',
        choices: [
          ['A', 'Not everyone enjoys running on the blacktop.', false, 'A supporting reason, not the main claim.', 'argumentative_confused_claim_with_evidence'],
          ['B', 'The school should turn the empty lot into a recess garden.', true, null, null],
          ['C', 'Plants turn sunlight into food.', false, 'A science detail, not the claim.', 'main_idea_picked_detail'],
          ['D', 'Vegetables could be donated to a food pantry.', false, 'A supporting reason, not the claim.', 'argumentative_confused_claim_with_evidence'],
        ] },
      { teks: '5.9E', difficulty: 'medium',
        stem: 'Which reason does Selena give to answer people who worry about the cost?',
        explanation: 'To address cost, she says supplies can be donated and students can do the watering themselves, so the cost stays small.',
        choices: [
          ['A', 'A garden is a living classroom.', false, 'A different reason, not the cost answer.', 'evidence_wrong_detail'],
          ['B', 'Supplies can be donated and students can do the watering.', true, null, null],
          ['C', 'Not everyone likes the blacktop.', false, 'A different reason in the letter.', 'evidence_wrong_detail'],
          ['D', 'Vegetables can feed neighbors in need.', false, 'From a different paragraph and purpose.', 'evidence_wrong_paragraph'],
        ] },
      { teks: '5.10A', difficulty: 'medium',
        stem: "The author's main purpose in this letter is to—",
        explanation: 'The letter is written to persuade the principal to approve the garden.',
        choices: [
          ['A', 'entertain readers with a funny story.', false, 'Names the wrong kind of writing.', 'purpose_picked_genre_mismatch'],
          ['B', 'persuade the principal to approve a garden.', true, null, null],
          ['C', 'explain exactly how photosynthesis works.', false, 'Names a topic, not the purpose.', 'purpose_confused_topic_with_purpose'],
          ['D', 'describe what the empty lot looks like.', false, 'A minor topic, not the goal.', 'author_purpose_topic_not_purpose'],
        ] },
      { teks: '5.6F', difficulty: 'hard',
        stem: 'By mentioning the food pantry, Selena suggests that the garden would—',
        explanation: 'Donating vegetables to the food pantry shows the garden would benefit people beyond the school.',
        choices: [
          ['A', 'help only the students who plant it.', false, 'Contradicts the point of the example.', 'inference_unsupported'],
          ['B', 'benefit people beyond the school.', true, null, null],
          ['C', 'replace the school cafeteria entirely.', false, 'Stretches far beyond the text.', 'inference_overgeneralized'],
          ['D', 'cost the school a great deal of money.', false, 'Contradicts her cost argument.', 'text_evidence_misread'],
        ] },
      { teks: '5.10D', difficulty: 'hard',
        stem: 'The letter says the lot could "grow vegetables, lessons, and pride." What does the author mean by growing "lessons" and "pride"?',
        explanation: 'Lessons and pride are not plants; the author means the garden would also help students learn and feel good about their work.',
        choices: [
          ['A', 'Lessons and pride are special kinds of plants.', false, 'Reads the phrase literally.', 'figurative_language_literal_interpretation'],
          ['B', 'The garden would also help students learn and feel proud.', true, null, null],
          ['C', 'The school would sell pride at the food pantry.', false, 'A literal misreading of the image.', 'figurative_taken_literally'],
          ['D', 'Pride is a vegetable that grows in gardens.', false, 'Takes a figurative word as a literal object.', 'imagery_literal_detail'],
        ] },
    ],
  },

  // 8 ────────────────────────────────────────────────────────────────────
  {
    title: 'What the Tide Pool Keeps',
    genre: 'poetry', band: '211_220', lexile: 720,
    topic: 'Poetry: a tide pool and the idea that what is hidden is not lost',
    body: `Twice a day the ocean leaves
a small round window in the rock,
and in that window, life arrives:
a green anemone, a hermit's knock,

a crab that wears a borrowed shell,
a star with five slow arms of stone.
The tide pool keeps what waves let fall,
a crowded world that looks alone.

Then water climbs the sand again
and folds the window out of sight.
But nothing's lost; the pool will hold
its small bright kingdom every night.`,
    questions: [
      { teks: '5.9B', difficulty: 'medium',
        stem: 'The poet calls the tide pool "a small round window in the rock." This comparison helps the reader picture—',
        explanation: 'The "window" is a metaphor for a clear, round pool where sea creatures can be seen.',
        choices: [
          ['A', 'a real glass window in a house.', false, 'Takes the metaphor literally.', 'figurative_language_literal_interpretation'],
          ['B', 'a clear, round pool where sea creatures can be seen.', true, null, null],
          ['C', 'a hole someone broke in a wall.', false, 'A literal misreading of "window."', 'figurative_taken_literally'],
          ['D', 'the moon rising over the ocean.', false, 'An image the poem does not suggest.', 'inference_unsupported'],
        ] },
      { teks: '5.10D', difficulty: 'hard',
        stem: 'Which line uses imagery to make a sea creature seem heavy or still?',
        explanation: '"a star with five slow arms of stone" uses "slow" and "stone" to make the sea star feel heavy and still.',
        choices: [
          ['A', '"a hermit’s knock"', false, 'Suggests sound, not heaviness or stillness.', 'imagery_literal_detail'],
          ['B', '"a star with five slow arms of stone"', true, null, null],
          ['C', '"Twice a day the ocean leaves"', false, 'Describes the tide, not a creature.', 'imagery_literal_detail'],
          ['D', '"the pool will hold"', false, 'Names no creature at all.', 'inference_unsupported'],
        ] },
      { teks: '5.8A', difficulty: 'hard',
        stem: 'What is the main message of the poem?',
        explanation: 'When the tide hides the pool, the poem says "nothing’s lost." The message is that the pool’s life continues even when it cannot be seen.',
        choices: [
          ['A', 'Tide pools are dangerous places to visit.', false, 'Not supported by the poem.', 'theme_picked_topic'],
          ['B', 'Even when the tide hides the pool, its life is not lost.', true, null, null],
          ['C', 'Crabs need to find new shells to live in.', false, 'A single image, not the message.', 'theme_picked_event'],
          ['D', 'The ocean covers a very large area.', false, 'A topic, not the poem’s message.', 'theme_picked_topic'],
        ] },
      { teks: '5.9B', difficulty: 'medium',
        stem: 'Which pair of words from the poem rhyme?',
        explanation: 'In the second stanza, "stone" and "alone" rhyme at the ends of lines.',
        choices: [
          ['A', '"window" and "rock"', false, 'These words do not rhyme.', 'genre_feature_confusion'],
          ['B', '"stone" and "alone"', true, null, null],
          ['C', '"ocean" and "life"', false, 'These words do not rhyme.', 'genre_feature_confusion'],
          ['D', '"again" and "hold"', false, 'These words do not rhyme.', 'genre_feature_confusion'],
        ] },
    ],
  },

  // 9 ────────────────────────────────────────────────────────────────────
  {
    title: 'The Science Fair Partners',
    genre: 'drama', band: '201_210', lexile: 740,
    topic: 'Drama: two partners resolve a disagreement before a science fair',
    body: `SETTING: A classroom after school. THEO and AVA sit at a table covered with poster board, markers, and a model volcano.

THEO: We have to glue the volcano down now or it won't dry by tomorrow.

AVA: But we haven't tested it yet. What if it leaks all over the poster during the presentation?

THEO: (sighing) We don't have time to test everything. The fair starts at nine.

AVA: I'd rather be a little late than have it fall apart in front of everyone.

THEO: (pausing) ...Okay. That's actually a good point. I just got nervous about the clock.

AVA: I get it. I'm nervous too. (She slides a small cup toward him.) Let's do one quick test. If it works, we glue it. If it leaks, we just saved ourselves from a disaster.

THEO: (smiling) Deal. You pour, I'll watch for leaks.

AVA: Together?

THEO: Together.

(They lean over the model as Ava slowly pours. A thin red bubble rises to the top and holds.)

THEO: It's holding!

AVA: See? Five minutes of testing beats an hour of panicking.

THEO: Remind me to listen to you next time.

AVA: Oh, I will. (They both laugh and reach for the glue.)`,
    questions: [
      { teks: '5.8B', difficulty: 'easy',
        stem: 'What do Theo and Ava disagree about at the start of the scene?',
        explanation: 'At the start, Theo wants to glue the volcano right away, while Ava wants to test it first.',
        choices: [
          ['A', 'Whether to enter the science fair at all.', false, 'They never debate entering the fair.', 'plot_event_confusion'],
          ['B', 'Whether to test the volcano before gluing it down.', true, null, null],
          ['C', 'Who will give the presentation tomorrow.', false, 'This is not the disagreement.', 'character_relationship_misread'],
          ['D', 'What color to paint the poster board.', false, 'A detail that is never discussed.', 'plot_picked_detail'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'When Theo says, "I just got nervous about the clock," the reader can tell that Theo—',
        explanation: 'Theo was rushing because he worried about running out of time, not because he stopped caring.',
        choices: [
          ['A', 'does not care about the project.', false, 'Contradicts how hard he is working.', 'feelings_mismatch_evidence'],
          ['B', 'was rushing because he worried about time.', true, null, null],
          ['C', 'is angry at Ava for slowing him down.', false, 'He agrees with her instead.', 'inference_unsupported'],
          ['D', 'wants to quit the science fair.', false, 'Nothing suggests he wants to quit.', 'inference_unsupported'],
        ] },
      { teks: '5.8C', difficulty: 'medium',
        stem: 'How is the conflict between Theo and Ava resolved?',
        explanation: 'They agree to run one quick test together, and when it works, they glue the volcano.',
        choices: [
          ['A', 'A teacher tells them exactly what to do.', false, 'No teacher decides for them.', 'plot_event_confusion'],
          ['B', 'They agree to run one quick test together, and it works.', true, null, null],
          ['C', 'Ava leaves and Theo finishes the project alone.', false, 'They work together, not apart.', 'plot_event_confusion'],
          ['D', 'They decide not to use the volcano at all.', false, 'They do use it after testing.', 'plot_picked_detail'],
        ] },
      { teks: '5.8A', difficulty: 'hard',
        stem: 'What does the scene suggest about working with a partner?',
        explanation: 'Listening to each other leads to a better result, since Ava’s idea to test first saves the project.',
        choices: [
          ['A', 'The faster person should always make the decisions.', false, 'The scene shows the opposite.', 'theme_picked_event'],
          ['B', 'Listening to each other can lead to a better result.', true, null, null],
          ['C', 'Partners should split up and work alone.', false, 'They succeed by working together.', 'theme_picked_topic'],
          ['D', 'Science fairs are stressful for everyone.', false, 'A topic, not the scene’s point.', 'theme_picked_topic'],
        ] },
    ],
  },

  // 10 ───────────────────────────────────────────────────────────────────
  {
    title: "The Lighthouse Keeper's Daughter",
    genre: 'literary', band: '231_240', lexile: 940,
    topic: 'Literary: responsibility, courage, and growing up',
    body: `For as long as Imani could remember, the light had belonged to her father. Every evening he climbed the spiraling stairs of the lighthouse, trimmed the wick, and set the great lamp burning so that ships could find the harbor through the dark. Imani only watched. The light, her father said, was too important to be trusted to a child.

Then came the autumn her father fell ill.

For three nights neighbors took turns climbing the stairs, but on the fourth night a storm sealed the roads, and no one could reach the point. By dusk her father could barely lift his head from the pillow. Outside, the wind shoved against the windows like something trying to get in, and far out on the black water Imani could see the small, struggling lights of a fishing boat.

"I can do it," she said. Her voice did not shake, though her hands did.

Her father looked at her for a long moment. Then he nodded, and pressed the cold iron key into her palm.

The stairs had never seemed so tall. At the top, the wind screamed through gaps in the glass, and the matches trembled in her fingers. Twice the flame guttered and died. Imani thought of the boat, of the families waiting on shore, and she tried again. On the third match, the wick caught. She turned the lamp until its beam swept out across the waves like a steady, golden road.

All night she fed the light. She did not sleep. When dawn finally smudged the sky gray, the storm had worn itself out, and the fishing boat was riding safe inside the harbor.

Imani came down the stairs slowly, her legs aching, her eyes raw. Her father was sitting up in bed, waiting. He did not say that she had done well. He said something better.

"Tonight," he asked, "will you light it again?"

And Imani understood that the light no longer belonged only to him. It had become hers to carry too, not because she was finally old enough, but because, on the worst night, she had chosen to climb.`,
    questions: [
      { teks: '5.8A', difficulty: 'hard',
        stem: 'Which statement best expresses a theme of the story?',
        explanation: 'Imani grows up by choosing to take on the light during the storm. A theme is that we grow by accepting responsibility even when afraid.',
        choices: [
          ['A', 'Lighthouses are important for guiding ships.', false, 'A topic, not a theme.', 'theme_picked_topic'],
          ['B', 'We grow up by taking responsibility, even when afraid.', true, null, null],
          ['C', 'Storms can block the roads to a lighthouse.', false, 'A single event, not a theme.', 'theme_picked_event'],
          ['D', 'Children should never be trusted with hard jobs.', false, 'Contradicts the ending of the story.', 'theme_picked_topic'],
        ] },
      { teks: '5.10D', difficulty: 'hard',
        stem: 'The beam sweeps "across the waves like a steady, golden road." This comparison suggests the light—',
        explanation: 'The "golden road" image means the light gave the lost boat a clear, safe path to follow.',
        choices: [
          ['A', 'was actually a road built on top of the water.', false, 'Takes the comparison literally.', 'figurative_language_literal_interpretation'],
          ['B', 'gave the boat a clear, safe path to follow.', true, null, null],
          ['C', 'was the exact color of gold coins.', false, 'Notices only the literal color.', 'imagery_literal_detail'],
          ['D', 'made the waves disappear completely.', false, 'An effect the image does not suggest.', 'inference_unsupported'],
        ] },
      { teks: '5.6F', difficulty: 'hard',
        stem: 'Why does Imani’s father ask, "Will you light it again?" instead of simply praising her?',
        explanation: 'By asking her to do it again, he shows that he now trusts her with the responsibility of the light.',
        choices: [
          ['A', 'He forgot that she had already lit the light.', false, 'Contradicts that he waited for her.', 'inference_unsupported'],
          ['B', 'He is showing that he now trusts her with the job.', true, null, null],
          ['C', 'He is too sick to remember the night before.', false, 'Not supported by the text.', 'feelings_mismatch_evidence'],
          ['D', 'He wants her to prove she really did it.', false, 'Stretches beyond the evidence.', 'inference_overgeneralized'],
        ] },
      { teks: '5.2B', difficulty: 'hard',
        stem: 'In "dawn finally smudged the sky gray," the word "smudged" most nearly means—',
        explanation: 'Dawn did not clean the sky; "smudged" means it spread a blurry gray color across it.',
        choices: [
          ['A', 'cleaned completely.', false, 'Chooses the opposite of the meaning.', 'vocab_antonym'],
          ['B', 'spread a blurry color across.', true, null, null],
          ['C', 'painted a sharp, bright line.', false, 'Picks a sense that does not fit a blurry dawn.', 'vocab_wrong_sense_of_polysemous_word'],
          ['D', 'darkened into night.', false, 'Contradicts the arrival of dawn.', 'vocab_unrelated'],
        ] },
      { teks: '5.8B', difficulty: 'hard',
        stem: 'At the start, the father says the light is "too important to be trusted to a child." How does his view change by the end?',
        explanation: "After Imani keeps the light all night, he asks her to do it again, showing he now sees her as ready to share the responsibility.",
        choices: [
          ['A', 'He decides the light is not important after all.', false, 'Contradicts the whole story.', 'character_relationship_misread'],
          ['B', 'He comes to see Imani as ready to share the responsibility.', true, null, null],
          ['C', 'He believes neighbors should run the light from now on.', false, 'The opposite of asking Imani to continue.', 'inference_unsupported'],
          ['D', 'He thinks Imani only got lucky and should stop.', false, 'Contradicts his request that she light it again.', 'feelings_mismatch_evidence'],
        ] },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────
const WORD_RANGE = {
  literary: [280, 420], informational: [240, 380], poetry: [40, 180], drama: [180, 300],
}
const wc = (s) => s.trim().split(/\s+/).length

function validate(validTags, validTeks) {
  const errs = []
  const seenTitles = new Set()
  let qCount = 0
  for (const p of PASSAGES) {
    if (seenTitles.has(p.title)) errs.push(`duplicate title: ${p.title}`)
    seenTitles.add(p.title)
    const n = wc(p.body)
    const [lo, hi] = WORD_RANGE[p.genre]
    if (n < lo || n > hi) errs.push(`"${p.title}" word count ${n} outside ${p.genre} range ${lo}-${hi}`)
    if (!['literary', 'informational', 'poetry', 'drama'].includes(p.genre)) errs.push(`"${p.title}" bad genre ${p.genre}`)
    for (const q of p.questions) {
      qCount++
      const where = `"${p.title}" / ${q.teks} / "${q.stem.slice(0, 40)}..."`
      if (!validTeks.has(q.teks)) errs.push(`${where}: TEKS ${q.teks} not a G5 reading standard`)
      if (wc(q.stem) > 45) errs.push(`${where}: stem ${wc(q.stem)} words > 45`)
      const labels = q.choices.map((c) => c[0])
      if (labels.join('') !== 'ABCD') errs.push(`${where}: labels must be A,B,C,D (got ${labels.join(',')})`)
      const correct = q.choices.filter((c) => c[2] === true)
      if (correct.length !== 1) errs.push(`${where}: exactly one correct required (got ${correct.length})`)
      for (const [label, body, isCorrect, misc, tag] of q.choices) {
        if (!body || !body.trim()) errs.push(`${where} ${label}: empty body`)
        if (isCorrect) {
          if (misc !== null || tag !== null) errs.push(`${where} ${label}: correct choice must have null misconception/tag`)
        } else {
          if (!misc || !misc.trim()) errs.push(`${where} ${label}: distractor needs misconception text`)
          if (!tag) errs.push(`${where} ${label}: distractor needs misconception_tag`)
          else if (!validTags.has(tag)) errs.push(`${where} ${label}: tag "${tag}" not in map_misconception_tags`)
        }
      }
    }
  }
  return { errs, qCount }
}

// ─────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────
const [{ data: tagRows, error: tagErr }, { data: stdRows, error: stdErr }] = await Promise.all([
  sb.from('map_misconception_tags').select('tag').eq('subject', 'reading'),
  sb.from('map_standards').select('id,teks_code').eq('subject', 'reading').eq('grade', 5),
])
if (tagErr) { console.error('tag fetch failed:', tagErr.message); process.exit(1) }
if (stdErr) { console.error('standards fetch failed:', stdErr.message); process.exit(1) }
const validTags = new Set(tagRows.map((r) => r.tag))
const teksToId = new Map(stdRows.map((r) => [r.teks_code, r.id]))
const validTeks = new Set(teksToId.keys())

const { errs, qCount } = validate(validTags, validTeks)
console.log(`Validating ${PASSAGES.length} passages, ${qCount} questions...`)
if (errs.length) {
  console.error(`\n✗ ${errs.length} validation error(s):`)
  for (const e of errs) console.error('  - ' + e)
  process.exit(1)
}
console.log('✓ All content valid (one-correct, tags exist, TEKS exist, stem length, word counts).')

if (DRY_RUN) { console.log('\n--dry-run: no rows written.'); process.exit(0) }

let createdP = 0, skippedP = 0, createdQ = 0, skippedQ = 0
for (const p of PASSAGES) {
  // find-or-create passage by title + grade
  let { data: existing } = await sb.from('map_reading_passages')
    .select('id').eq('title', p.title).eq('grade', 5).maybeSingle()
  let passageId = existing?.id
  if (!passageId) {
    const { data, error } = await sb.from('map_reading_passages').insert({
      title: p.title, body: p.body, genre: p.genre, word_count: wc(p.body),
      lexile: p.lexile, rit_band: p.band, source: 'original', topic: p.topic, grade: 5,
    }).select('id').single()
    if (error) { console.error(`passage insert failed (${p.title}):`, error.message); process.exit(1) }
    passageId = data.id; createdP++
    console.log(`+ passage: ${p.title} (${p.genre}, ${p.band}, ${wc(p.body)}w)`)
  } else {
    skippedP++
    console.log(`= passage exists: ${p.title}`)
  }

  for (const q of p.questions) {
    // idempotent at question grain: skip if same stem already under this passage
    const { data: qExist } = await sb.from('map_questions')
      .select('id').eq('passage_id', passageId).eq('stem', q.stem).maybeSingle()
    if (qExist?.id) { skippedQ++; continue }
    const { data: qRow, error: qErr } = await sb.from('map_questions').insert({
      subject: 'reading', grade: 5, standard_id: teksToId.get(q.teks), passage_id: passageId,
      rit_band: p.band, difficulty: q.difficulty, stem: q.stem, stem_image_svg: null,
      explanation: q.explanation, source_note: SOURCE_NOTE, is_active: true, question_format: 'mcq',
    }).select('id').single()
    if (qErr) { console.error(`question insert failed (${q.stem.slice(0, 40)}):`, qErr.message); process.exit(1) }
    const rows = q.choices.map(([label, body, isCorrect, misc, tag], i) => ({
      question_id: qRow.id, label, body, is_correct: isCorrect,
      misconception: misc, misconception_tag: tag, sort_order: i + 1,
    }))
    const { error: cErr } = await sb.from('map_question_choices').insert(rows)
    if (cErr) { console.error(`choices insert failed (${q.stem.slice(0, 40)}):`, cErr.message); process.exit(1) }
    createdQ++
  }
}
console.log(`\nDone. Passages: +${createdP} created, ${skippedP} existed. Questions: +${createdQ} created, ${skippedQ} existed.`)
