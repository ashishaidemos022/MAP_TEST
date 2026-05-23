// scripts/seed-g5-reading-batch02.mjs
// Grade 5 READING vetted-bank seed — batch 02. 10 passages + 48 questions.
// Uses the shared harness in ./lib/seed-reading-batch.mjs (see batch 01 for the
// full rationale). Targets gaps batch 01 left: 5.2A (dictionary/glossary),
// 5.9D.ii (text features + a real graphic), and 5.7G (important ideas).
//
// Usage:
//   node --env-file=.env.local scripts/seed-g5-reading-batch02.mjs --dry-run
//   node --env-file=.env.local scripts/seed-g5-reading-batch02.mjs

import { runSeed } from './lib/seed-reading-batch.mjs'

// Inline SVG for the 5.9D.ii graphic question (neutral colors for light/dark).
const SPEED_CHART = `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bar chart of top speeds in miles per hour: Cheetah 70, Pronghorn 55, Lion 50, Greyhound 45">
<text x="160" y="16" text-anchor="middle" font-size="12" fill="#888">Top Speed (mph)</text>
<line x1="30" y1="170" x2="300" y2="170" stroke="#888" stroke-width="1"/>
<rect x="45" y="50" width="40" height="120" fill="#5b8def"/>
<rect x="115" y="76" width="40" height="94" fill="#5b8def"/>
<rect x="185" y="84" width="40" height="86" fill="#5b8def"/>
<rect x="255" y="93" width="40" height="77" fill="#5b8def"/>
<text x="65" y="46" text-anchor="middle" font-size="10" fill="#888">70</text>
<text x="135" y="72" text-anchor="middle" font-size="10" fill="#888">55</text>
<text x="205" y="80" text-anchor="middle" font-size="10" fill="#888">50</text>
<text x="275" y="89" text-anchor="middle" font-size="10" fill="#888">45</text>
<text x="65" y="184" text-anchor="middle" font-size="9" fill="#888">Cheetah</text>
<text x="135" y="184" text-anchor="middle" font-size="9" fill="#888">Pronghorn</text>
<text x="205" y="184" text-anchor="middle" font-size="9" fill="#888">Lion</text>
<text x="275" y="184" text-anchor="middle" font-size="9" fill="#888">Greyhound</text>
</svg>`

