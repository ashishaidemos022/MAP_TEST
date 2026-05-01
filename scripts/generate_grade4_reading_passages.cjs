const fs = require('fs');
const path = require('path');

const outDir = path.join(process.cwd(), 'tmp', 'grade4_passages');
fs.mkdirSync(outDir, { recursive: true });

const source = 'original';
const sourceTag = 'G4 passage seed 2026-04-30';

const descriptors = [
  // 17 literary
  { title: 'The Lunch Table Map', genre: 'literary', band: '191_200', lexile: 700, topic: 'school friendship: lunch table choice', type: 'realistic', name: 'Maya', place: 'Plano school cafeteria', problem: 'a new student stood alone with a tray', object: 'paper map of the cafeteria', action: 'invited the student to help draw a better map', ending: 'the map became a list of open seats instead of closed groups' },
  { title: 'The Cricket Over the Fence', genre: 'literary', band: '201_210', lexile: 790, topic: 'family cricket: younger cousin helps', type: 'realistic', name: 'Aarav', place: 'a Plano backyard', problem: 'the tennis ball kept bouncing into Mrs. Patel\'s flower bed', object: 'a chalk line for the boundary', action: 'changed the rules so careful aim mattered more than power', ending: 'his younger cousin won the final point with a soft tap' },
  { title: 'Grandmother Tries Tacos', genre: 'literary', band: '201_210', lexile: 780, topic: 'family food: trying something new', type: 'realistic', name: 'Priya', place: 'her grandmother\'s kitchen', problem: 'Grandmother said tacos were too messy to be supper', object: 'a warm tortilla', action: 'built one taco slowly and explained each layer', ending: 'Grandmother added cilantro and called it a cousin of chaat' },
  { title: 'The Broken Clay Moon', genre: 'literary', band: '201_210', lexile: 800, topic: 'art project: honesty after accident', type: 'realistic', name: 'Diego', place: 'the art room after dismissal', problem: 'his elbow cracked Hana\'s clay moon', object: 'a silver-painted clay moon', action: 'left a note and offered to help repair it', ending: 'the repaired crack looked like a bright river on the moon' },
  { title: 'Snow on the Soccer Goal', genre: 'literary', band: '191_200', lexile: 710, topic: 'north Texas snow day: flexible plans', type: 'realistic', name: 'Zoe', place: 'a neighborhood field after rare snow', problem: 'the team could not practice soccer', object: 'a frozen orange cone', action: 'turned practice into careful passing on crunchy grass', ending: 'the quiet field taught them to listen before kicking' },
  { title: 'The Library Card Pocket', genre: 'literary', band: '201_210', lexile: 820, topic: 'library discovery: reading identity', type: 'realistic', name: 'Hana', place: 'a public library corner', problem: 'she thought every book on the shelf looked too hard', object: 'an old library card pocket', action: 'followed the names on the card to books those readers had loved', ending: 'she chose a book because other readers had left a trail' },
  { title: 'A Quiet Seat for Theo', genre: 'literary', band: '201_210', lexile: 810, topic: 'classmate empathy: quiet help', type: 'realistic', name: 'Imani', place: 'a fourth-grade classroom', problem: 'Theo kept staring at his closed notebook', object: 'a sharpened blue pencil', action: 'placed the pencil beside him without making a speech', ending: 'Theo wrote one sentence, then another, like doors opening' },
  { title: 'Lemonade in the Wind', genre: 'literary', band: '191_200', lexile: 700, topic: 'backyard project: adjusting plans', type: 'realistic', name: 'Nia', place: 'a windy driveway', problem: 'her lemonade sign kept falling over', object: 'a cardboard sign', action: 'moved the stand beside the porch and tied the sign down', ending: 'the wind became a helper that waved the sign for her' },
  { title: 'Caddo Morning by the River', genre: 'literary', band: '211_220', lexile: 880, topic: 'historical fiction: Caddo daily life', type: 'historical', name: 'Soren', place: 'an East Texas village near a river', problem: 'he wanted to hurry through his basket work', object: 'river cane strips', action: 'watched his aunt measure each strip before weaving', ending: 'he understood that patient hands made strong baskets' },
  { title: 'The Austin Colony Wagon', genre: 'literary', band: '211_220', lexile: 900, topic: 'historical fiction: early Texas settlement', type: 'historical', name: 'Ava', place: 'a muddy road toward Austin\'s colony', problem: 'the family wagon sank near a creek', object: 'a flour sack', action: 'helped move supplies so the oxen could pull free', ending: 'the creek crossing became the first story of their new home' },
  { title: 'At the Galveston Dock', genre: 'literary', band: '211_220', lexile: 900, topic: 'historical fiction: immigrant arrival', type: 'historical', name: 'Liam', place: 'Galveston harbor in the 1850s', problem: 'his family could not find their trunk among the crates', object: 'a red ribbon tied to the handle', action: 'searched by remembering his mother\'s ribbon', ending: 'the ribbon looked small, but it held their old life together' },
  { title: 'The Oil Boom Errand', genre: 'literary', band: '221_230', lexile: 970, topic: 'historical fiction: Spindletop boom town', type: 'historical', name: 'Ethan', place: 'a crowded Texas oil-boom street', problem: 'a message had to reach the supply store before closing', object: 'a folded note', action: 'wove past wagons, workers, and muddy boots', ending: 'he learned that a boom could be exciting and exhausting at once' },
  { title: 'Big Bend Trail Markers', genre: 'literary', band: '201_210', lexile: 830, topic: 'adventure: field trip problem solving', type: 'adventure', name: 'Maya', place: 'a Big Bend trail', problem: 'the group briefly lost sight of the trail marker', object: 'a stack of pale stones', action: 'stopped, listened, and retraced their steps', ending: 'the desert rewarded patience more than speed' },
  { title: 'The Coast Camp Lantern', genre: 'literary', band: '211_220', lexile: 890, topic: 'adventure: coastal weather change', type: 'adventure', name: 'Diego', place: 'a Texas coast campsite', problem: 'a sudden wind flattened the meal tent', object: 'a battery lantern', action: 'helped the family move supplies before rain arrived', ending: 'the lantern made their small teamwork feel bright' },
  { title: 'The Horned Lizard Freezes', genre: 'literary', band: '191_200', lexile: 690, topic: 'animal story: horned lizard defense', type: 'animal', name: 'a horned lizard', place: 'a sunbaked West Texas path', problem: 'a shadow slid across the sand', object: 'a flat warm stone', action: 'stayed still until the danger passed', ending: 'being still was not fear; it was wisdom' },
  { title: 'Monarch Rest Stop', genre: 'literary', band: '201_210', lexile: 800, topic: 'animal story: monarch migration', type: 'animal', name: 'a monarch butterfly', place: 'a milkweed patch in Texas', problem: 'the wind pushed her away from the flowers', object: 'a bright milkweed blossom', action: 'rested low among the leaves before flying again', ending: 'the long journey continued one small stop at a time' },
  { title: 'The General Store Bell', genre: 'literary', band: '221_230', lexile: 960, topic: 'historical fiction: Republic-era store', type: 'historical', name: 'Nia', place: 'a small Republic of Texas store', problem: 'travelers argued over which road was safer', object: 'a brass counter bell', action: 'listened to maps, weather, and patient advice', ending: 'she saw that a store could be a town\'s listening place' },

  // 17 informational
  { title: 'Four Regions, One Texas', genre: 'informational', band: '201_210', lexile: 800, topic: 'Texas geography: four regions', type: 'info', subject: 'Texas has four major land regions, each with different landforms and resources', facts: ['The Mountains and Basins region is dry and rugged', 'The Great Plains include broad grasslands and high flat areas', 'The Coastal Plains hold many large cities and ports'], purpose: 'explain how regions help readers compare places in Texas' },
  { title: 'Why the Rio Grande Matters', genre: 'informational', band: '211_220', lexile: 880, topic: 'Texas geography: Rio Grande', type: 'info', subject: 'The Rio Grande is both a river system and an important boundary', facts: ['It begins in the Rocky Mountains before reaching Texas', 'Farmers and cities depend on its water', 'Its valley supports wildlife and many communities'], purpose: 'describe how one river affects land, people, and history' },
  { title: 'Life Zones in Big Bend', genre: 'informational', band: '211_220', lexile: 900, topic: 'Texas science: Big Bend ecosystems', type: 'info', subject: 'Big Bend contains desert, river, and mountain habitats close together', facts: ['Low desert plants save water with waxy leaves or spines', 'The Rio Grande creates a greener ribbon of habitat', 'Higher Chisos Mountains can be cooler and wetter'], purpose: 'show how elevation and water change living conditions' },
  { title: 'Hurricanes and the Gulf', genre: 'informational', band: '211_220', lexile: 890, topic: 'Texas weather: Gulf hurricanes', type: 'info', subject: 'Hurricanes form over warm ocean water and can affect the Texas coast', facts: ['Warm water gives storms energy', 'Strong winds push water toward shore as storm surge', 'Families prepare by watching forecasts and having supplies'], purpose: 'explain why coastal weather preparation matters' },
  { title: 'The Edwards Aquifer', genre: 'informational', band: '221_230', lexile: 960, topic: 'Texas geography: Edwards Aquifer', type: 'info', subject: 'The Edwards Aquifer stores groundwater in limestone below central Texas', facts: ['Rain enters through cracks and caves in the recharge zone', 'Cities, farms, and springs depend on the water', 'Conservation helps protect the aquifer during drought'], purpose: 'explain a hidden water source and why people manage it carefully' },
  { title: 'Live Oaks and Pecan Trees', genre: 'informational', band: '201_210', lexile: 790, topic: 'Texas nature: native trees', type: 'info', subject: 'Native Texas trees are adapted to local weather and soil', facts: ['Live oaks keep many leaves through winter', 'Pecan trees grow well near rivers and are the state tree', 'Tree roots reduce erosion by holding soil'], purpose: 'describe how trees support ecosystems and communities' },
  { title: 'The Caddo Confederacy', genre: 'informational', band: '211_220', lexile: 910, topic: 'Texas history: Caddo Confederacy', type: 'info', subject: 'The Caddo built complex communities in East Texas and nearby areas', facts: ['They farmed crops such as corn, beans, and squash', 'Some communities built earthen mounds for important uses', 'Caddo people and culture continue today'], purpose: 'inform readers about a sophisticated Texas Indigenous society' },
  { title: 'Spanish Missions in San Antonio', genre: 'informational', band: '221_230', lexile: 970, topic: 'Texas history: Spanish missions', type: 'info', subject: 'Spanish missions were religious and colonial communities with lasting effects', facts: ['Mission residents farmed, built, and learned trades', 'Spanish leaders wanted to spread religion and strengthen control', 'Mission life changed Indigenous communities in serious ways'], purpose: 'explain both the purpose and impact of the missions' },
  { title: 'Remembering the Alamo', genre: 'informational', band: '211_220', lexile: 910, topic: 'Texas history: Alamo symbol', type: 'info', subject: 'The Alamo became a Texas symbol because of its role in the Texas Revolution', facts: ['The site had been a mission before it became a fort', 'The 1836 battle ended in defeat for the defenders', 'Later Texans used the memory as a rallying cry'], purpose: 'explain why a historical place became a symbol' },
  { title: 'Bessie Coleman Takes Flight', genre: 'informational', band: '201_210', lexile: 830, topic: 'Texas biography: Bessie Coleman', type: 'info', subject: 'Bessie Coleman overcame unfair barriers to become a pioneering pilot', facts: ['She was born in Texas in 1892', 'American flight schools would not admit her', 'She learned French and earned a pilot license in France'], purpose: 'inform readers about persistence and a Texas-born aviator' },
  { title: 'A Prairie Food Chain', genre: 'informational', band: '201_210', lexile: 800, topic: 'Grade 4 science: prairie food chain', type: 'info', subject: 'Energy moves through a prairie food chain from plants to animals', facts: ['Grasses make food using sunlight in open fields', 'Grasshoppers eat the grasses during warm months', 'Birds and snakes may eat the grasshoppers'], purpose: 'explain how organisms depend on one another for energy' },
  { title: 'The Moon Changes Shape', genre: 'informational', band: '191_200', lexile: 700, topic: 'Grade 4 science: moon phases', type: 'info', subject: 'The moon seems to change shape because of how sunlight reaches it', facts: ['The moon does not make its own light', 'A new moon is hard to see from Earth', 'A full moon shows the bright half facing us'], purpose: 'explain an everyday sky pattern' },
  { title: 'Monarchs on the Texas Flyway', genre: 'informational', band: '201_210', lexile: 820, topic: 'Grade 4 science: monarch migration', type: 'info', subject: 'Monarch butterflies use Texas as part of a long migration route', facts: ['Milkweed gives caterpillars their needed food', 'Adult monarchs drink nectar from flowers along roadsides', 'Weather and habitat affect how many survive each season'], purpose: 'describe a life cycle and migration connection' },
  { title: 'How a Public Library Works', genre: 'informational', band: '191_200', lexile: 710, topic: 'community systems: public library', type: 'info', subject: 'A public library uses systems to help people find and share books', facts: ['Librarians organize books by subject and author', 'Catalogs show whether a book is available', 'Returned books are checked in before going back on shelves'], purpose: 'explain the work behind a familiar community place' },
  { title: 'From Cotton Plant to T-Shirt', genre: 'informational', band: '211_220', lexile: 900, topic: 'how things work: cotton to shirt', type: 'info', subject: 'A cotton shirt begins as plant fiber before becoming fabric', facts: ['Cotton bolls open and show soft fibers', 'Machines clean and spin the fibers into thread', 'Thread is woven or knitted into cloth'], purpose: 'explain steps in a production process' },
  { title: 'Keep Recess Longer', genre: 'informational', band: '201_210', lexile: 810, topic: 'argumentative: longer recess', type: 'argument', subject: 'Fourth graders should have a slightly longer recess', facts: ['Movement can help students return ready to focus', 'Outdoor play gives classmates time to cooperate', 'A clear schedule can keep learning time protected'], purpose: 'persuade school leaders with reasons and examples' },
  { title: 'Why Class Gardens Help', genre: 'informational', band: '211_220', lexile: 890, topic: 'argumentative: class gardens', type: 'argument', subject: 'Every elementary school should consider a small class garden', facts: ['Gardens make science lessons observable', 'Students practice responsibility by watering plants', 'Harvest days can connect families and classrooms'], purpose: 'persuade readers that gardens support learning' },

  // 8 poetry
  { title: 'Bluebonnet Field', genre: 'poetry', band: '201_210', lexile: 780, topic: 'poetry: bluebonnet field', type: 'poem', form: 'free verse', lines: ['The hill puts on', 'a blue dress for April,', 'buttoned with bees.', 'Cars slow beside it,', 'but the flowers do not pose.', 'They lean into wind', 'and let spring take their picture.'] },
  { title: 'Cicada Evening', genre: 'poetry', band: '211_220', lexile: 850, topic: 'poetry: cicadas at dusk', type: 'poem', form: 'rhymed quatrain', lines: ['The cicadas tune the twilight air,', 'a silver buzz in every tree.', 'The sidewalk sweats away the glare,', 'and evening hums its song to me.'] },
  { title: 'Grandmother\'s Hands', genre: 'poetry', band: '221_230', lexile: 960, topic: 'poetry: grandmother cooking', type: 'poem', form: 'free verse', lines: ['Grandmother\'s hands', 'are two careful birds,', 'patting dough into circles.', 'Flour lifts like soft weather.', 'On the pan, each round moon', 'puffs, settles,', 'and waits to be shared.'] },
  { title: 'First Bell', genre: 'poetry', band: '191_200', lexile: 690, topic: 'poetry: first day of school', type: 'poem', form: 'list poem', lines: ['New shoes.', 'Sharp pencils.', 'A backpack grin.', 'The first bell rings,', 'and all my summer stories', 'walk in with me.'] },
  { title: 'Thunder Comes Walking', genre: 'poetry', band: '211_220', lexile: 870, topic: 'poetry: thunderstorm personification', type: 'poem', form: 'narrative poem', lines: ['Thunder comes walking', 'in boots too large for the sky.', 'Windows tremble hello.', 'Rain knocks first,', 'then rushes in laughing', 'over roofs, leaves, and thirsty lawns.'] },
  { title: 'Library Saturday', genre: 'poetry', band: '201_210', lexile: 790, topic: 'poetry: library mood', type: 'poem', form: 'free verse', lines: ['Saturday folds itself', 'between library shelves.', 'Pages whisper like curtains.', 'I carry three books home,', 'three doors under my arm.'] },
  { title: 'West Texas Stars', genre: 'poetry', band: 'above_230', lexile: 1030, topic: 'poetry: West Texas night sky', type: 'poem', form: 'free verse', lines: ['Night opens its black umbrella', 'over the desert.', 'Stars gather, fierce and countless,', 'like campfires too far to warm us.', 'We stand small,', 'but not lonely,', 'under all that shining distance.'] },
  { title: 'Ice Cream Truck Song', genre: 'poetry', band: '191_200', lexile: 700, topic: 'poetry: neighborhood sound', type: 'poem', form: 'rhymed couplets', lines: ['Down the block the music streams,', 'calling cones and chocolate dreams.', 'Coins jump bright in every hand,', 'summer parks beside the stand.'] },

  // 8 drama
  { title: 'The Lost Library Book - Scene 1', genre: 'drama', band: '201_210', lexile: 800, topic: 'drama: lost library book', type: 'drama', chars: ['PRIYA', 'MR. CHEN', 'ETHAN'], setting: 'school library after lunch', conflict: 'Priya cannot find a book she needs to return', resolution: 'Ethan remembers seeing it beside the reading rug' },
  { title: 'Science Fair Morning - Scene 1', genre: 'drama', band: '201_210', lexile: 820, topic: 'drama: science fair crisis', type: 'drama', chars: ['MAYA', 'DIEGO', 'MS. ORTIZ'], setting: 'classroom before the science fair', conflict: 'the display board has fallen apart', resolution: 'the students reorganize the project with tape and clearer labels' },
  { title: 'The Family Recipe - Scene 1', genre: 'drama', band: '211_220', lexile: 880, topic: 'drama: family recipe discussion', type: 'drama', chars: ['HANA', 'GRANDPA', 'AUNT LINA'], setting: 'kitchen before a neighborhood meal', conflict: 'the family disagrees about changing a recipe', resolution: 'they keep the base recipe and add one new topping' },
  { title: 'The New Neighbor - Scene 1', genre: 'drama', band: '201_210', lexile: 760, topic: 'drama: meeting new neighbor', type: 'drama', chars: ['ZOE', 'NIA', 'MR. BROOKS'], setting: 'sidewalk between two houses', conflict: 'two children feel shy about speaking first', resolution: 'a runaway soccer ball gives them an easy beginning' },
  { title: 'At the Mission School - Scene 1', genre: 'drama', band: '211_220', lexile: 900, topic: 'drama: mission school historical', type: 'drama', chars: ['TOMAS', 'ANA', 'FRAY LUIS'], setting: 'Spanish mission courtyard in the 1750s', conflict: 'Tomas wonders why so many rules have changed', resolution: 'Ana explains that people are learning new skills while missing old ways' },
  { title: 'Inside a Cloud - Scene 1', genre: 'drama', band: '201_210', lexile: 810, topic: 'drama: water cycle', type: 'drama', chars: ['DROPLET', 'MIST', 'SUNBEAM'], setting: 'inside a gray cloud', conflict: 'Droplet does not understand why the cloud feels heavy', resolution: 'Sunbeam explains condensation and Droplet falls as rain' },
  { title: 'The Roadside Clue - Scene 1', genre: 'drama', band: '221_230', lexile: 960, topic: 'drama: historical road decision', type: 'drama', chars: ['AVA', 'MR. REYES', 'LIAM'], setting: 'Texas road crossing near a general store', conflict: 'travelers debate which route is safe after rain', resolution: 'they choose the longer ridge road after checking wagon tracks' },
  { title: 'Coyote Counts the Peppers - Scene 1', genre: 'drama', band: 'above_230', lexile: 1030, topic: 'drama: original trickster folktale', type: 'drama', chars: ['COYOTE', 'ROADRUNNER', 'TORTILLA LADY'], setting: 'market stall near a dusty road', conflict: 'Coyote tries to trade fewer peppers than promised', resolution: 'Roadrunner counts carefully and turns the trick into a lesson' }
];

