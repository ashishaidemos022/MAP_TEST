// scripts/seed-g5-reading-batch03.mjs
// Grade 5 READING vetted-bank seed — batch 03. 10 passages + 48 questions.
// Uses the shared harness in ./lib/seed-reading-batch.mjs (see batch 01 for the
// full rationale). This batch lifts the thin low band (191_200) and grows the
// singleton standards (5.2A, 5.2C, 5.6C, 5.6G, 5.7D, 5.8D, 5.9A) off 1.
//
// Usage:
//   node --env-file=.env.local scripts/seed-g5-reading-batch03.mjs --dry-run
//   node --env-file=.env.local scripts/seed-g5-reading-batch03.mjs

import { runSeed } from './lib/seed-reading-batch.mjs'

const PASSAGES = [
  // 1 ────────────────────────────────────────────────────────────────────
  {
    title: "Hiroshi's Garden on the Roof",
    genre: 'literary', band: '201_210', lexile: 790,
    topic: 'Literary: persistence and community in a city garden',
    body: `Hiroshi lived in an apartment building with no yard, only a flat gray roof that nobody ever used. His grandfather had grown vegetables his whole life back in the countryside, and now, in the city, his hands seemed empty.

One spring morning, Hiroshi carried a single tomato seedling up the stairs to the roof and set it in a cracked clay pot. "It will never grow up here," his neighbor warned. "Too much wind, too much sun, no real soil."

Hiroshi was not sure either. But his grandfather had once told him that a garden does not need much, only someone willing to show up every day. So Hiroshi showed up. He watered the seedling each morning before school and checked it each evening after. When the wind knocked the pot over, he built a small wall of bricks to shelter it. When the leaves turned pale, he carried up buckets of richer soil, one heavy trip at a time.

Other tenants noticed. A woman from the third floor brought up a pot of herbs. A boy from the second floor planted beans. By midsummer, the empty gray roof had become a patchwork of green, and neighbors who had never spoken now traded watering tips and ripe tomatoes.

In August, Hiroshi picked the first red tomato and carried it down to his grandfather, who held it in both hands as if it were something precious. "You see," his grandfather said softly, his eyes bright. "A garden was never about the yard. It was always about the hands that tend it."

Hiroshi looked at his own hands, no longer empty, and understood that he had grown something far larger than a tomato.`,
    questions: [
      { teks: '5.8B', difficulty: 'medium',
        stem: "What does Hiroshi's daily care of the seedling show about him?",
        explanation: 'Hiroshi keeps watering and protecting the plant even when it is hard, showing he is patient and willing to stick with something.',
        choices: [
          ['A', 'He had nothing else to do after school.', false, 'Dismisses his effort instead of reading his character.', 'character_relationship_misread'],
          ['B', 'He was patient and willing to keep working at something hard.', true, null, null],
          ['C', 'He wanted to prove his neighbor was foolish.', false, 'Adds a motive the text does not give.', 'inference_unsupported'],
          ['D', 'He disliked living in the city.', false, 'A feeling the text does not show.', 'feelings_mismatch_evidence'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: "Why does the grandfather hold the tomato \"as if it were something precious\"?",
        explanation: "The tomato stands for his grandson's care and a piece of the country life he misses, so it means far more than its size.",
        choices: [
          ['A', 'The tomato was very expensive to buy.', false, 'Takes the value as literal money.', 'inference_literal_only'],
          ['B', "It represented his grandson's care and the life he missed.", true, null, null],
          ['C', 'He had never seen a tomato before.', false, 'Not supported by the text.', 'inference_unsupported'],
          ['D', 'He planned to sell it at a market.', false, 'Invents a detail the story never gives.', 'inference_unsupported'],
        ] },
      { teks: '5.2B', difficulty: 'medium',
        stem: 'In "the roof had become a patchwork of green," the word "patchwork" most nearly means—',
        explanation: 'A patchwork is many small pieces joined together; here it is many small plantings spread across the roof.',
        choices: [
          ['A', 'a single large square.', false, 'The opposite of many joined pieces.', 'vocab_antonym'],
          ['B', 'many small pieces joined together.', true, null, null],
          ['C', 'a torn, ruined cloth.', false, 'A different sense that does not fit.', 'vocab_wrong_sense_of_polysemous_word'],
          ['D', 'a kind of vegetable.', false, 'Unrelated to the word.', 'vocab_unrelated'],
        ] },
      { teks: '5.8A', difficulty: 'hard',
        stem: 'Which sentence best states a theme of the story?',
        explanation: 'A small, steady effort grows into a roof garden and a community. A theme is that caring for something steadily can grow more than you expect.',
        choices: [
          ['A', 'Tomatoes grow well on city rooftops.', false, 'A topic, not a theme.', 'theme_picked_topic'],
          ['B', 'Caring for something steadily can grow more than you expect.', true, null, null],
          ['C', 'Hiroshi lived in an apartment with no yard.', false, 'A detail, not a theme.', 'theme_picked_event'],
          ['D', 'Grandfathers enjoy gardening.', false, 'A topic, not the message.', 'theme_picked_topic'],
        ] },
      { teks: '5.6C', difficulty: 'medium',
        stem: 'Based on how the roof garden brought neighbors together, what is most likely to happen the next spring?',
        explanation: 'Since the garden grew and drew neighbors in, it is most likely that more tenants will join and it will grow larger.',
        choices: [
          ['A', 'The neighbors will stop speaking to each other.', false, 'Contradicts the growing community.', 'inference_unsupported'],
          ['B', 'More tenants will join and the roof garden will grow.', true, null, null],
          ['C', 'Hiroshi will move back to the countryside.', false, 'Not suggested by the text.', 'inference_unsupported'],
          ['D', 'The building will remove the garden entirely.', false, 'Stretches against the story’s direction.', 'inference_overgeneralized'],
        ] },
    ],
  },

  // 2 ────────────────────────────────────────────────────────────────────
  {
    title: "The Word He Couldn't Spell",
    genre: 'literary', band: '191_200', lexile: 720,
    topic: 'Literary: staying calm under pressure at a spelling bee',
    body: `Caleb had made it to the final round of the school spelling bee, and now only one other speller stood between him and the trophy. His hands were sweaty. The whole gym seemed to be holding its breath. He had studied word lists every night for a month, and now everything came down to a single word.

The judge read his word: "Rhythm."

Caleb's mind went blank. He knew he had studied this word. He could picture the page, but the letters had scattered like marbles. He opened his mouth and nothing came out.

"Take your time," the judge said kindly.

Caleb closed his eyes. His teacher had taught the class a trick for tricky words: break them into small chunks and say each piece. He whispered to himself, "Rhy... thm." He remembered the silly rule his teacher sang, that rhythm helps your two hips move, which meant two letters that were not vowels doing the work. The letters slowly drifted back into place.

"R-H-Y-T-H-M," he said, one careful letter at a time. "Rhythm."

"Correct!"

The gym erupted. Caleb had won. But as he walked up to take the trophy, he realized the proudest part was not winning. It was the moment in the silence when he had almost given up, and chose to try one more time instead. He had not won because he never made mistakes. He had won because he knew what to do when his mind went blank.

That night, he set the trophy on his shelf, but he kept thinking about the trick that saved him. Sometimes, he decided, being smart was not about knowing everything. It was about staying calm long enough to remember what you knew.`,
    questions: [
      { teks: '5.8C', difficulty: 'medium',
        stem: 'Which moment is the turning point of the story?',
        explanation: "The story turns when Caleb remembers his teacher's trick and breaks the word into chunks, which lets him spell it.",
        choices: [
          ['A', 'Caleb sets the trophy on his shelf.', false, 'This is the resolution, not the turn.', 'plot_picked_detail'],
          ['B', "Caleb remembers his teacher's trick and breaks the word apart.", true, null, null],
          ['C', 'The judge reads the word "rhythm."', false, 'Sets up the problem, not the turn.', 'plot_event_confusion'],
          ['D', 'Caleb makes it to the final round.', false, 'A setup detail.', 'plot_picked_detail'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'Why does the author say the letters "had scattered like marbles"?',
        explanation: 'Under pressure, Caleb could not hold the letters in order in his mind; the image shows his thoughts rolling away.',
        choices: [
          ['A', 'Caleb dropped marbles on the floor.', false, 'Reads the image literally.', 'inference_literal_only'],
          ['B', 'Under pressure he could not put the letters in order in his mind.', true, null, null],
          ['C', 'The gym floor was covered in marbles.', false, 'Not in the text.', 'inference_unsupported'],
          ['D', 'Caleb was playing a game during the bee.', false, 'Invents an unsupported detail.', 'inference_unsupported'],
        ] },
      { teks: '5.8A', difficulty: 'medium',
        stem: 'Which sentence best states a theme of the story?',
        explanation: 'Caleb wins by calming down and recalling a strategy. A theme is that staying calm can help you remember what you already know.',
        choices: [
          ['A', 'Spelling bees are stressful events.', false, 'A topic, not a theme.', 'theme_picked_topic'],
          ['B', 'Staying calm can help you remember what you already know.', true, null, null],
          ['C', 'Caleb won a trophy at his school.', false, 'A single event.', 'theme_picked_event'],
          ['D', 'Hard words are impossible to spell.', false, 'Contradicts the story.', 'theme_picked_topic'],
        ] },
      { teks: '5.2B', difficulty: 'easy',
        stem: 'In "The gym erupted," the word "erupted" most nearly means—',
        explanation: 'The gym did not catch fire; "erupted" here means it suddenly became loud and excited with cheering.',
        choices: [
          ['A', 'caught on fire.', false, 'A different sense of the word that does not fit.', 'vocab_wrong_sense_of_polysemous_word'],
          ['B', 'became suddenly loud and excited.', true, null, null],
          ['C', 'grew completely silent.', false, 'The opposite of the meaning.', 'vocab_antonym'],
          ['D', 'slowly emptied out.', false, 'Unrelated to the word.', 'vocab_unrelated'],
        ] },
      { teks: '5.6C', difficulty: 'medium',
        stem: 'Based on the ending, what will Caleb most likely do the next time he faces a hard problem?',
        explanation: 'He learned the value of staying calm and using a strategy, so he will most likely do that again.',
        choices: [
          ['A', 'Give up right away.', false, 'Contradicts what he learned.', 'inference_unsupported'],
          ['B', 'Stay calm and try to remember a strategy.', true, null, null],
          ['C', 'Refuse to ever enter a contest again.', false, 'Overstates beyond the text.', 'inference_overgeneralized'],
          ['D', 'Ask someone else to solve it for him.', false, 'Not supported by the ending.', 'inference_unsupported'],
        ] },
    ],
  },

  // 3 ────────────────────────────────────────────────────────────────────
  {
    title: 'The Letter in the Wall',
    genre: 'literary', band: '221_230', lexile: 910,
    topic: 'Literary (historical fiction): a house connects past and present lives',
    body: `When Mei's family moved into the old house on Cedar Street, the walls were full of secrets.

The house was nearly a hundred years old, with crooked floors and a staircase that groaned. While her father was repairing a cracked plaster wall in the attic, a small yellowed envelope slipped out and fluttered to the floor. Inside was a letter, written in careful, old-fashioned handwriting, dated more than seventy years before.

The letter was from a girl named Ava, who had lived in the house as a child during a long-ago war. She wrote about rationing sugar, about her brother who had gone away to serve, and about planting a small "victory garden" in the backyard so the family would have enough to eat. At the end she had written: "I am hiding this letter in the wall so that whoever finds it will know we were here, and that we were brave."

Mei read the letter three times. She walked to the backyard and looked at the overgrown patch of dirt where, she now realized, Ava's garden must once have grown. The same sun that warmed Mei's shoulders had once warmed Ava's. The same floorboards that creaked under Mei's feet had creaked under Ava's.

That night, Mei could not stop thinking about how a house could hold so many lives, stacked like pages in a book. She found a fresh sheet of paper and began to write her own letter, about her family, about the world as it was now, and about her hopes for whoever might live here next.

In the morning, she slipped her letter into the wall beside the place where Ava's had waited so patiently. Someday, she thought, another child would find both letters and understand: this house was never just walls and floors. It was a chain of hands reaching across the years, each one saying, quietly, we were here.`,
    questions: [
      { teks: '5.8A', difficulty: 'hard',
        stem: 'Which statement best expresses a theme of the story?',
        explanation: 'Through the two letters, the story shows that the places we live connect us to the people who came before and after us.',
        choices: [
          ['A', 'Old houses often have cracked walls.', false, 'A topic, not a theme.', 'theme_picked_topic'],
          ['B', 'The places we live connect us to those who came before.', true, null, null],
          ['C', 'Mei found a letter in the attic wall.', false, 'A single event.', 'theme_picked_event'],
          ['D', 'Letters should always be hidden in walls.', false, 'Overstates a detail as a theme.', 'theme_picked_topic'],
        ] },
      { teks: '5.8D', difficulty: 'hard',
        stem: 'How does the old house shape what happens in the story?',
        explanation: "Because the house is very old, it holds hidden traces of past lives, like Ava's letter, which sets the whole story in motion.",
        choices: [
          ['A', "Its age means it holds hidden traces of past lives, like Ava's letter.", true, null, null],
          ['B', 'The house is too small for Mei’s family.', false, 'Not supported by the text.', 'inference_unsupported'],
          ['C', 'The house is brand new and modern.', false, 'Contradicts the old house.', 'setting_character_misidentified'],
          ['D', 'The house has no backyard.', false, 'Contradicts the garden detail.', 'inference_unsupported'],
        ] },
      { teks: '5.6F', difficulty: 'hard',
        stem: 'Why does Mei write her own letter and hide it in the wall?',
        explanation: 'Mei wants to continue what Ava began, connecting her own life to whoever will live in the house in the future.',
        choices: [
          ['A', 'She copies Ava exactly for no reason.', false, 'Misses her purpose.', 'inference_literal_only'],
          ['B', 'She wants to continue the chain, linking her life to future readers.', true, null, null],
          ['C', 'She is trying to hide the letter from her parents.', false, 'Not supported by the text.', 'inference_unsupported'],
          ['D', 'She has run out of anywhere else to keep paper.', false, 'An absurd, unsupported reason.', 'inference_unsupported'],
        ] },
      { teks: '5.2B', difficulty: 'hard',
        stem: 'In the letter, "rationing sugar" means—',
        explanation: 'During the war, rationing meant limiting how much sugar each family could use, so supplies would last.',
        choices: [
          ['A', 'buying as much sugar as you want.', false, 'The opposite of rationing.', 'vocab_antonym'],
          ['B', 'limiting how much of something each person can use.', true, null, null],
          ['C', 'cooking sugar into candy.', false, 'Unrelated to the word.', 'vocab_unrelated'],
          ['D', 'growing sugar in a garden.', false, 'Ignores the context.', 'vocab_skipped_context_clues'],
        ] },
      { teks: '5.7D', difficulty: 'hard',
        stem: 'Which sentence is the BEST summary of the story?',
        explanation: 'A good summary captures the whole arc: Mei finds an old wartime letter in her house and adds her own, linking past and future.',
        choices: [
          ['A', 'Mei’s father was repairing a cracked attic wall.', false, 'A minor detail.', 'summary_included_minor_detail'],
          ['B', 'Mei finds an old letter in her house and adds her own, linking past and future.', true, null, null],
          ['C', 'The house on Cedar Street was nearly a hundred years old.', false, 'Echoes an opening detail.', 'summary_copied_first_sentence'],
          ['D', 'Ava planted a victory garden in the backyard.', false, 'A small detail from the letter.', 'summary_included_minor_detail'],
        ] },
    ],
  },

  // 4 ────────────────────────────────────────────────────────────────────
  {
    title: 'The Eight-Armed Genius',
    genre: 'informational', band: '201_210', lexile: 770,
    topic: 'Informational science: octopus intelligence and abilities',
    body: `If you ever meet an octopus, prepare to be surprised. Behind those eight curling arms hides one of the cleverest animals in the ocean.

An octopus has no bones at all. Its soft body can squeeze through any opening larger than its hard beak, which means an octopus the size of a dinner plate can slip through a hole the size of a coin. In aquariums, octopuses have been known to escape their tanks at night, cross the floor, and sneak into a neighboring tank for a snack before sliding home.

Octopuses are also masters of disguise. Special cells in their skin let them change color and even texture in less than a second. An octopus can flatten itself against a rock and turn the exact gray of the stone, or ripple its skin to look like waving seaweed. Predators swim right past without noticing.

Perhaps most impressive is the octopus brain, or rather, its brains. An octopus has a central brain plus a cluster of nerve cells in each arm, so its arms can taste, touch, and even solve small problems on their own. Scientists have watched octopuses open jars, carry coconut shells to use as portable shelters, and remember which humans had been kind to them and which had not.

For an animal that lives only a few years, the octopus packs in a remarkable amount of intelligence. The more researchers study these strange, soft-bodied creatures, the more they realize how much there is still to learn about minds very different from our own.`,
    questions: [
      { teks: '5.9D.i', difficulty: 'medium',
        stem: 'What is the central idea of the passage?',
        explanation: 'Every section describes how clever and adaptable octopuses are; that is the central idea.',
        choices: [
          ['A', 'Octopuses have no bones.', false, 'A single detail.', 'main_idea_picked_detail'],
          ['B', 'The octopus is a surprisingly intelligent, adaptable ocean animal.', true, null, null],
          ['C', 'Octopuses can escape from aquarium tanks.', false, 'One example, not the central idea.', 'main_idea_picked_detail'],
          ['D', 'Octopuses live only a few years.', false, 'A detail near the end.', 'main_idea_picked_detail'],
        ] },
      { teks: '5.9D.iii', difficulty: 'hard',
        stem: 'How is the passage mainly organized?',
        explanation: 'The author describes several remarkable abilities of the octopus, one after another.',
        choices: [
          ['A', 'by telling a story about one octopus in time order', false, 'No single narrative is told.', 'text_structure_picked_first_one_recognized'],
          ['B', 'by describing several remarkable abilities of the octopus', true, null, null],
          ['C', 'by comparing octopuses and fish point by point', false, 'No such comparison appears.', 'text_structure_picked_content'],
          ['D', 'by listing steps to care for a pet octopus', false, 'No how-to steps appear.', 'text_structure_picked_content'],
        ] },
      { teks: '5.2A', difficulty: 'medium',
        stem: 'A dictionary lists "beak" as (1) a bird’s hard mouth part or (2) the hard mouth part of an octopus or squid. Which meaning fits the passage?',
        explanation: 'The passage is about an octopus, so meaning 2, the hard mouth part of an octopus, is the one that fits.',
        choices: [
          ['A', 'Meaning 1, the mouth part of a bird.', false, 'Wrong sense for this context.', 'vocab_wrong_sense_of_polysemous_word'],
          ['B', 'Meaning 2, the hard mouth part of an octopus.', true, null, null],
          ['C', 'A kind of arm the octopus uses.', false, 'Ignores the definitions given.', 'vocab_skipped_context_clues'],
          ['D', 'A tool scientists use to study octopuses.', false, 'Unrelated to the word.', 'vocab_unrelated'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'Why is being able to change color helpful to an octopus?',
        explanation: 'Changing color lets the octopus blend into rocks or seaweed so predators do not notice it.',
        choices: [
          ['A', 'It helps the octopus swim faster.', false, 'Not what color change does.', 'inference_unsupported'],
          ['B', 'It lets the octopus hide from predators by blending in.', true, null, null],
          ['C', 'It makes the octopus look prettier to people.', false, 'Not supported by the text.', 'inference_unsupported'],
          ['D', 'It helps the octopus grow new arms.', false, 'Stretches beyond the passage.', 'inference_overgeneralized'],
        ] },
      { teks: '5.7D', difficulty: 'hard',
        stem: 'Which sentence is the BEST summary of the passage?',
        explanation: 'A good summary names the octopus’s key traits: a soft body, color-changing skin, and smart, capable arms.',
        choices: [
          ['A', 'An octopus can squeeze through a hole the size of a coin.', false, 'A single detail.', 'summary_included_minor_detail'],
          ['B', 'The octopus is a clever ocean animal with a soft body, color-changing skin, and smart arms.', true, null, null],
          ['C', 'If you ever meet an octopus, prepare to be surprised.', false, 'Echoes the opening line.', 'summary_copied_first_sentence'],
          ['D', 'Octopuses can open jars to reach food.', false, 'A small example.', 'summary_included_minor_detail'],
        ] },
    ],
  },

  // 5 ────────────────────────────────────────────────────────────────────
  {
    title: 'When a Mountain Wakes Up',
    genre: 'informational', band: '211_220', lexile: 860,
    topic: 'Informational science: what causes a volcano to erupt (with headings)',
    body: `For hundreds of years, a volcano can sit silent and still, looking like an ordinary mountain. Then, almost without warning, it can roar to life. What causes a mountain to wake up?

Beneath the Surface

Deep under the ground, far below where we walk, there is rock so hot that it has melted into a thick, glowing liquid called magma. Magma is lighter than the solid rock around it, so it slowly rises, collecting in pools called magma chambers. Pressure builds, the way air builds inside a shaken soda bottle. When the pressure grows too great, the magma forces its way up through cracks toward the surface.

The Eruption

Once magma reaches the open air, it is called lava. Some eruptions are gentle, with lava oozing slowly down the slopes. Others are violent, blasting ash, rock, and gas high into the sky. The kind of eruption depends partly on how thick the magma is. Thin, runny magma lets gas escape easily and flows quietly. Thick, sticky magma traps gas until it bursts, like a shaken bottle finally opened.

After an eruption ends, the volcano may return to sleep for years, decades, or centuries. Scientists call such a resting volcano dormant, but dormant does not mean dead. Many of the world's most dangerous volcanoes spent long, quiet centuries before suddenly waking again.

By studying the tiny earthquakes and the swelling ground that often come before an eruption, scientists today can sometimes warn people in time to escape. We cannot stop a mountain from waking, but we are learning, slowly, to listen for the signs that it is stirring.`,
    questions: [
      { teks: '5.9D.iii', difficulty: 'hard',
        stem: 'How does the author mainly organize the passage?',
        explanation: 'The passage explains the causes that build up and lead a volcano to erupt, a cause-and-effect structure.',
        choices: [
          ['A', 'by telling the life story of one scientist', false, 'No biography appears.', 'text_structure_picked_content'],
          ['B', 'by explaining the causes that lead a volcano to erupt', true, null, null],
          ['C', 'by comparing two countries that have volcanoes', false, 'No countries are compared.', 'text_structure_picked_content'],
          ['D', 'by listing volcanoes from largest to smallest', false, 'No such list appears.', 'text_structure_picked_first_one_recognized'],
        ] },
      { teks: '5.9D.i', difficulty: 'medium',
        stem: 'Which sentence best states the central idea?',
        explanation: 'The main point is that pressure from rising magma is what causes a volcano to erupt.',
        choices: [
          ['A', 'Lava can ooze slowly down a slope.', false, 'A detail.', 'main_idea_picked_detail'],
          ['B', 'Pressure from rising magma is what causes a volcano to erupt.', true, null, null],
          ['C', 'Some volcanoes are dormant for centuries.', false, 'A detail.', 'main_idea_picked_detail'],
          ['D', 'Magma is lighter than solid rock.', false, 'A supporting fact.', 'main_idea_picked_detail'],
        ] },
      { teks: '5.9D.ii', difficulty: 'medium',
        stem: 'The headings "Beneath the Surface" and "The Eruption" help the reader by—',
        explanation: 'The headings divide the passage into stages and tell the reader what each section explains.',
        choices: [
          ['A', 'telling who first discovered volcanoes.', false, 'Headings do not name a discoverer.', 'text_features_misread'],
          ['B', 'dividing the passage into stages and signaling what each part explains.', true, null, null],
          ['C', 'listing the names of famous volcanoes.', false, 'Headings are not a name list.', 'text_features_misread'],
          ['D', 'giving the dictionary definition of lava.', false, 'Headings are not definitions.', 'text_features_misread'],
        ] },
      { teks: '5.2C', difficulty: 'hard',
        stem: 'The word "dormant" comes from a root meaning "to sleep." Based on the passage, a dormant volcano is one that is—',
        explanation: 'With a root meaning "to sleep," and the passage saying dormant is not dead, a dormant volcano is resting but able to erupt later.',
        choices: [
          ['A', 'erupting violently right now.', false, 'The opposite of "resting."', 'affix_meaning_confusion'],
          ['B', 'resting quietly but still able to erupt later.', true, null, null],
          ['C', 'completely gone and never coming back.', false, 'Contradicts "dormant does not mean dead."', 'inference_unsupported'],
          ['D', 'made entirely of cooled, hardened lava.', false, 'Connects the root to the wrong idea.', 'affix_meaning_confusion'],
        ] },
      { teks: '5.6F', difficulty: 'hard',
        stem: 'Why can scientists sometimes warn people before an eruption?',
        explanation: 'Small earthquakes and swelling ground often come before an eruption, giving scientists warning signs to watch.',
        choices: [
          ['A', 'Volcanoes erupt on a fixed yearly schedule.', false, 'Not supported by the text.', 'inference_unsupported'],
          ['B', 'Small earthquakes and swelling ground often come first.', true, null, null],
          ['C', 'Every volcano smokes for exactly a week first.', false, 'Overstates the warning signs.', 'inference_overgeneralized'],
          ['D', 'Lava is easy to stop once it starts.', false, 'Contradicts the passage.', 'text_evidence_misread'],
        ] },
    ],
  },

  // 6 ────────────────────────────────────────────────────────────────────
  {
    title: 'The Girl Who Mapped the Ocean Floor',
    genre: 'informational', band: '211_220', lexile: 880,
    topic: 'Informational biography: Marie Tharp and the mapping of the sea floor',
    body: `For most of history, the bottom of the ocean was a mystery. People imagined it as a flat, muddy plain, because no one could see through miles of dark water. Then a scientist named Marie Tharp picked up her pencil and changed the way the world pictured the planet.

In the 1950s, Marie worked in a laboratory studying the ocean. At that time, women were not allowed on the research ships that measured the sea floor, so the men sailed out and collected the data, and Marie stayed behind to turn their numbers into maps. It was painstaking work. Line by line, she translated thousands of depth measurements into careful drawings of the hidden landscape below.

As her map grew, Marie noticed something astonishing. Running down the middle of the Atlantic Ocean was an enormous mountain range, split by a deep valley. She believed the valley was a crack where the sea floor was slowly pulling apart. When she showed her idea to a colleague, he dismissed it at first as "girl talk." But Marie had checked her work carefully, and the evidence was there in her own neat lines.

In time, the world caught up to her. Marie's maps became powerful proof for the theory that the Earth's surface is made of giant moving plates, an idea that reshaped all of science. The flat, muddy plain people had imagined turned out to be one of the most dramatic landscapes on Earth, with mountains taller than any on dry land.

Marie Tharp spent decades being told her ideas could not be right. She kept drawing anyway. Today, scientists agree her maps were among the most important discoveries of the century, made not from the deck of a ship, but from a quiet desk, one careful line at a time.`,
    questions: [
      { teks: '5.6G', difficulty: 'medium',
        stem: 'What is the central message of this biography?',
        explanation: 'The biography shows that careful work and persistence let Marie Tharp reveal the true shape of the ocean floor.',
        choices: [
          ['A', 'The ocean is miles deep and dark.', false, 'A detail.', 'main_idea_picked_detail'],
          ['B', 'Careful work and persistence let Marie Tharp reveal the ocean floor.', true, null, null],
          ['C', 'Women were not allowed on research ships in the 1950s.', false, 'A detail along the way.', 'main_idea_picked_detail'],
          ['D', 'Maps are made from depth measurements.', false, 'A detail, not the message.', 'main_idea_picked_detail'],
        ] },
      { teks: '5.7C', difficulty: 'medium',
        stem: "Which detail best supports the idea that Marie's discovery was at first not taken seriously?",
        explanation: 'A colleague dismissing her idea as "girl talk" directly shows it was not taken seriously at first.',
        choices: [
          ['A', '"She translated thousands of depth measurements into drawings."', false, 'Shows her method, not the doubt.', 'evidence_wrong_detail'],
          ['B', 'A colleague "dismissed it at first as girl talk."', true, null, null],
          ['C', '"Marie worked in a laboratory studying the ocean."', false, 'From a different part of the text.', 'evidence_wrong_paragraph'],
          ['D', '"mountains taller than any on dry land."', false, 'Describes the discovery, not the doubt.', 'text_evidence_misread'],
        ] },
      { teks: '5.6F', difficulty: 'hard',
        stem: 'Why does the author mention that Marie was not allowed on the research ships?',
        explanation: 'It shows she made a great discovery despite unfair limits placed on her.',
        choices: [
          ['A', 'to show she made her discovery despite unfair limits', true, null, null],
          ['B', 'to prove that research ships are dangerous', false, 'Not the author’s point.', 'inference_unsupported'],
          ['C', 'to explain that Marie could not swim', false, 'Not supported by the text.', 'inference_unsupported'],
          ['D', 'to show she preferred to work alone', false, 'A feeling the text does not give.', 'feelings_mismatch_evidence'],
        ] },
      { teks: '5.2B', difficulty: 'medium',
        stem: 'In "It was painstaking work," the word "painstaking" most nearly means—',
        explanation: 'Painstaking means done with great care and effort, line by line, as Marie worked.',
        choices: [
          ['A', 'careful and requiring great effort.', true, null, null],
          ['B', 'painful and injuring her hands.', false, 'Misreads the "pain" part literally.', 'vocab_wrong_sense_of_polysemous_word'],
          ['C', 'quick and easy.', false, 'The opposite of the meaning.', 'vocab_antonym'],
          ['D', 'boring and pointless.', false, 'Unrelated to the meaning.', 'vocab_unrelated'],
        ] },
      { teks: '5.10A', difficulty: 'hard',
        stem: 'Why does the author end by saying her discovery came "from a quiet desk, one careful line at a time"?',
        explanation: 'The ending highlights that patient, careful work, not fame or adventure, led to a great discovery.',
        choices: [
          ['A', 'to explain how to draw a map', false, 'Names a topic, not the purpose.', 'purpose_confused_topic_with_purpose'],
          ['B', 'to highlight that patient, careful work led to a great discovery', true, null, null],
          ['C', 'to argue that everyone should become a mapmaker', false, 'Overstates the aim.', 'purpose_picked_topic_overgeneralization'],
          ['D', 'to tell a make-believe adventure story', false, 'Names the wrong kind of writing.', 'purpose_picked_genre_mismatch'],
        ] },
    ],
  },

  // 7 ────────────────────────────────────────────────────────────────────
  {
    title: 'Why Kids Should Learn to Cook',
    genre: 'informational', band: '221_230', lexile: 900,
    topic: 'Argumentative (persuasive essay): kids should learn to cook',
    body: `Some people think cooking is a job only for grown-ups. I disagree. I believe every kid should learn to cook, and the sooner the better.

The most obvious reason is health. When you know how to cook, you understand what goes into your food. A kid who can make a simple vegetable stir-fry is far more likely to eat vegetables than a kid who only knows how to open a bag of chips. Cooking turns healthy eating from a rule your parents enforce into a choice you make yourself.

Cooking also teaches skills that reach far beyond the kitchen. Following a recipe means reading carefully, measuring accurately, and doing steps in the right order, the same skills we use in math and science. When I doubled a muffin recipe for my class, I had to multiply every amount by two. The kitchen became a math classroom that happened to smell wonderful.

Some adults worry that kids in the kitchen will make a mess or get hurt. Those worries are fair, but they are reasons to teach kids carefully, not to keep them out. A child who learns to use a knife safely at ten is safer, not more in danger, than one who first picks up a knife as an adult.

Best of all, cooking brings people together. The meals I have made for my family are the ones I am proudest of, because I made something that took care of the people I love.

A kid who can cook is healthier, sharper, and more confident. That is why I believe learning to cook should be part of growing up, not something we wait until adulthood to begin.`,
    questions: [
      { teks: '5.9E', difficulty: 'hard',
        stem: 'What is the writer’s main claim?',
        explanation: 'The main claim, stated up front, is that every kid should learn to cook. The other points are reasons that support it.',
        choices: [
          ['A', 'Following a recipe is like doing math.', false, 'A supporting reason, not the claim.', 'argumentative_confused_claim_with_evidence'],
          ['B', 'Every kid should learn to cook.', true, null, null],
          ['C', 'Some kids only know how to open a bag of chips.', false, 'A detail, not the claim.', 'main_idea_picked_detail'],
          ['D', 'Cooking can make a mess in the kitchen.', false, 'A worry the writer answers, not the claim.', 'argumentative_confused_claim_with_evidence'],
        ] },
      { teks: '5.9E', difficulty: 'medium',
        stem: 'Which reason does the writer give to answer adults who worry kids will get hurt?',
        explanation: 'The writer argues a child who learns knife safety young is safer, not more in danger, so the answer is to teach carefully.',
        choices: [
          ['A', 'Cooking brings people together.', false, 'A different reason.', 'evidence_wrong_detail'],
          ['B', 'Learning knife safety young makes a child safer, not more in danger.', true, null, null],
          ['C', 'Cooking teaches math skills.', false, 'A different paragraph’s reason.', 'evidence_wrong_paragraph'],
          ['D', 'Healthy eating becomes a choice.', false, 'A different reason.', 'evidence_wrong_detail'],
        ] },
      { teks: '5.10A', difficulty: 'medium',
        stem: 'The writer’s main purpose is to—',
        explanation: 'The essay is written to persuade readers that kids should learn to cook.',
        choices: [
          ['A', 'persuade readers that kids should learn to cook', true, null, null],
          ['B', 'give a step-by-step recipe for muffins', false, 'Names a topic, not the purpose.', 'purpose_confused_topic_with_purpose'],
          ['C', 'entertain with a funny cooking disaster', false, 'Names the wrong kind of writing.', 'purpose_picked_genre_mismatch'],
          ['D', 'describe what a kitchen looks like', false, 'A minor topic, not the goal.', 'author_purpose_topic_not_purpose'],
        ] },
      { teks: '5.6F', difficulty: 'hard',
        stem: 'By describing doubling a muffin recipe, the writer suggests that cooking—',
        explanation: 'Doubling a recipe required multiplying, which shows cooking can help kids practice real math skills.',
        choices: [
          ['A', 'is only useful for baking sweets.', false, 'Overstates and misses the point.', 'inference_overgeneralized'],
          ['B', 'can help kids practice real math skills.', true, null, null],
          ['C', 'is too hard for most children.', false, 'Contradicts the writer’s argument.', 'text_evidence_misread'],
          ['D', 'should replace school entirely.', false, 'An absurd, unsupported leap.', 'inference_unsupported'],
        ] },
      { teks: '5.7G', difficulty: 'hard',
        stem: 'Which idea is most important to the writer’s argument?',
        explanation: 'The argument rests on the idea that cooking makes kids healthier, sharper, and more confident.',
        choices: [
          ['A', 'The writer once made muffins for the class.', false, 'A supporting detail.', 'plot_picked_detail'],
          ['B', 'Cooking makes kids healthier, sharper, and more confident.', true, null, null],
          ['C', 'Some adults worry about messes.', false, 'A counterpoint, not the central idea.', 'main_idea_picked_detail'],
          ['D', 'Chips come in bags.', false, 'A trivial detail.', 'plot_picked_detail'],
        ] },
    ],
  },

  // 8 ────────────────────────────────────────────────────────────────────
  {
    title: 'First Snow',
    genre: 'poetry', band: '191_200', lexile: 700,
    topic: 'Poetry: the quiet wonder of the first snowfall',
    body: `The first snow comes without a sound,
no thunder and no warning call,
just feathers drifting toward the ground
as if the sky began to fall.

It tucks the rooftops into white,
it folds the noisy streets in hush.
The bus is late, the world is bright,
and even hurried people, rushing,

stop. They lift their chins and stare
the way they did when they were small,
and for a moment everywhere
the snow makes children of us all.`,
    questions: [
      { teks: '5.9B', difficulty: 'medium',
        stem: 'The snow is compared to "feathers drifting toward the ground." This helps the reader picture snow that—',
        explanation: 'Feathers fall softly and slowly, so the comparison shows snow falling lightly and gently.',
        choices: [
          ['A', 'is sharp and heavy.', false, 'The opposite of soft feathers.', 'imagery_literal_detail'],
          ['B', 'falls softly, lightly, and slowly.', true, null, null],
          ['C', 'melts the moment it lands.', false, 'Not suggested by the image.', 'inference_unsupported'],
          ['D', 'is made of real bird feathers.', false, 'Takes the comparison literally.', 'figurative_language_literal_interpretation'],
        ] },
      { teks: '5.10D', difficulty: 'hard',
        stem: 'The line "it folds the noisy streets in hush" mainly shows that the snow—',
        explanation: 'To fold the streets "in hush" means the snow makes the streets quiet and calm.',
        choices: [
          ['A', 'makes the streets quiet and calm.', true, null, null],
          ['B', 'covers the streets with folded blankets.', false, 'A literal misreading of "folds."', 'figurative_taken_literally'],
          ['C', 'makes the streets much louder.', false, 'The opposite of "hush."', 'imagery_literal_detail'],
          ['D', 'blocks the streets with tall snowdrifts.', false, 'Not what the line says.', 'inference_unsupported'],
        ] },
      { teks: '5.8A', difficulty: 'medium',
        stem: 'What is the main message of the poem?',
        explanation: 'The poem ends with snow making "children of us all," so its message is that a quiet moment can make grown-ups feel young again.',
        choices: [
          ['A', 'Snow can make the bus run late.', false, 'A detail, not the message.', 'theme_picked_event'],
          ['B', 'A quiet moment can make grown-ups feel like children again.', true, null, null],
          ['C', 'Winter is the coldest season.', false, 'A topic, not the message.', 'theme_picked_topic'],
          ['D', 'Snow falls from the sky.', false, 'A plain fact, not a theme.', 'theme_picked_topic'],
        ] },
      { teks: '5.9A', difficulty: 'medium',
        stem: 'Which feature shows that this text is a poem rather than a news article?',
        explanation: 'It is written in short rhyming lines and uses images to create a feeling, which are features of poetry.',
        choices: [
          ['A', 'It reports facts about a storm with exact dates.', false, 'Describes a news article, not this text.', 'genre_feature_confusion'],
          ['B', 'It uses rhyming lines and images to create a feeling.', true, null, null],
          ['C', 'It uses headings and a photograph.', false, 'Names text features not present.', 'text_features_misread'],
          ['D', 'It gives step-by-step instructions for shoveling snow.', false, 'Not what this text does.', 'genre_feature_confusion'],
        ] },
    ],
  },

  // 9 ────────────────────────────────────────────────────────────────────
  {
    title: 'The Group Project Vote',
    genre: 'drama', band: '201_210', lexile: 740,
    topic: 'Drama: classmates compromise on a project topic',
    body: `SETTING: A classroom corner. ZOE, DIEGO, and two classmates must choose a topic for a group science project. Zoe holds a list.

ZOE: Okay, we have to pick one. I really want to do our project on tornadoes.

DIEGO: But three of us already said we wanted volcanoes. It should be the majority.

ZOE: (frowning) Tornadoes are way more interesting, though.

DIEGO: Maybe to you. But if we pick what only one person likes, the rest of us won't want to work on it.

ZOE: (pausing) ...That's a fair point. I guess I was only thinking about what I wanted.

DIEGO: Here's an idea. What if we do volcanoes, but you lead the part about how volcanoes and tornadoes are both powered by energy and pressure? You'd still get to bring in your idea.

ZOE: (brightening) So I could compare them? That actually sounds cool.

DIEGO: And next time, if you feel strongly, we vote first instead of arguing.

ZOE: Deal. (She crosses out "tornadoes" and writes "volcanoes, with a tornado comparison.") You know, that's better than either of our first ideas.

DIEGO: That's kind of how good teams work. (They high-five and get to work.)`,
    questions: [
      { teks: '5.8B', difficulty: 'easy',
        stem: 'What do Zoe and Diego disagree about?',
        explanation: 'Their disagreement is about which topic the group should choose for the project.',
        choices: [
          ['A', 'which topic the group should choose', true, null, null],
          ['B', 'who is the smartest in the group', false, 'Not what they argue about.', 'character_relationship_misread'],
          ['C', 'where the group should meet', false, 'Never discussed.', 'plot_event_confusion'],
          ['D', 'whether to do the project at all', false, 'They both want to do it.', 'plot_picked_detail'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'When Zoe says, "I guess I was only thinking about what I wanted," it shows that she—',
        explanation: 'Zoe realizes she had not considered the rest of the group’s wishes.',
        choices: [
          ['A', 'still refuses to change her mind.', false, 'Contradicts her words.', 'inference_unsupported'],
          ['B', 'realizes she had not considered the group’s wishes.', true, null, null],
          ['C', 'is angry at Diego for disagreeing.', false, 'A feeling the scene does not show.', 'feelings_mismatch_evidence'],
          ['D', 'no longer wants to do the project.', false, 'Not supported by the scene.', 'inference_unsupported'],
        ] },
      { teks: '5.8C', difficulty: 'medium',
        stem: 'How is the disagreement resolved?',
        explanation: 'They agree to do volcanoes, with Zoe leading a comparison to tornadoes, so both ideas are included.',
        choices: [
          ['A', 'The group does Zoe’s tornado idea after all.', false, 'Contradicts the ending.', 'plot_event_confusion'],
          ['B', 'They do volcanoes, with Zoe leading a tornado comparison.', true, null, null],
          ['C', 'Each member does a separate project alone.', false, 'They work together.', 'plot_event_confusion'],
          ['D', 'They give up and ask the teacher to choose.', false, 'That never happens.', 'plot_picked_detail'],
        ] },
      { teks: '5.8A', difficulty: 'hard',
        stem: 'What does the scene suggest about working in a group?',
        explanation: 'Their compromise produces a better idea than either started with, suggesting listening and compromising can improve an idea.',
        choices: [
          ['A', 'The loudest person should get their way.', false, 'The opposite of the scene.', 'theme_picked_topic'],
          ['B', 'Listening and compromising can lead to a better idea.', true, null, null],
          ['C', 'Volcanoes are better than tornadoes.', false, 'A topic, not the point.', 'theme_picked_topic'],
          ['D', 'Group projects are a waste of time.', false, 'Contradicts the scene.', 'theme_picked_event'],
        ] },
    ],
  },

  // 10 ───────────────────────────────────────────────────────────────────
  {
    title: 'The Last Game of Catch',
    genre: 'literary', band: '231_240', lexile: 940,
    topic: 'Literary: treasuring time with a grandparent',
    body: `Every summer for as long as Jamal could remember, he and his grandfather had played catch in the backyard after dinner. The rhythm of it was as steady as a heartbeat: the soft pop of the ball in the glove, the easy arc through the gold evening light, the quiet talk that filled the spaces between throws.

This summer was different. His grandfather moved more slowly now. His throws, once crisp, wobbled and fell short. Sometimes he had to sit down halfway through, pressing a hand to his chest and laughing it off. "Just catching my breath," he would say. But Jamal noticed.

One evening, his grandfather could not throw at all. He sat in the lawn chair and asked Jamal to throw the ball against the fence so he could watch. Jamal did, but it wasn't the same, and they both knew it.

"You're getting good," his grandfather said. "Better than I ever was."

Jamal wanted to argue, to insist that his grandfather was still the best, that nothing had changed. Instead he sat down in the grass beside the chair, the glove still warm on his hand, and they watched the sky turn from gold to rose to a deep and quiet blue.

"Grandpa," Jamal said finally, "will you teach me the knuckleball this summer?"

His grandfather was quiet for a long moment. Then he smiled, a real smile, the kind that crinkled the corners of his eyes. "Tomorrow," he said. "We start tomorrow."

That night Jamal lay awake, holding the glove. He understood now that the games of catch had never really been about baseball. They had been his grandfather's way of saying, again and again, without ever using the words, that he loved him. And Jamal decided that he would catch every throw that was left, and remember every one.`,
    questions: [
      { teks: '5.8A', difficulty: 'hard',
        stem: 'Which statement best expresses a theme of the story?',
        explanation: 'As his grandfather grows older, Jamal learns to treasure their time. A theme is that time with the people we love is precious.',
        choices: [
          ['A', 'Baseball is a fun summer game.', false, 'A topic, not a theme.', 'theme_picked_topic'],
          ['B', 'Time with the people we love is precious, especially as they age.', true, null, null],
          ['C', 'Jamal played catch in the backyard.', false, 'A single event.', 'theme_picked_event'],
          ['D', 'Grandfathers can throw knuckleballs.', false, 'A topic, not the message.', 'theme_picked_topic'],
        ] },
      { teks: '5.10D', difficulty: 'hard',
        stem: 'The author calls the rhythm of catch "steady as a heartbeat." This comparison suggests the games were—',
        explanation: 'A heartbeat is constant and life-giving, so the games were a natural, comforting part of their lives together.',
        choices: [
          ['A', 'loud and exciting like a drum.', false, 'Misreads the calm image.', 'imagery_literal_detail'],
          ['B', 'a natural, comforting part of their lives together.', true, null, null],
          ['C', 'about checking each other’s pulses.', false, 'Takes the comparison literally.', 'figurative_language_literal_interpretation'],
          ['D', 'dangerous to their health.', false, 'Not what the image suggests.', 'inference_unsupported'],
        ] },
      { teks: '5.6F', difficulty: 'hard',
        stem: 'Why does the grandfather say only "Just catching my breath" instead of admitting he is unwell?',
        explanation: 'He brushes it off because he does not want Jamal to worry about him.',
        choices: [
          ['A', 'He truly feels perfectly fine.', false, 'Contradicts the clues that he is unwell.', 'inference_literal_only'],
          ['B', 'He does not want Jamal to worry about him.', true, null, null],
          ['C', 'He has forgotten how to play catch.', false, 'Not supported by the text.', 'inference_unsupported'],
          ['D', 'He is angry about getting older.', false, 'A feeling the text does not show.', 'feelings_mismatch_evidence'],
        ] },
      { teks: '5.2B', difficulty: 'hard',
        stem: 'In "a smile that crinkled the corners of his eyes," the word "crinkled" most nearly means—',
        explanation: 'Crinkled means formed small folds or wrinkles, the way a warm smile creases the skin near the eyes.',
        choices: [
          ['A', 'formed small folds or wrinkles.', true, null, null],
          ['B', 'sent tears running down.', false, 'Unrelated to the word.', 'vocab_unrelated'],
          ['C', 'smoothed completely flat.', false, 'The opposite of the meaning.', 'vocab_antonym'],
          ['D', 'closed all the way shut.', false, 'A sense that does not fit.', 'vocab_wrong_sense_of_polysemous_word'],
        ] },
      { teks: '5.8B', difficulty: 'hard',
        stem: 'What does Jamal’s decision at the end reveal about how he has changed?',
        explanation: 'Jamal now understands what the games meant and chooses to treasure the time he still has with his grandfather.',
        choices: [
          ['A', 'He has decided to give up baseball for good.', false, 'Contradicts wanting to keep playing.', 'character_relationship_misread'],
          ['B', 'He understands what the games meant and will treasure the time left.', true, null, null],
          ['C', 'He is angry at his grandfather for getting old.', false, 'A feeling the text does not show.', 'feelings_mismatch_evidence'],
          ['D', 'He no longer wants to spend time with his grandfather.', false, 'The opposite of the ending.', 'inference_unsupported'],
        ] },
    ],
  },
]

await runSeed(PASSAGES, { sourceNote: 'Khan Academy: Grade 5 reading comprehension' })