const PASSAGES = [
  // 1 ────────────────────────────────────────────────────────────────────
  {
    title: "Priya's First Solo",
    genre: 'literary', band: '201_210', lexile: 790,
    topic: 'Literary: courage and stage fright at a school concert',
    body: `Priya had practiced the same eight measures of her flute solo two hundred times, maybe more. In her bedroom, with the door shut, the notes came out smooth and silver. But tonight she would play them in front of the whole school, and her fingers had turned to ice.

Backstage, she peeked through the curtain. The auditorium was a dark sea of faces. Somewhere out there sat her family, her teacher, and the kids who would still be in her class tomorrow morning.

"You look like you're about to be sick," whispered Ethan, who played the drums after her.

"I think I forgot how to breathe," Priya said.

Ethan grinned. "Then don't think about the whole song. Think about the first note. Just the first one. You can do one note, right?"

Priya almost laughed. One note. She could do one note.

When the announcer called her name, her legs carried her to the center of the stage on their own. The lights were so bright she could no longer see the sea of faces, only a warm white glow. She lifted the flute, found the first note, and let it go.

It floated out clear and true. And because the first note was perfect, the second one followed, and then the third, until the eight measures she had practiced two hundred times poured out of her like water finding a familiar path downhill. She was not thinking about the audience anymore. She was only thinking about the music.

When the last note faded, there was a half-second of silence, and then the auditorium broke into applause. Priya lowered her flute, her heart still pounding, and realized she was smiling. The hardest part, she understood now, had never been the eight measures. It had been the single breath it took to begin.`,
    questions: [
      { teks: '5.8B', difficulty: 'medium',
        stem: "What does Ethan's advice to Priya show about him?",
        explanation: 'Ethan notices Priya is terrified and gives her a simple way to calm down, focusing on just the first note. His advice shows he is kind and helpful.',
        choices: [
          ['A', 'He wanted to play his drum solo before hers.', false, 'Reads his help as self-interest.', 'character_relationship_misread'],
          ['B', 'He noticed she was scared and gave her a way to calm down.', true, null, null],
          ['C', 'He thought her solo was too long to play.', false, 'Adds an idea the text does not support.', 'inference_unsupported'],
          ['D', 'He was annoyed that she forgot the song.', false, 'Names a feeling the evidence does not show.', 'feelings_mismatch_evidence'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'Why does the author say Priya\'s fingers "had turned to ice"?',
        explanation: 'Her fingers were not really frozen. The phrase shows she was so nervous her hands felt stiff and cold.',
        choices: [
          ['A', 'The auditorium was very cold that night.', false, 'Takes the figurative phrase literally.', 'inference_literal_only'],
          ['B', 'She was so nervous her fingers felt stiff and frozen.', true, null, null],
          ['C', 'She had been holding ice cubes backstage.', false, 'Invents a detail not in the text.', 'inference_unsupported'],
          ['D', 'She had stopped practicing the flute.', false, 'Contradicts her many hours of practice.', 'inference_unsupported'],
        ] },
      { teks: '5.2B', difficulty: 'medium',
        stem: 'In "the eight measures poured out of her," the word "poured" most nearly means—',
        explanation: 'Music did not really pour like a liquid. Here "poured" means the notes came out smoothly and easily.',
        choices: [
          ['A', 'spilled by accident.', false, 'Uses a different sense of "pour" that does not fit.', 'vocab_wrong_sense_of_polysemous_word'],
          ['B', 'came out smoothly and easily.', true, null, null],
          ['C', 'stopped all at once.', false, 'Chooses the opposite of flowing.', 'vocab_antonym'],
          ['D', 'were measured carefully.', false, 'Picks an unrelated meaning.', 'vocab_unrelated'],
        ] },
      { teks: '5.8A', difficulty: 'hard',
        stem: 'Which sentence best states a theme of the story?',
        explanation: 'Priya learns the hardest part was finding the courage to begin. A theme is that starting often takes more courage than the task itself.',
        choices: [
          ['A', 'Flute solos are very difficult to play.', false, 'States a topic, not a theme.', 'theme_picked_topic'],
          ['B', 'The hardest part of a challenge is often the courage to start.', true, null, null],
          ['C', 'Priya practiced her solo two hundred times.', false, 'Names a detail, not a theme.', 'theme_picked_event'],
          ['D', 'School concerts make students nervous.', false, 'A topic, not the story’s message.', 'theme_picked_topic'],
        ] },
      { teks: '5.6F', difficulty: 'hard',
        stem: 'At the end, Priya realizes the hardest part "had never been the eight measures." This means she learned that—',
        explanation: 'Once she began, the playing was the easy part; beginning took the most courage.',
        choices: [
          ['A', 'the music had been easy the whole time.', false, 'Overstates the point; the playing still took skill.', 'inference_overgeneralized'],
          ['B', 'beginning took more courage than playing the notes.', true, null, null],
          ['C', 'she should have practiced even more.', false, 'Contradicts how well she played.', 'inference_unsupported'],
          ['D', 'the audience did not enjoy her solo.', false, 'Contradicts the applause and her smile.', 'feelings_mismatch_evidence'],
        ] },
    ],
  },

  // 2 ────────────────────────────────────────────────────────────────────
  {
    title: "The Map Liam Didn't Trust",
    genre: 'literary', band: '211_220', lexile: 860,
    topic: 'Literary: trusting the knowledge of those who came before',
    body: `The trail map said the lake was two miles north, but Liam was sure the map was wrong.

He and his grandmother had been hiking since morning, and the path they were on curved east, away from where Liam thought the lake should be. "We're going the wrong way," he said, tapping the folded paper. "The lake has to be back that way."

His grandmother, who had hiked these mountains for thirty years, only smiled. "The map knows the mountain better than we do," she said. "Trails curve for a reason. Trust it a little longer."

Liam frowned. The forest was thick, and the afternoon sun threw confusing shadows that made every direction look the same. His own sense of north felt as solid as stone. The map felt like a guess made by a stranger.

For another mile the trail kept bending the wrong way, and with every step Liam grew more certain they were lost. He imagined them wandering until dark, and his stomach tightened like a fist.

Then the trees opened.

Spread out before them, calm and enormous, was the lake, exactly where the map had promised it would be. The trail had curved east to go around a steep ridge that Liam never could have climbed. If they had gone the way his gut insisted, they would have walked straight into a wall of rock.

Liam stared at the water, then at the map in his hand, then at his grandmother.

"How did you know?" he asked.

"I didn't," she said, sitting down on a flat rock with a tired, happy sigh. "But the people who made that map walked this mountain a thousand times so that we would only have to walk it once. The hardest thing on a trail isn't the climbing. It's trusting that someone who came before you knew the way."`,
    questions: [
      { teks: '5.8C', difficulty: 'medium',
        stem: 'Which event is the turning point of the story?',
        explanation: 'The story turns when the trees open and the lake appears exactly where the map promised, proving the map right and Liam wrong.',
        choices: [
          ['A', 'Liam and his grandmother start hiking in the morning.', false, 'This is the setup, not the turning point.', 'plot_picked_detail'],
          ['B', 'The trees open and the lake appears where the map promised.', true, null, null],
          ['C', 'Liam taps the map and complains they are lost.', false, 'Part of the rising action, not the turn.', 'plot_event_confusion'],
          ['D', 'His grandmother sits down on a flat rock.', false, 'A small detail near the end.', 'plot_picked_detail'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'Why did the trail curve east instead of going straight to the lake?',
        explanation: 'The text explains the trail bent east to go around a steep ridge Liam could not have climbed.',
        choices: [
          ['A', 'The map had been printed incorrectly.', false, 'Contradicts the ending, where the map is right.', 'inference_unsupported'],
          ['B', 'The trail went around a steep ridge Liam could not climb.', true, null, null],
          ['C', 'His grandmother chose a longer path to tire him out.', false, 'Adds a motive the text does not give.', 'inference_unsupported'],
          ['D', 'The lake had moved to a new location.', false, 'An impossible, literal misreading.', 'inference_literal_only'],
        ] },
      { teks: '5.10D', difficulty: 'hard',
        stem: 'The author writes that Liam\'s "stomach tightened like a fist." This comparison shows that Liam felt—',
        explanation: 'The image of a clenched fist shows worry and fear that they were lost.',
        choices: [
          ['A', 'hungry for his lunch.', false, 'Notices only a literal stomach feeling.', 'imagery_literal_detail'],
          ['B', 'worried and afraid they were lost.', true, null, null],
          ['C', 'angry at his grandmother.', false, 'Names a feeling the image does not show.', 'feelings_mismatch_evidence'],
          ['D', 'a real stomachache from hiking.', false, 'Reads the comparison literally.', 'figurative_taken_literally'],
        ] },
      { teks: '5.8A', difficulty: 'hard',
        stem: 'What is the main lesson Liam learns?',
        explanation: 'Liam learns to trust the knowledge of those who came before, like the mapmakers who walked the mountain many times.',
        choices: [
          ['A', 'Maps are always right and people are always wrong.', false, 'Overstates the lesson.', 'theme_picked_topic'],
          ['B', 'Sometimes you must trust the knowledge of those who came before.', true, null, null],
          ['C', 'Hiking in the mountains can be tiring.', false, 'A topic, not the lesson.', 'theme_picked_topic'],
          ['D', 'You should never hike without a grandmother.', false, 'Picks a single detail as the lesson.', 'theme_picked_event'],
        ] },
      { teks: '5.7G', difficulty: 'hard',
        stem: 'Which idea is most important to the meaning of the story?',
        explanation: "The meaning depends on the fact that Liam's confident sense of direction was wrong while the map he doubted was right.",
        choices: [
          ['A', 'The forest was thick and full of shadows.', false, 'A setting detail, not the central idea.', 'plot_picked_detail'],
          ['B', 'Liam was sure of his direction, but the doubted map was right.', true, null, null],
          ['C', 'The lake was calm and enormous.', false, 'A descriptive detail.', 'main_idea_picked_detail'],
          ['D', 'The hike began early in the morning.', false, 'A minor setup detail.', 'plot_picked_detail'],
        ] },
    ],
  },

  // 3 ────────────────────────────────────────────────────────────────────
  {
    title: 'Aarav and the Broken Clock',
    genre: 'literary', band: '221_230', lexile: 900,
    topic: 'Literary: patience, memory, and keeping a loved one close',
    body: `The grandfather clock in the hallway had not ticked in years. To everyone else it was just tall, dark furniture, a place to drop the mail. But to Aarav it was a mystery, and this summer he had decided to solve it.

His grandfather had built the clock by hand, long before Aarav was born. When his grandfather passed away, the clock had stopped, as if it had been keeping time only for him. Aarav's mother said it would cost too much to repair and that some things were simply meant to be remembered, not fixed.

Aarav was not so sure.

He found his grandfather's old toolbox in the garage and a notebook full of careful drawings. Each evening, while the summer light stretched long and gold across the floor, Aarav opened the clock's wooden door and studied the silent gears. He did not understand most of what he saw. Twice he put a piece back in the wrong place and had to start over. His fingers slowly learned the weight of tiny screws.

Weeks passed. He oiled a stiff wheel, straightened a bent pin, and replaced a snapped spring with one he found in the toolbox, wrapped in paper as if his grandfather had been saving it for exactly this.

On the last evening of August, Aarav fit the final gear into place and held his breath. For a moment, nothing. Then, faint as a heartbeat, the clock began to tick.

His mother came running. She stood in the hallway with her hand pressed to her mouth, listening to a sound she had not heard since her own father was alive.

"I didn't fix it to replace him," Aarav said quietly. "I fixed it so we could still hear him."

His mother pulled him into a hug. Outside, the last gold light slipped away, but inside, the hallway was full of a steady, patient ticking, the sound of a boy who had refused to let something be forgotten.`,
    questions: [
      { teks: '5.8A', difficulty: 'hard',
        stem: 'Which statement best expresses a theme of the story?',
        explanation: 'Aarav patiently brings the clock back to life to keep his grandfather close. A theme is that patience and love can keep a memory alive.',
        choices: [
          ['A', 'Old clocks are expensive to repair.', false, 'States a topic, not a theme.', 'theme_picked_topic'],
          ['B', 'Patience and love can keep a memory alive.', true, null, null],
          ['C', 'A boy fixes a clock over the summer.', false, 'Names the plot, not a theme.', 'theme_picked_event'],
          ['D', 'Grandfathers enjoy building things.', false, 'A topic, not the message.', 'theme_picked_topic'],
        ] },
      { teks: '5.8D', difficulty: 'hard',
        stem: 'Why is it important that the story takes place over a whole summer?',
        explanation: 'The long summer gives Aarav the slow, unhurried time he needs to study the clock and repair it piece by piece.',
        choices: [
          ['A', 'Summer is the hottest season of the year.', false, 'An irrelevant fact about the setting.', 'setting_character_misidentified'],
          ['B', 'It gives Aarav the long, unhurried time the repair needs.', true, null, null],
          ['C', 'The clock only works in warm weather.', false, 'Not supported by the text.', 'inference_unsupported'],
          ['D', 'Aarav had no friends to play with in summer.', false, 'Adds a detail the story never gives.', 'inference_unsupported'],
        ] },
      { teks: '5.2B', difficulty: 'medium',
        stem: 'In "replaced a snapped spring," the word "snapped" most nearly means—',
        explanation: 'A spring cannot speak; here "snapped" means broken in two.',
        choices: [
          ['A', 'spoke sharply and angrily.', false, 'Uses a different sense of "snap."', 'vocab_wrong_sense_of_polysemous_word'],
          ['B', 'broken in two.', true, null, null],
          ['C', 'repaired and made new.', false, 'Chooses the opposite meaning.', 'vocab_antonym'],
          ['D', 'photographed quickly.', false, 'Picks an unrelated meaning.', 'vocab_unrelated'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'What does Aarav mean when he says, "I fixed it so we could still hear him"?',
        explanation: 'The ticking keeps his grandfather present in the house; the sound is a way to remember him.',
        choices: [
          ['A', 'The clock can record his grandfather\'s voice.', false, 'Takes the line literally.', 'inference_literal_only'],
          ['B', 'The ticking keeps his grandfather\'s memory present.', true, null, null],
          ['C', 'His grandfather is hiding inside the clock.', false, 'An impossible literal reading.', 'inference_unsupported'],
          ['D', 'He wants to sell the clock now that it works.', false, 'Contradicts his feeling for it.', 'feelings_mismatch_evidence'],
        ] },
      { teks: '5.7G', difficulty: 'hard',
        stem: 'Which detail is most important to the meaning of the story?',
        explanation: 'That the grandfather built the clock by hand is central: it is why repairing it keeps his memory alive.',
        choices: [
          ['A', 'The clock was used as a place to drop the mail.', false, 'A minor detail.', 'plot_picked_detail'],
          ['B', 'Aarav\'s grandfather had built the clock by hand.', true, null, null],
          ['C', 'The toolbox was kept in the garage.', false, 'A small detail.', 'plot_picked_detail'],
          ['D', 'August was the last month of summer.', false, 'A minor time detail.', 'main_idea_picked_detail'],
        ] },
    ],
  },

  // 4 ────────────────────────────────────────────────────────────────────
  {
    title: 'How Bats See with Sound',
    genre: 'informational', band: '201_210', lexile: 770,
    topic: 'Informational science: bat echolocation (with section headings)',
    body: `On a dark night, a bat can swoop through a forest, dodge every branch, and snatch a moth out of the air, all without seeing a thing. How? Bats hunt with sound.

How Echolocation Works

As a bat flies, it makes high squeaks, far too high for human ears to hear. These sounds travel out, hit objects, and bounce back as echoes. The bat listens to each returning echo and, in an instant, figures out how far away an object is, how big it is, and which way it is moving. Scientists call this amazing skill echolocation, from words meaning "echo" and "location."

The closer an object is, the faster its echo returns. A moth just inches away sends back an echo almost immediately, while a tree across the clearing takes longer. By comparing these tiny differences in time, a bat builds a kind of sound picture of the world around it.

Why It Matters

Echolocation lets bats hunt in total darkness, when many of the insects they eat are active and when few other hunters can compete. A single bat can catch hundreds of insects in one night, which helps keep insect numbers in balance. Farmers, in fact, owe bats a quiet thank-you, because the bats above their fields eat pests that would otherwise damage crops.

The next time you hear that bats are "blind," you can correct it. Bats are not blind at all, and even if they were, they would still find their way through the dark, listening to a world we cannot hear.`,
    questions: [
      { teks: '5.9D.i', difficulty: 'medium',
        stem: 'What is the central idea of the passage?',
        explanation: 'The whole passage explains that bats use echoes from their own sounds to hunt and move in the dark.',
        choices: [
          ['A', 'Bats are blind animals.', false, 'Contradicts the passage and misses the point.', 'main_idea_picked_detail'],
          ['B', 'Bats use echoes from their own sounds to hunt in the dark.', true, null, null],
          ['C', 'Farmers are grateful to bats.', false, 'A supporting detail.', 'main_idea_picked_detail'],
          ['D', 'A bat can catch hundreds of insects in a night.', false, 'A detail, not the central idea.', 'main_idea_picked_detail'],
        ] },
      { teks: '5.9D.ii', difficulty: 'medium',
        stem: 'How do the headings "How Echolocation Works" and "Why It Matters" help the reader?',
        explanation: 'Headings divide the passage into sections and signal what each part is about.',
        choices: [
          ['A', 'They tell the reader who wrote the passage.', false, 'Headings do not name the author.', 'text_features_misread'],
          ['B', 'They show how the passage is divided and what each part covers.', true, null, null],
          ['C', 'They list all the insects that bats eat.', false, 'Headings are not a list of insects.', 'text_features_misread'],
          ['D', 'They make the passage look longer.', false, 'Misunderstands the purpose of headings.', 'text_features_misread'],
        ] },
      { teks: '5.2B', difficulty: 'medium',
        stem: 'Based on the passage, the word "echolocation" means using echoes to—',
        explanation: 'The passage says the word comes from "echo" and "location": bats use echoes to find the location of objects.',
        choices: [
          ['A', 'make loud sounds just for fun.', false, 'Ignores the context clue about the word parts.', 'vocab_skipped_context_clues'],
          ['B', 'find the location of objects.', true, null, null],
          ['C', 'fly faster than other animals.', false, 'Unrelated to the meaning.', 'vocab_unrelated'],
          ['D', 'see colors in the dark.', false, 'Unrelated to the word.', 'vocab_unrelated'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'Why might a farmer be glad to have bats living nearby?',
        explanation: 'The passage says bats eat pests that would otherwise damage crops, which helps farmers.',
        choices: [
          ['A', 'Bats make the farm look more interesting.', false, 'Not supported by the text.', 'inference_unsupported'],
          ['B', 'Bats eat insect pests that would damage crops.', true, null, null],
          ['C', 'Bats can be trained to guard the fields.', false, 'Stretches beyond the passage.', 'inference_overgeneralized'],
          ['D', 'Bats keep other animals awake at night.', false, 'An idea the text does not give.', 'inference_unsupported'],
        ] },
      { teks: '5.7D', difficulty: 'hard',
        stem: 'Which sentence is the BEST summary of the passage?',
        explanation: 'A good summary captures the main point: bats use echolocation to hunt and move in the dark by listening to echoes.',
        choices: [
          ['A', 'Bats make squeaks too high for people to hear.', false, 'A single detail, not a summary.', 'summary_included_minor_detail'],
          ['B', 'Bats use echolocation to hunt and move in the dark by hearing echoes.', true, null, null],
          ['C', 'On a dark night, a bat can swoop through a forest.', false, 'Echoes the opening instead of summarizing.', 'summary_copied_first_sentence'],
          ['D', 'Farmers owe bats a quiet thank-you.', false, 'A minor detail, not the whole passage.', 'summary_included_minor_detail'],
        ] },
    ],
  },

  // 5 ────────────────────────────────────────────────────────────────────
  {
    title: 'Faster Than You Think',
    genre: 'informational', band: '211_220', lexile: 850,
    topic: 'Informational science: speed in the animal world (with a bar chart)',
    body: `Imagine lining up the fastest runners on land for a race. A human sprinter, even a world champion, would finish far behind. The animal world is built for speed in ways our bodies are not.

The cheetah is the champion sprinter. Over a short distance, it can reach about seventy miles per hour, faster than cars on a highway. But the cheetah pays a price for its speed: it can hold that pace for only twenty or thirty seconds before it must stop and rest.

The pronghorn, a deer-like animal of North America, runs a different kind of race. It is a little slower than the cheetah at top speed, but it can keep running fast for miles without tiring. If the cheetah is a sprinter, the pronghorn is a marathon runner.

Other animals are quick too. The lion, despite its size, can burst forward in a hunt, and the greyhound, a dog bred for racing, is one of the fastest animals people keep as pets. For a short stretch, a greyhound can nearly keep pace with a galloping horse.

What makes these animals so fast? Long, slim legs act like springs. Flexible spines stretch and snap forward with each stride, adding length to every step. And lightweight bodies mean there is less weight to push through the air.

Speed, in the animal world, is rarely about showing off. It is about survival, catching the next meal, or avoiding becoming someone else's meal if you are too slow.`,
    questions: [
      { teks: '5.9D.ii', difficulty: 'medium', svg: SPEED_CHART,
        stem: 'According to the bar chart, which animal has the second-highest top speed?',
        explanation: 'The chart shows Cheetah 70, Pronghorn 55, Lion 50, Greyhound 45. The second-tallest bar is the pronghorn.',
        choices: [
          ['A', 'Cheetah', false, 'The cheetah is the highest, not the second-highest.', 'text_features_misread'],
          ['B', 'Pronghorn', true, null, null],
          ['C', 'Lion', false, 'The lion is third on the chart.', 'text_features_misread'],
          ['D', 'Greyhound', false, 'The greyhound is the lowest bar.', 'text_features_misread'],
        ] },
      { teks: '5.9D.i', difficulty: 'medium',
        stem: 'What is the central idea of the passage?',
        explanation: 'The passage explains that many animals are built for speed, which helps them survive.',
        choices: [
          ['A', 'A cheetah can run for only thirty seconds.', false, 'A detail, not the central idea.', 'main_idea_picked_detail'],
          ['B', 'Many animals are built for speed, which helps them survive.', true, null, null],
          ['C', 'Greyhounds are kept as pets.', false, 'A detail, not the main point.', 'main_idea_picked_detail'],
          ['D', 'Humans are slow runners.', false, 'A small comparison, not the central idea.', 'main_idea_picked_detail'],
        ] },
      { teks: '5.9D.iii', difficulty: 'hard',
        stem: 'How does the author mainly organize the information about the cheetah and the pronghorn?',
        explanation: 'The author compares and contrasts two kinds of speed: the cheetah’s short burst and the pronghorn’s long-distance run.',
        choices: [
          ['A', 'by telling the story of one race in time order', false, 'No single race is narrated.', 'text_structure_picked_first_one_recognized'],
          ['B', 'by comparing and contrasting their kinds of speed', true, null, null],
          ['C', 'by listing steps to train an animal to run', false, 'No how-to steps appear.', 'text_structure_picked_content'],
          ['D', 'by describing a problem and its solution', false, 'Not a problem-solution text.', 'text_structure_picked_content'],
        ] },
      { teks: '5.6F', difficulty: 'hard',
        stem: 'Why can the pronghorn be called a "marathon runner" compared to the cheetah?',
        explanation: 'A marathon is a long race; the pronghorn can keep running fast for miles without tiring.',
        choices: [
          ['A', 'It is the fastest animal on land.', false, 'Contradicts the text; the cheetah is faster.', 'text_evidence_misread'],
          ['B', 'It can keep running fast for miles without tiring.', true, null, null],
          ['C', 'It runs only in North America.', false, 'Where it lives is not why it is a "marathon runner."', 'inference_unsupported'],
          ['D', 'It is larger than a lion.', false, 'Size is not the point of the comparison.', 'inference_unsupported'],
        ] },
      { teks: '5.10D', difficulty: 'hard',
        stem: 'What does the author mean that the cheetah "pays a price for its speed"?',
        explanation: 'The cheetah does not pay money; the "price" is a cost, that it tires after only twenty or thirty seconds.',
        choices: [
          ['A', 'The cheetah must buy food in order to run.', false, 'Reads the phrase literally.', 'figurative_language_literal_interpretation'],
          ['B', 'Its speed has a cost: it tires very quickly.', true, null, null],
          ['C', 'Speed makes the cheetah expensive to own.', false, 'A literal misreading of "price."', 'figurative_taken_literally'],
          ['D', 'The cheetah loses money when it runs.', false, 'Takes "pays a price" as real money.', 'imagery_literal_detail'],
        ] },
    ],
  },

  // 6 ────────────────────────────────────────────────────────────────────
  {
    title: "The Bug That Wasn't a Bug",
    genre: 'informational', band: '221_230', lexile: 880,
    topic: 'Informational biography: Grace Hopper and early computing',
    body: `In 1947, a team of scientists in the United States was trying to figure out why their enormous computer had stopped working. The machine filled an entire room and was one of the most advanced in the world, yet something had gone wrong. One of the scientists, a mathematician named Grace Hopper, opened a panel to look inside.

There, trapped in the machinery, was a moth.

The insect had flown into the computer and jammed its parts. Hopper carefully removed the moth and taped it into the team's logbook with a note: "First actual case of bug being found." People had used the word "bug" to mean a small fault in a machine for years, but Hopper's moth made the joke real. Ever since, fixing an error in a computer program has been called "debugging."

Grace Hopper was famous for far more than a moth, however. In her time, telling a computer what to do meant writing in long strings of numbers that only a few experts could understand. Hopper believed there had to be a better way. She helped invent a method of writing instructions using ordinary words, closer to English than to math. Many people told her it could not be done. She did it anyway.

Because of her work, computers became tools that millions of people could learn to use, not just a handful of specialists. She kept working into her seventies, encouraging young people to question old habits. "The most dangerous phrase in our language," she liked to say, "is 'we've always done it this way.'"

When Grace Hopper died, she was honored as one of the most important figures in the history of computing. The next time a program crashes and someone says they need to "debug" it, remember the mathematician who looked inside a giant machine, found a moth, and never stopped believing things could be made simpler.`,
    questions: [
      { teks: '5.6G', difficulty: 'medium',
        stem: 'What is the central message of this biography?',
        explanation: "The passage shows that Grace Hopper's curiosity and refusal to accept old habits changed computing.",
        choices: [
          ['A', 'Computers in 1947 were very large.', false, 'A detail, not the message.', 'main_idea_picked_detail'],
          ['B', "Grace Hopper's curiosity and new ideas changed computing.", true, null, null],
          ['C', 'A moth once flew into a computer.', false, 'A single event, not the message.', 'main_idea_picked_detail'],
          ['D', 'Writing instructions in numbers is difficult.', false, 'A detail along the way.', 'main_idea_picked_detail'],
        ] },
      { teks: '5.7C', difficulty: 'medium',
        stem: 'Which detail best supports the idea that Hopper challenged old ways of thinking?',
        explanation: 'Her saying that "we\'ve always done it this way" is the most dangerous phrase directly shows she challenged old habits.',
        choices: [
          ['A', '"The machine filled an entire room."', false, 'Describes the computer, not her thinking.', 'evidence_wrong_detail'],
          ['B', '"The most dangerous phrase... is we\'ve always done it this way."', true, null, null],
          ['C', '"She carefully removed the moth."', false, 'Shows the bug story, not her ideas.', 'text_evidence_misread'],
          ['D', '"computers became tools that millions could use"', false, 'An effect of her work, not the trait itself.', 'evidence_wrong_paragraph'],
        ] },
      { teks: '5.2C', difficulty: 'hard',
        stem: 'The word "debugging" is "bug" plus "de-," meaning "remove." So "debugging" a program means—',
        explanation: 'With "de-" meaning remove, debugging means removing the errors ("bugs") from a program.',
        choices: [
          ['A', 'adding more bugs to a program.', false, 'The prefix means remove, not add.', 'affix_meaning_confusion'],
          ['B', 'removing errors from a program.', true, null, null],
          ['C', 'building a brand-new program from scratch.', false, 'Unrelated to the word parts.', 'affix_meaning_confusion'],
          ['D', 'turning a program off.', false, 'Not what the parts mean.', 'inference_unsupported'],
        ] },
      { teks: '5.10A', difficulty: 'hard',
        stem: 'Why does the author end by mentioning what happens when a program crashes today?',
        explanation: "The ending connects Hopper's story to something readers still experience, making her work feel relevant now.",
        choices: [
          ['A', 'to explain how to repair a broken computer', false, 'Names a topic, not the purpose.', 'purpose_confused_topic_with_purpose'],
          ['B', "to connect Hopper's story to something readers still experience", true, null, null],
          ['C', 'to warn readers that computers are dangerous', false, 'Overstates the author’s aim.', 'purpose_picked_topic_overgeneralization'],
          ['D', 'to tell an exciting made-up story', false, 'Names the wrong kind of writing.', 'purpose_picked_genre_mismatch'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'What can the reader conclude from the fact that Hopper kept working into her seventies and encouraged young people?',
        explanation: 'Working late in life and mentoring others shows she stayed curious and wanted to pass on her ideas.',
        choices: [
          ['A', 'She was too tired to retire.', false, 'Not supported by the text.', 'inference_unsupported'],
          ['B', 'She stayed curious and wanted to pass her ideas on.', true, null, null],
          ['C', 'She did not trust younger scientists.', false, 'Contradicts that she encouraged them.', 'inference_unsupported'],
          ['D', 'She had run out of new ideas.', false, 'Contradicts her continued work.', 'feelings_mismatch_evidence'],
        ] },
    ],
  },

  // 7 ────────────────────────────────────────────────────────────────────
  {
    title: 'Where Your Trash Really Goes',
    genre: 'informational', band: '191_200', lexile: 740,
    topic: 'Informational: landfills, recycling, and composting',
    body: `When you toss a banana peel or an empty bottle into the trash, it does not simply disappear. Everything we throw away has to go somewhere, and where it goes makes a real difference to the planet.

Most trash travels to a landfill, a huge area where waste is buried under layers of soil. Landfills are carefully built to hold garbage safely, but they fill up over time, and the things inside them can take a very long time to break down. A glass bottle, for example, may sit in a landfill for thousands of years.

Some waste takes a better path. Paper, certain plastics, and metal cans can be recycled, which means they are collected, cleaned, and made into brand-new products. A recycled aluminum can might become another can in just a few weeks. Recycling also saves energy, because making something from old materials usually takes less power than making it from scratch.

Food scraps and yard clippings have a third option: composting. When these materials are piled together and allowed to decompose, tiny living things break them down into rich, dark soil that gardeners prize. Composting is something even kids can do at home with a simple bin in the backyard.

The choices we make matter. Every item we recycle or compost is one less item buried in a landfill. By sorting our trash with care, we turn what looks like garbage into something useful, and we leave a little more room on the planet for everything else.`,
    questions: [
      { teks: '5.9D.i', difficulty: 'medium',
        stem: 'What is the central idea of the passage?',
        explanation: 'The passage explains that where our trash goes matters, and that recycling and composting are better than landfills.',
        choices: [
          ['A', 'Glass bottles last a very long time.', false, 'A detail, not the central idea.', 'main_idea_picked_detail'],
          ['B', 'Where trash goes matters; recycling and composting beat landfills.', true, null, null],
          ['C', 'Aluminum cans can be recycled quickly.', false, 'A supporting detail.', 'main_idea_picked_detail'],
          ['D', 'Trash is buried under soil in landfills.', false, 'One detail about landfills.', 'main_idea_picked_detail'],
        ] },
      { teks: '5.2A', difficulty: 'medium',
        stem: 'A glossary defines "decompose" as "to break down slowly into smaller parts." Based on this, when food scraps decompose, they—',
        explanation: 'Using the glossary meaning, decomposing food scraps break down into smaller parts, which become rich soil.',
        choices: [
          ['A', 'freeze into solid blocks.', false, 'Unrelated to the glossary meaning.', 'vocab_unrelated'],
          ['B', 'break down into rich soil.', true, null, null],
          ['C', 'grow into new plants right away.', false, 'Ignores the glossary definition.', 'vocab_skipped_context_clues'],
          ['D', 'stay exactly the same.', false, 'The opposite of breaking down.', 'vocab_antonym'],
        ] },
      { teks: '5.7D', difficulty: 'hard',
        stem: 'Which sentence is the BEST summary of the passage?',
        explanation: 'The summary should capture the whole passage: trash goes to landfills, but recycling and composting reuse waste and save space.',
        choices: [
          ['A', 'A banana peel does not disappear when you throw it away.', false, 'Echoes the opening idea, not a summary.', 'summary_copied_first_sentence'],
          ['B', 'Trash goes to landfills, but recycling and composting reuse waste.', true, null, null],
          ['C', 'A recycled aluminum can might become another can.', false, 'A small detail, not a summary.', 'summary_included_minor_detail'],
          ['D', 'Gardeners prize rich, dark soil.', false, 'A minor detail.', 'summary_included_minor_detail'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'Based on the passage, why is recycling a bottle better than throwing it in the trash?',
        explanation: 'A recycled bottle becomes a new product instead of sitting in a landfill for a very long time.',
        choices: [
          ['A', 'Recycled bottles are prettier than new ones.', false, 'Not supported by the text.', 'inference_unsupported'],
          ['B', 'A recycled bottle becomes a new product instead of waste.', true, null, null],
          ['C', 'Recycling bottles is required by law everywhere.', false, 'Overstates a claim the text never makes.', 'inference_overgeneralized'],
          ['D', 'Bottles cannot be buried in landfills.', false, 'Contradicts the passage.', 'text_evidence_misread'],
        ] },
      { teks: '5.9D.iii', difficulty: 'hard',
        stem: 'How does the author organize the three ways trash can be handled?',
        explanation: 'The author describes three different options: landfills, recycling, and composting.',
        choices: [
          ['A', 'as a story told in time order', false, 'Not a time-order narrative.', 'text_structure_picked_first_one_recognized'],
          ['B', 'by describing different options: landfills, recycling, composting', true, null, null],
          ['C', 'by comparing two countries', false, 'No countries are compared.', 'text_structure_picked_content'],
          ['D', 'by giving steps to build a landfill', false, 'No building steps appear.', 'text_structure_picked_content'],
        ] },
    ],
  },

  // 8 ────────────────────────────────────────────────────────────────────
  {
    title: 'The Old Oak Speaks',
    genre: 'poetry', band: '211_220', lexile: 720,
    topic: 'Poetry: an old oak tree as a keeper of time and memory',
    body: `I have stood here longer than the road,
longer than the gray stone wall,
longer than the farmhouse light
that blinks awake when shadows fall.

In spring I wear a thousand hands
of green that clap in every breeze.
In fall I let them go like coins
and stand, a king of empty trees.

Children carved their names in me
and grew, and brought their children too.
I keep each name beneath my bark.
I keep, in rings, each year I grew.

So pass me slowly if you can.
I am no idle, silent thing.
I am a clock the seasons wind,
a patient, rooted, living spring.`,
    questions: [
      { teks: '5.9B', difficulty: 'medium',
        stem: 'The poem is written as if the oak tree can speak. This makes the tree seem—',
        explanation: 'Giving the tree a voice (personification) makes it seem wise and full of memory.',
        choices: [
          ['A', 'frightening and dangerous.', false, 'Not supported by the poem.', 'inference_unsupported'],
          ['B', 'wise and full of memory.', true, null, null],
          ['C', 'young and brand new.', false, 'Contradicts a tree that has stood for ages.', 'theme_picked_topic'],
          ['D', 'angry at the children.', false, 'A feeling the poem does not show.', 'feelings_mismatch_evidence'],
        ] },
      { teks: '5.10D', difficulty: 'hard',
        stem: 'The lines "I wear a thousand hands / of green that clap in every breeze" help the reader picture—',
        explanation: 'The "hands of green" that "clap" are leaves that flutter and rustle in the wind.',
        choices: [
          ['A', 'real human hands growing on the tree.', false, 'Reads the image literally.', 'figurative_language_literal_interpretation'],
          ['B', 'leaves that flutter and rustle in the wind.', true, null, null],
          ['C', 'people clapping next to the tree.', false, 'A literal misreading of "clap."', 'figurative_taken_literally'],
          ['D', 'the tree losing its leaves in winter.', false, 'Contradicts the spring image.', 'imagery_literal_detail'],
        ] },
      { teks: '5.8A', difficulty: 'hard',
        stem: 'What is the main message of the poem?',
        explanation: 'The oak holds names and growth rings; the message is that a long life holds and remembers the passing of time.',
        choices: [
          ['A', 'Oak trees grow very tall.', false, 'A topic, not the message.', 'theme_picked_topic'],
          ['B', 'A long life holds and remembers the passing of time.', true, null, null],
          ['C', 'Children should not carve names in trees.', false, 'A side detail, not the message.', 'theme_picked_event'],
          ['D', 'Autumn is the prettiest season.', false, 'A topic the poem does not argue.', 'theme_picked_topic'],
        ] },
      { teks: '5.9B', difficulty: 'medium',
        stem: 'What does the poet mean by calling the oak "a clock the seasons wind"?',
        explanation: 'The tree is compared to a clock because it marks the passing of time, season after season.',
        choices: [
          ['A', 'The oak has a real clock hidden inside it.', false, 'Reads the comparison literally.', 'figurative_language_literal_interpretation'],
          ['B', 'The tree marks the passing of time, season after season.', true, null, null],
          ['C', 'The tree makes a loud ticking sound.', false, 'A literal misreading.', 'figurative_taken_literally'],
          ['D', 'Someone winds the tree up each morning.', false, 'Takes "wind" literally.', 'imagery_literal_detail'],
        ] },
    ],
  },

  // 9 ────────────────────────────────────────────────────────────────────
  {
    title: 'The Lost Five Dollars',
    genre: 'drama', band: '201_210', lexile: 740,
    topic: 'Drama: two friends decide what to do with found money',
    body: `SETTING: Outside a school book fair. ZOE and NOOR stand by a table. Zoe is holding a five-dollar bill she just found on the ground.

ZOE: Look what I found! Now I can finally buy that mystery book.

NOOR: Where did you find it?

ZOE: Right here, by the table. Someone must have dropped it.

NOOR: (hesitating) So... it's not really yours, though.

ZOE: Finders keepers. Nobody's looking for it.

NOOR: How do you know? What if it belongs to the kid who was upset a minute ago because he lost his book money?

ZOE: (pausing) ...I didn't see anyone upset.

NOOR: He was over by the door. (gently) Zoe, if you lost five dollars, wouldn't you want someone to give it back?

ZOE: (quietly) Yeah. I guess I would. (She looks at the bill, then at the door.) But I really wanted that book.

NOOR: I know. (She thinks for a second.) Tell you what. Let's give it to the teacher in case someone asks for it. And if no one claims it by the end of the fair, it's yours, fair and square.

ZOE: (slowly smiling) That actually feels better than just keeping it. (They walk toward the teacher's table together.) Come on. Let's go find out who's missing five dollars.

NOOR: And maybe a mystery book will have your name on it after all.`,
    questions: [
      { teks: '5.8B', difficulty: 'easy',
        stem: 'What is the main problem Zoe and Noor talk about?',
        explanation: 'The whole scene is about whether Zoe should keep the money she found or return it.',
        choices: [
          ['A', 'which book Zoe should buy', false, 'A side detail, not the main problem.', 'plot_picked_detail'],
          ['B', 'whether Zoe should keep the found money or return it', true, null, null],
          ['C', 'who is a faster reader of mysteries', false, 'Not what they discuss.', 'character_relationship_misread'],
          ['D', 'whether the book fair is open', false, 'Not the conflict.', 'plot_event_confusion'],
        ] },
      { teks: '5.6F', difficulty: 'medium',
        stem: 'When Zoe says, "But I really wanted that book," the reader can tell that she—',
        explanation: 'Zoe is tempted to keep the money even though she now knows returning it is the right thing.',
        choices: [
          ['A', 'has already forgotten about the money.', false, 'Contradicts that she is still holding it.', 'inference_unsupported'],
          ['B', 'is tempted to keep the money even though returning it is right.', true, null, null],
          ['C', 'is angry at Noor for talking to her.', false, 'A feeling the text does not show.', 'feelings_mismatch_evidence'],
          ['D', 'no longer likes mystery books.', false, 'Contradicts her wanting the book.', 'inference_unsupported'],
        ] },
      { teks: '5.8C', difficulty: 'medium',
        stem: 'How is the problem solved?',
        explanation: 'They agree to give the money to the teacher in case someone claims it, and if no one does, it is Zoe’s.',
        choices: [
          ['A', 'Zoe keeps the money and buys the book.', false, 'Contradicts the ending.', 'plot_event_confusion'],
          ['B', 'They give the money to the teacher in case someone claims it.', true, null, null],
          ['C', 'Noor takes the money for herself.', false, 'Contradicts the scene.', 'plot_event_confusion'],
          ['D', 'They throw the money away.', false, 'An action that never happens.', 'plot_picked_detail'],
        ] },
      { teks: '5.8A', difficulty: 'hard',
        stem: 'What does the scene suggest about doing the right thing?',
        explanation: 'Zoe feels better after choosing the fair option, suggesting that doing what is fair can feel better than getting what you want.',
        choices: [
          ['A', 'The right choice is always the easiest one.', false, 'Contradicts how hard the choice was.', 'theme_picked_topic'],
          ['B', 'Doing what is fair can feel better than getting what you want.', true, null, null],
          ['C', 'You should never pick up money you find.', false, 'Overstates a rule the scene does not give.', 'theme_picked_topic'],
          ['D', 'Friends should not give each other advice.', false, 'The opposite of what the scene shows.', 'theme_picked_event'],
        ] },
    ],
  },

  // 10 ───────────────────────────────────────────────────────────────────
  {
    title: 'The Night the Lights Went Out',
    genre: 'literary', band: '231_240', lexile: 940,
    topic: 'Literary: noticing what matters when everyday comforts are gone',
    body: `The storm took the power at exactly 7:14, and for a moment the whole neighborhood held its breath.

Sofia had been in the middle of a video, and now her screen was dark and her room was darker. She felt the first flicker of panic, the kind that comes when the comfortable hum of a house suddenly stops. Down the hall, her little brother began to cry.

Her mother lit a single candle and set it in the center of the kitchen table, and slowly the family gathered around it like moths drawn to the only light left in the world. Outside, the rain hammered the windows. Inside, the candle threw soft, dancing shadows on the walls.

At first Sofia was bored and restless. There was nothing to do, nothing to watch, nowhere to scroll. But as the minutes stretched on, something unexpected happened. Her father began to tell a story about a blackout from his own childhood. Her mother laughed and added a detail he had forgotten. Her little brother, no longer crying, climbed into Sofia's lap to listen.

There was a knock at the door. It was Jamal from next door, holding a flashlight and a board game. "Our power's out too," he said. "Want company?"

For two hours, by candlelight, the families played and talked and laughed, telling stories that the bright, busy days never seemed to leave room for. Sofia noticed things she usually missed: the warmth of her brother against her, the sound of rain instead of a screen, the way a face looks softer in candlelight.

When the lights buzzed back to life at last, everyone cheered, and then, oddly, fell quiet. The harsh brightness made the room feel ordinary again. The candle was blown out. The screens woke up.

But Sofia did not reach for hers right away. She sat for a moment in the new electric light, thinking about how the darkest night in months had somehow turned into one of the brightest. Sometimes, she realized, you have to lose the light you are used to before you can see the people right beside you.`,
    questions: [
      { teks: '5.8A', difficulty: 'hard',
        stem: 'Which statement best expresses a theme of the story?',
        explanation: 'When the power and screens disappear, Sofia notices her family. A theme is that losing everyday comforts can help us see what truly matters.',
        choices: [
          ['A', 'Storms can knock out a neighborhood\'s power.', false, 'A topic, not a theme.', 'theme_picked_topic'],
          ['B', 'Losing everyday comforts can help us notice what matters.', true, null, null],
          ['C', 'Sofia was watching a video when the power went out.', false, 'A single event, not a theme.', 'theme_picked_event'],
          ['D', 'Candles are useful during a storm.', false, 'A topic, not the message.', 'theme_picked_topic'],
        ] },
      { teks: '5.10D', difficulty: 'hard',
        stem: 'The family gathers around the candle "like moths drawn to the only light left in the world." This suggests the family—',
        explanation: 'The comparison shows the family were naturally pulled together toward the one source of light and comfort.',
        choices: [
          ['A', 'were insects flying around the kitchen.', false, 'Reads the comparison literally.', 'figurative_language_literal_interpretation'],
          ['B', 'were naturally pulled together toward light and comfort.', true, null, null],
          ['C', 'were afraid of the candle.', false, 'A feeling the image does not show.', 'feelings_mismatch_evidence'],
          ['D', 'wanted to put the candle out.', false, 'Contradicts gathering around it.', 'imagery_literal_detail'],
        ] },
      { teks: '5.6F', difficulty: 'hard',
        stem: 'Why does the family fall quiet after the lights come back on?',
        explanation: 'The harsh brightness ended the warm, close mood the candlelight had created, so the cheering fades into quiet.',
        choices: [
          ['A', 'They are angry that the power returned.', false, 'A feeling the text does not support.', 'feelings_mismatch_evidence'],
          ['B', 'The bright lights ended the warm, close mood they had shared.', true, null, null],
          ['C', 'They are too tired to speak.', false, 'Not supported by the passage.', 'inference_unsupported'],
          ['D', 'They did not notice the lights come on.', false, 'Contradicts the cheering.', 'inference_unsupported'],
        ] },
      { teks: '5.2B', difficulty: 'hard',
        stem: 'In "The harsh brightness made the room feel ordinary again," the word "harsh" most nearly means—',
        explanation: 'After the soft candlelight, "harsh" means the electric light was too bright and unpleasant.',
        choices: [
          ['A', 'gentle and soft.', false, 'The opposite of the meaning here.', 'vocab_antonym'],
          ['B', 'too bright and unpleasant.', true, null, null],
          ['C', 'colorful and cheerful.', false, 'A sense that does not fit the contrast.', 'vocab_wrong_sense_of_polysemous_word'],
          ['D', 'quiet and calm.', false, 'Unrelated to the meaning of "harsh."', 'vocab_unrelated'],
        ] },
      { teks: '5.8B', difficulty: 'hard',
        stem: 'How does Sofia change from the beginning of the story to the end?',
        explanation: 'Sofia moves from bored and restless to grateful for the people around her.',
        choices: [
          ['A', 'She becomes more afraid of storms.', false, 'Not supported by the ending.', 'character_relationship_misread'],
          ['B', 'She moves from restless and bored to grateful for her family.', true, null, null],
          ['C', 'She decides she dislikes her family.', false, 'Contradicts the story.', 'feelings_mismatch_evidence'],
          ['D', 'She stops caring about her little brother.', false, 'Contradicts holding him in her lap.', 'inference_unsupported'],
        ] },
    ],
  },
]

await runSeed(PASSAGES, { sourceNote: 'Khan Academy: Grade 5 reading comprehension' })