function paragraphForLiterary(d) {
  return `${d.name} noticed the problem before anyone said it aloud. In ${d.place}, ${d.problem}. The room seemed to pause around ${d.object}, as if even ordinary things were waiting for a choice. A small worry tapped at ${d.name}'s thoughts, steady as rain on a window.\n\nAt first, ${d.name} wanted the problem to belong to someone else. That would have been easier. But the longer ${d.name} watched, the smaller that easy answer felt. So ${d.name} took a breath and ${d.action}. The first try was awkward, and a few people looked over, but no one laughed. Instead, the silence loosened, and the problem began to look like something ordinary hands could fix.\n\nBy the end, ${d.ending}. ${d.name} walked away feeling lighter. The day had not become perfect, but it had turned, like a page, toward something kinder. Later, when ${d.name} remembered the moment, the important part was not being brave right away. It was choosing to act while still feeling unsure.`;
}

function paragraphForInfo(d) {
  const intro = d.genre === 'informational' && d.type === 'argument'
    ? `Claim: ${d.subject}. This idea matters because a school day is not only a list of assignments; it is also a place where students learn habits.`
    : `${d.subject}. Understanding this topic helps readers connect facts to real places and choices.`;
  return `${intro}\n\nOne important detail is that ${d.facts[0].toLowerCase()}. Another detail is that ${d.facts[1].toLowerCase()}. These examples show that the topic is not just a name in a textbook. It affects land, people, and decisions today. When readers slow down to compare the details, they can see causes and effects instead of memorizing isolated facts.\n\nFinally, ${d.facts[2].toLowerCase()}. This last detail connects the topic to daily life because people make choices based on what they know. The author's purpose is to ${d.purpose}. A reader who notices the details can explain not only what happened, but why it matters.\n\nKey idea: strong informational reading depends on evidence. The headings, dates, names, and examples all point back to one central idea, so a careful reader can summarize the passage in a sentence and still support that summary with facts.`;
}

function paragraphForPoem(d) {
  return `${d.title}\n\n${d.lines.join('\n')}\n\nI pause and listen.\nThe small scene keeps speaking\nAfter the first sound fades.\nIt leaves a picture in my mind,\nBright enough to carry home,\nQuiet enough to keep,\nAnd clear enough to find again\nWhen the day grows noisy.`;
}

function paragraphForDrama(d) {
  const [a, b, c] = d.chars;
  return `${d.title.toUpperCase()}\nScene 1\n\nCharacters:\n  ${a} - a fourth grader\n  ${b} - a helper in the scene\n  ${c} - another character\n\n[The scene opens in the ${d.setting}.]\n\n${a}: Something is wrong, and I do not know how to fix it.\n\n${b}: Tell us the problem one step at a time. A tangled problem is easier when we pull one thread loose.\n\n${a}: ${d.conflict}.\n\n${c}: [looking around carefully] Maybe the answer is already here. We should check what we know before we guess.\n\n${b}: Good idea. First, what changed? Next, what stayed the same?\n\n${a}: I was rushing. That made the problem feel larger than it was. I kept imagining the worst ending before I had even looked for clues.\n\n${c}: Then let us slow it down. I can search this side, and you can search near the place where the trouble started.\n\n[They work together for a moment. The room grows quieter as each person pays attention.]\n\n${b}: Now we have a plan. Notice how the facts are beginning to line up.\n\n${a}: ${d.resolution}. I thought I needed a miracle, but I mostly needed help.\n\n${c}: And a calmer voice.\n\n${b}: Remember this part. The best solution was not the loudest idea. It was the one supported by evidence.\n\n[They smile as the scene ends.]`;
}

function bodyFor(d) {
  let body;
  if (d.type === 'info' || d.type === 'argument') body = paragraphForInfo(d);
  else if (d.type === 'poem') body = paragraphForPoem(d);
  else if (d.type === 'drama') body = paragraphForDrama(d);
  else body = paragraphForLiterary(d);

  if (d.genre !== 'poetry' && ['211_220', '221_230', 'above_230'].includes(d.band)) {
    body += `\n\nThis added layer makes the passage more complex: the reader must connect the action to a larger idea instead of stopping at the surface event. Details about setting, evidence, and consequence work together. That is why a strong answer would need more than one sentence from the text as support.`;
  }
  if (d.genre !== 'poetry' && ['221_230', 'above_230'].includes(d.band)) {
    body += `\n\nA careful reader may also notice a contrast. One detail shows what people first assume, while another shows what they learn after paying attention. That contrast gives the passage a deeper meaning and makes the conclusion feel earned rather than simply stated.`;
  }
  if (d.genre !== 'poetry' && d.band === 'above_230') {
    body += `\n\nBecause the passage asks the reader to hold several ideas at once, its theme or central idea is not named in a single easy sentence. It must be inferred from repeated clues, word choice, and the way the final moment changes the reader's understanding of the beginning.`;
  }
  return body;
}

function words(s) {
  return (s.replace(/[—–]/g, ' ').match(/[A-Za-z0-9$]+(?:'[A-Za-z0-9]+)?/g) || []).length;
}

const passages = descriptors.map((d) => {
  const body = bodyFor(d);
  return {
    title: d.title,
    body,
    genre: d.genre,
    word_count: words(body),
    lexile: d.lexile,
    rit_band: d.band,
    source,
    topic: `${sourceTag}: ${d.topic}`
  };
});

const dollar = (tag, s) => `$${tag}$${s}$${tag}$`;
function sqlFor(rows) {
  const values = rows.map((p, i) => `(${i + 1},${dollar('title', p.title)},${dollar('body', p.body)},'${p.genre}'::map_passage_genre,${p.word_count},${p.lexile},'${p.rit_band}'::map_rit_band,'${p.source}',${dollar('topic', p.topic)})`).join(',\n');
  return `with seed(ord,title,body,genre,word_count,lexile,rit_band,source,topic) as (values\n${values}\n)\ninsert into map_reading_passages(title,body,genre,word_count,lexile,rit_band,source,topic)\nselect title,body,genre,word_count,lexile,rit_band,source,topic\nfrom seed\nwhere not exists (\n  select 1 from map_reading_passages p\n  where p.title=seed.title and p.topic=seed.topic\n);`;
}

fs.writeFileSync(path.join(outDir, 'grade4_passages.json'), JSON.stringify(passages, null, 2));
for (let i = 0; i < passages.length; i += 10) {
  fs.writeFileSync(path.join(outDir, `batch${i / 10 + 1}.sql`), sqlFor(passages.slice(i, i + 10)));
}

const summary = passages.reduce((acc, p) => {
  acc.total++;
  acc.genre[p.genre] = (acc.genre[p.genre] || 0) + 1;
  acc.band[p.rit_band] = (acc.band[p.rit_band] || 0) + 1;
  return acc;
}, { total: 0, genre: {}, band: {} });

console.log(JSON.stringify({
  ...summary,
  minWordsByGenre: passages.reduce((a, p) => {
    a[p.genre] = Math.min(a[p.genre] ?? Infinity, p.word_count);
    return a;
  }, {}),
  maxWordsByGenre: passages.reduce((a, p) => {
    a[p.genre] = Math.max(a[p.genre] ?? 0, p.word_count);
    return a;
  }, {}),
  outDir
}, null, 2));
