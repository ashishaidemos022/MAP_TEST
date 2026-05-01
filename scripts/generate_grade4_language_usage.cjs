const fs = require('fs');
const path = require('path');

const outDir = path.join(process.cwd(), 'tmp', 'grade4_language_usage');
fs.mkdirSync(outDir, { recursive: true });

const SOURCE = 'Original Grade 4 language usage seed: 2026-04-30';

const tagByCode = {
  '4.2B.vi': 'spelling_pattern_confusion',
  '4.2C.i': 'spelling_pattern_confusion',
  '4.2C.ii': 'spelling_pattern_confusion',
  '4.2C.iii': 'vocab_skipped_context_clues',
  '4.11D.i': 'subject_verb_agreement',
  '4.11D.ii': 'verb_tense_confusion',
  '4.11D.iii': 'plural_form_confusion',
  '4.11D.iv': 'article_a_an_misuse',
  '4.11D.v': 'part_of_speech_confusion',
  '4.11D.vi': 'preposition_use',
  '4.11D.vii': 'pronoun_mismatch',
  '4.11D.viii': 'conjunction_use',
  '4.11D.ix': 'capitalization_rules',
  '4.11D.x': 'punctuation_rules',
  '4.11D.xi': 'spelling_recognition',
  '4.11C.i': 'conjunction_use',
  '4.11C.ii': 'sentence_completeness',
  '4.11C.iii': 'sentence_completeness',
  '4.11B.i': 'sequence_wrong_step',
  '4.11B.ii': 'response_off_topic_or_vague',
  '4.3D': 'vocab_skipped_context_clues',
  '4.3E': 'confused_synonym_with_antonym'
};

function choices(correct, wrongs, tag, misconception) {
  const labels = ['A', 'B', 'C', 'D'];
  const bodies = [correct, ...wrongs];
  const rotation = choices.count++ % 4;
  const rotated = bodies.map((_, i) => bodies[(i - rotation + 4) % 4]);
  return rotated.map((body, i) => ({
    label: labels[i],
    body,
    is_correct: body === correct,
    misconception: body === correct ? null : misconception,
    misconception_tag: body === correct ? null : tag,
    sort_order: i + 1
  }));
}
choices.count = 0;

function q(code, band, difficulty, stem, correct, wrongs, explanation, misconception) {
  const tag = tagByCode[code];
  return {
    subject: 'language',
    grade: 4,
    teks_code: code,
    rit_band: band,
    difficulty,
    stem,
    stem_image_svg: null,
    audio_supported: true,
    explanation,
    source_note: SOURCE,
    is_active: true,
    question_format: 'mcq',
    choices: choices(correct, wrongs, tag, misconception)
  };
}

const items = [];
const add = (...args) => items.push(q(...args));

// 4.2B.vi Decoding multisyllabic words
add('4.2B.vi','191_200','easy','Which word has three syllables?','adventure',['plain','stream','bright'],'Ad-ven-ture has three syllables. The other words have one syllable.','Counted letters instead of spoken syllables.');
add('4.2B.vi','201_210','medium','Which division shows the syllables in careful?','care-ful',['ca-reful','car-eful','caref-ul'],'Careful divides into care-ful. Each part has a vowel sound.','Split the word without listening for vowel sounds.');
add('4.2B.vi','201_210','medium','Which word has a final stable syllable?','table',['tape','trail','team'],'The -ble ending in table is a final stable syllable.','Missed the final stable syllable pattern.');
add('4.2B.vi','211_220','hard','Which syllable type is the first syllable in robot?','open syllable',['closed syllable','vowel team','r-controlled'],'Ro is open because it ends with a vowel sound.','Confused an open syllable with another syllable type.');

// 4.2C.i Spelling multisyllabic words
add('4.2C.i','191_200','easy','Which word is spelled correctly?','important',['importent','imporant','impartant'],'Important is the correct spelling.','Chose a spelling that leaves out or changes a syllable.');
add('4.2C.i','201_210','medium','Which word is spelled correctly?','different',['diffrent','diferent','differnt'],'Different is spelled with diff-er-ent.','Dropped a letter from a multisyllabic spelling pattern.');
add('4.2C.i','201_210','medium','Which word is spelled correctly?','favorite',['favrite','favorit','faverite'],'Favorite is the standard spelling.','Used a common pronunciation-based misspelling.');
add('4.2C.i','211_220','hard','Which sentence has the correctly spelled word?','The museum exhibit was interesting.',['The museam exhibit was interesting.','The museum exzibit was interesting.','The museum exhibit was intresting.'],'Museum, exhibit, and interesting are all spelled correctly.','Misspelled a multisyllabic word by sound.');

// 4.2C.ii Affixes
add('4.2C.ii','191_200','easy','Which word is formed correctly from hope + ful?','hopeful',['hopefull','hopful','hopeeful'],'Hopeful keeps the e and adds -ful.','Applied the wrong suffix spelling rule.');
add('4.2C.ii','201_210','medium','Which word is formed correctly from happy + ness?','happiness',['happyness','happyiness','hapiness'],'Change y to i before adding -ness: happiness.','Forgot to change y to i before adding a suffix.');
add('4.2C.ii','201_210','medium','Which word is formed correctly from stop + ing?','stopping',['stoping','stoppping','stopening'],'Double the final consonant before -ing: stopping.','Forgot or overused the doubling rule.');
add('4.2C.ii','211_220','hard','Which word is formed correctly from create + ive?','creative',['createive','creativ','creatitive'],'Drop the final e before adding -ive: creative.','Did not drop the final e before a vowel suffix.');

// 4.2C.iii Homophones
add('4.2C.iii','191_200','easy','Choose the correct word: ___ going to the library.','They\'re',['Their','There','Thair'],'They\'re means they are.','Confused homophones with the same sound.');
add('4.2C.iii','201_210','medium','Choose the correct word: Maya put ___ backpack by the door.','her',['hear','here','she'],'Her shows whose backpack it is.','Chose a sound-alike or wrong pronoun.');
add('4.2C.iii','201_210','medium','Choose the correct word: We have ___ tickets for the show.','two',['to','too','tow'],'Two names the number.','Confused to, too, and two.');
add('4.2C.iii','211_220','hard','Choose the correct word: The team won ___ game yesterday.','its',['it\'s','its\'','it'],'Its shows possession. It\'s means it is.','Confused possessive its with the contraction it\'s.');

// 4.11D.i Subject-verb agreement
add('4.11D.i','191_200','easy','Which sentence is correct?','The dogs bark at the gate.',['The dogs barks at the gate.','The dog bark at the gate.','The dogs is bark at the gate.'],'Plural dogs takes bark.','Matched the verb to the wrong number.');
add('4.11D.i','201_210','medium','Which sentence uses correct subject-verb agreement?','Each student has a notebook.',['Each student have a notebook.','Each students has a notebook.','Each student are a notebook.'],'Each is singular, so use has.','Treated each as plural.');
add('4.11D.i','201_210','medium','Which sentence is correct?','The class is visiting the museum.',['The class are visiting the museum.','The class visit the museum yesterday.','The class were visiting the museum.'],'Class is a collective noun used as one group, so use is.','Treated a collective noun as plural.');
add('4.11D.i','211_220','hard','Which sentence is correct?','Neither of the answers is correct.',['Neither of the answers are correct.','Neither of the answers be correct.','Neither of the answers were correct.'],'Neither is singular, so use is.','Matched the verb to answers instead of neither.');
add('4.11D.i','221_230','hard','Which revision fixes the agreement error?','The list of supplies is on the desk.',['The list of supplies are on the desk.','The supplies of list is on the desk.','The list of supplies were on the desk.'],'The subject is list, which is singular, so use is.','Matched the verb to the object of the preposition.');

// 4.11D.ii Verb tense
add('4.11D.ii','191_200','easy','Choose the verb that completes the sentence: Yesterday, Liam ___ a poem.','wrote',['writes','will write','write'],'Yesterday signals past tense, so wrote is correct.','Used present or future tense with a past-time clue.');
add('4.11D.ii','201_210','medium','Choose the verb: Tomorrow, Priya ___ her project.','will present',['presented','has presented','presents yesterday'],'Tomorrow signals future tense.','Ignored the future-time clue.');
add('4.11D.ii','201_210','medium','Which sentence uses present perfect tense?','Ava has finished the chapter.',['Ava finished the chapter.','Ava will finish the chapter.','Ava finishes the chapter.'],'Has finished is present perfect tense.','Confused simple tense with perfect tense.');
add('4.11D.ii','211_220','hard','Which revision keeps the tense consistent?','Hana packed lunch and walked to school.',['Hana packed lunch and walks to school.','Hana packs lunch and walked to school.','Hana will pack lunch and walked to school.'],'Packed and walked are both past tense.','Mixed verb tenses in one sentence.');
add('4.11D.ii','221_230','hard','Which sentence correctly uses past perfect?','By noon, the rain had stopped.',['By noon, the rain has stopped.','By noon, the rain will stop.','By noon, the rain stops.'],'Had stopped shows an action completed before a past time.','Used the wrong perfect tense.');

// 4.11D.iii Nouns
add('4.11D.iii','191_200','easy','Which sentence uses a possessive noun correctly?','Maya\'s pencil rolled away.',['Mayas pencil rolled away.','Maya pencil\'s rolled away.','Mayas\' pencil rolled away.'],'Maya\'s shows the pencil belongs to Maya.','Put the apostrophe in the wrong place.');
add('4.11D.iii','201_210','medium','Choose the correct plural: The ___ flew over the pond.','geese',['gooses','goose','geeses'],'Geese is the plural of goose.','Used a regular plural for an irregular noun.');
add('4.11D.iii','201_210','medium','Which word is a proper noun?','Texas',['river','teacher','museum'],'Texas names a specific place, so it is proper.','Confused common and proper nouns.');
add('4.11D.iii','211_220','hard','Which sentence uses a plural possessive correctly?','The teachers\' lounge is quiet.',['The teacher\'s lounge are quiet.','The teachers lounge is quiet.','The teacher lounge\'s is quiet.'],'Teachers\' shows the lounge belongs to more than one teacher.','Confused singular and plural possessive forms.');
add('4.11D.iii','221_230','hard','Which revision fixes the noun error?','The children\'s coats hung by the door.',['The childrens coats hung by the door.','The childrens\' coats hung by the door.','The childrenses coats hung by the door.'],'Children is already plural, so use children\'s.','Added plural possessive rules to an irregular plural incorrectly.');

// 4.11D.iv Adjectives and articles
add('4.11D.iv','191_200','easy','Choose the correct article: Hana saw ___ owl in the tree.','an',['a','thee','some an'],'Use an before a vowel sound.','Chose the wrong article for the beginning sound.');
add('4.11D.iv','201_210','medium','Which sentence uses a comparative adjective correctly?','This trail is steeper than that one.',['This trail is steepest than that one.','This trail is more steeper than that one.','This trail is most steep than that one.'],'Use steeper to compare two things.','Used a superlative or double comparison.');
add('4.11D.iv','201_210','medium','Choose the best adjective: The ___ answer explained every step.','clear',['clearly','clearness','clearerly'],'Clear describes the noun answer.','Chose an adverb or noun form instead of an adjective.');
add('4.11D.iv','211_220','hard','Which sentence uses a superlative correctly?','Of all the posters, Zoe\'s is the brightest.',['Of all the posters, Zoe\'s is brighter.','Of all the posters, Zoe\'s is more brightest.','Of all the posters, Zoe\'s is bright than.'],'Brightest compares one poster with all the others.','Used comparative form for more than two things.');

// 4.11D.v Adverbs
add('4.11D.v','191_200','easy','Which word is an adverb?','quickly',['quick','quicker','quickness'],'Quickly tells how an action is done.','Confused adjective and adverb forms.');
add('4.11D.v','201_210','medium','Choose the adverb: Imani ___ checks her work before turning it in.','always',['bright','careful','silent'],'Always tells how often Imani checks her work.','Chose a word that does not tell frequency.');
add('4.11D.v','201_210','medium','Which sentence uses an adverb of manner?','Theo spoke softly to the kitten.',['Theo held the soft kitten.','Theo chose a softer blanket.','Theo liked softness.'],'Softly tells how Theo spoke.','Confused an adjective or noun with an adverb.');
add('4.11D.v','211_220','hard','Which revision uses the adverb correctly?','Aarav answered the question carefully.',['Aarav answered the question careful.','Aarav careful answered the question.','Aarav answered the carefully question.'],'Carefully describes how he answered.','Placed or formed the adverb incorrectly.');

// 4.11D.vi Prepositions
add('4.11D.vi','191_200','easy','Choose the preposition: The book is ___ the desk.','under',['quickly','blue','because'],'Under shows where the book is.','Chose a word that is not a preposition.');
add('4.11D.vi','201_210','medium','Choose the phrase that tells where: Priya waited ___ the gym.','beside',['often','carefully','happy'],'Beside the gym is a prepositional phrase telling where.','Confused an adverb or adjective with a prepositional phrase.');
add('4.11D.vi','201_210','medium','Which sentence uses a prepositional phrase correctly?','The note inside the folder is mine.',['The note carefully is mine.','The note because the folder is mine.','The note blue the folder is mine.'],'Inside the folder is a prepositional phrase.','Did not recognize a complete prepositional phrase.');
add('4.11D.vi','211_220','hard','Which phrase completes the sentence best? The trail curved ___ the river.','along',['during','without','except'],'Along the river shows direction and location.','Chose a preposition that does not fit the meaning.');

// 4.11D.vii Pronouns
add('4.11D.vii','191_200','easy','Choose the correct pronoun: Ava and I packed ___ lunches.','our',['us','we','ourselves'],'Our shows the lunches belong to Ava and me.','Chose the wrong pronoun type.');
add('4.11D.vii','201_210','medium','Choose the correct pronoun: The teacher gave the forms to Maya and ___.','me',['I','myself','mine'],'Use object pronoun me after to.','Used a subject or reflexive pronoun as an object.');
add('4.11D.vii','201_210','medium','Which sentence uses a reflexive pronoun correctly?','Diego made the model himself.',['Diego made the model hisself.','Diego made the model him.','Diego made the model his.'],'Himself is the correct reflexive pronoun.','Used a nonstandard or wrong pronoun form.');
add('4.11D.vii','211_220','hard','Which revision fixes the pronoun error?','Nia and she will lead the game.',['Nia and her will lead the game.','Nia and hers will lead the game.','Nia and herself will lead the game.'],'She is a subject pronoun.','Used an object or reflexive pronoun as a subject.');
add('4.11D.vii','221_230','hard','Choose the sentence with a clear pronoun reference.','When Zoe saw Hana, Zoe waved.',['When Zoe saw Hana, she waved.','Zoe saw Hana, and it waved.','She saw Zoe when Hana waved.'],'Repeating Zoe makes it clear who waved.','Used an unclear pronoun reference.');

// 4.11D.viii Conjunctions
add('4.11D.viii','191_200','easy','Choose the conjunction: I wanted to play, ___ it started raining.','but',['under','quickly','because of'],'But connects contrasting ideas.','Chose a word that does not connect clauses correctly.');
add('4.11D.viii','201_210','medium','Choose the best conjunction: We stayed inside ___ the storm passed.','until',['and','or','but'],'Until shows when the staying ended.','Chose a conjunction that changes the time relationship.');
add('4.11D.viii','201_210','medium','Which sentence uses a coordinating conjunction correctly?','Maya packed a snack, and Liam filled the bottles.',['Maya packed a snack, because Liam filled the bottles.','Maya packed a snack, under Liam filled the bottles.','Maya packed a snack, although and Liam filled the bottles.'],'And correctly joins two complete thoughts.','Used the wrong conjunction for a compound sentence.');
add('4.11D.viii','211_220','hard','Choose the best subordinating conjunction: ___ it was late, we finished reading.','Although',['And','Or','But'],'Although introduces a contrast in a dependent clause.','Used a coordinating conjunction where a subordinating one is needed.');

// 4.11D.ix Capitalization
add('4.11D.ix','191_200','easy','Which sentence uses capitalization correctly?','We visited the Texas Capitol.',['We visited the texas Capitol.','We visited the Texas capitol.','we visited the Texas Capitol.'],'Texas Capitol is a proper noun and the sentence begins with a capital.','Missed capitalization of a proper noun or sentence beginning.');
add('4.11D.ix','201_210','medium','Which title is capitalized correctly?','The History of the Alamo',['the History of the Alamo','The history of the alamo','The History Of The Alamo'],'Capitalize important words and proper nouns in a title.','Capitalized too much or too little.');
add('4.11D.ix','201_210','medium','Choose the correct sentence.','Hana speaks English and Spanish.',['Hana speaks english and Spanish.','Hana speaks English and spanish.','hana speaks English and Spanish.'],'Languages and names are capitalized.','Did not capitalize languages or names.');
add('4.11D.ix','211_220','hard','Which sentence uses capitalization correctly?','The class read the Declaration of Independence.',['The class read the declaration of Independence.','The class read the Declaration of independence.','the class read the Declaration of Independence.'],'Historical documents and sentence beginnings need capitals.','Missed capitalization in a historical document title.');
add('4.11D.ix','221_230','hard','Which revision fixes all capitalization errors?','In April, we studied the Battle of San Jacinto.',['In april, we studied the Battle of san Jacinto.','in April, we studied the battle of San Jacinto.','In April, we studied the battle of san jacinto.'],'Months and historical events are capitalized.','Did not capitalize a month or historical event.');

// 4.11D.x Punctuation
add('4.11D.x','191_200','easy','Which sentence uses quotation marks correctly?','Maya said, "I found it."',['Maya said, I found it.','Maya said, "I found it.','"Maya said, I found it."'],'Quotation marks go around the exact words spoken.','Placed quotation marks incorrectly or omitted them.');
add('4.11D.x','201_210','medium','Choose the sentence with commas in a series.','We packed pencils, paper, and markers.',['We packed pencils paper, and markers.','We packed pencils, paper and, markers.','We packed, pencils paper and markers.'],'Commas separate items in a series.','Misplaced commas in a list.');
add('4.11D.x','201_210','medium','Which sentence uses an apostrophe correctly?','The girl\'s bike is red.',['The girls bike is red.','The girls\'s bike is red.','The girl bike\'s is red.'],'Girl\'s shows one girl owns the bike.','Confused possessive apostrophe placement.');
add('4.11D.x','211_220','hard','Which sentence is punctuated correctly?','I wanted to stay, but the library closed.',['I wanted to stay but, the library closed.','I wanted to stay but the library closed.','I wanted, to stay but the library closed.'],'Use a comma before but when joining two complete thoughts.','Missed or misplaced the comma in a compound sentence.');
add('4.11D.x','221_230','hard','Which dialogue sentence is correct?','"Please wait," said Theo, "for the next bus."',['"Please wait" said Theo "for the next bus."','Please wait," said Theo, "for the next bus."','"Please wait," said Theo "for the next bus".'],'Commas and quotation marks correctly divide the dialogue tag.','Misplaced punctuation around dialogue.');
add('4.11D.x','201_210','medium','Which sentence uses commas correctly?','After lunch, we visited the science lab.',['After lunch we, visited the science lab.','After, lunch we visited the science lab.','After lunch we visited, the science lab.'],'A comma follows the introductory phrase after lunch.','Misplaced the comma after an introductory phrase.');

// 4.11D.xi Spelling high-frequency words
add('4.11D.xi','191_200','easy','Which word is spelled correctly?','because',['becuase','becase','beacuse'],'Because is the correct spelling.','Did not recognize the high-frequency spelling.');
add('4.11D.xi','201_210','medium','Which sentence has no spelling errors?','Their favorite place is the library.',['Thier favorite place is the library.','Their favrite place is the library.','Their favorite plase is the library.'],'Their, favorite, and place are spelled correctly.','Missed a common spelling error.');
add('4.11D.xi','201_210','medium','Which word is spelled correctly?','usually',['usualy','useually','usuely'],'Usually has two l letters.','Chose a common misspelling of a frequent word.');
add('4.11D.xi','211_220','hard','Which sentence is spelled correctly?','I believe the answer is correct.',['I beleive the answer is correct.','I believe the anser is correct.','I believe the answer is corect.'],'Believe, answer, and correct are all spelled correctly.','Failed to spot the misspelled high-frequency word.');

// 4.11C.i Combining
add('4.11C.i','191_200','easy','Which combines the sentences best? Nia drew a map. Zoe labeled it.','Nia drew a map, and Zoe labeled it.',['Nia drew a map Zoe labeled it.','Nia drew a map, Zoe labeled it.','Nia drew a map and. Zoe labeled it.'],'Use comma and and to join two complete sentences.','Created a run-on or fragment while combining.');
add('4.11C.i','201_210','medium','Which is the best compound sentence?','Aarav practiced the song, but he still felt nervous.',['Aarav practiced the song but still nervous.','Aarav practiced the song, he still felt nervous.','But Aarav practiced the song, he still felt nervous.'],'But joins two complete contrasting ideas.','Combined sentences without a proper conjunction.');
add('4.11C.i','201_210','medium','Choose the best way to combine: The rain stopped. We went outside.','The rain stopped, so we went outside.',['The rain stopped we went outside.','The rain stopped, we went outside.','The rain stopped so. We went outside.'],'So shows the result and joins the complete thoughts.','Made a comma splice or fragment.');
add('4.11C.i','211_220','hard','Which sentence combines ideas without changing meaning?','Imani studied the chart, and Theo wrote the summary.',['Imani studied the chart Theo wrote the summary.','Imani studied the chart, Theo wrote the summary.','Imani studied the chart, because Theo wrote the summary.'],'And correctly shows both actions happened.','Used punctuation or conjunction that changes the relationship.');

// 4.11C.ii Boundaries
add('4.11C.ii','191_200','easy','Which is a complete sentence?','The bus arrived early.',['Because the bus arrived early.','The bus arriving early.','When the bus arrived early.'],'A complete sentence has a subject and complete predicate.','Chose a fragment.');
add('4.11C.ii','201_210','medium','Which revision fixes the run-on?','We missed the turn, so we checked the map.',['We missed the turn we checked the map.','We missed the turn, we checked the map.','We missed, the turn we checked the map.'],'Use a comma and conjunction to join complete thoughts.','Left a run-on or comma splice.');
add('4.11C.ii','201_210','medium','Which group of words is a fragment?','After the game ended.',['The game ended late.','We packed the chairs.','Families walked to their cars.'],'After the game ended is incomplete by itself.','Did not notice the dependent word after.');
add('4.11C.ii','211_220','hard','Which revision makes the fragment complete?','Because the trail was muddy, we turned back.',['Because the trail was muddy.','Because muddy trail we turned.','The trail because was muddy.'],'Add an independent clause to complete the idea.','Left a dependent clause as a sentence.');
add('4.11C.ii','221_230','hard','Which sentence fixes the comma splice?','The speaker finished, and the audience clapped.',['The speaker finished, the audience clapped.','The speaker finished the audience clapped.','The speaker, finished the audience clapped.'],'Use a conjunction after the comma to join two sentences.','Used a comma splice or run-on.');

// 4.11C.iii Complete simple/compound
add('4.11C.iii','191_200','easy','Which is a complete simple sentence?','Diego carried the box.',['Carried the box.','Diego carrying.','Because Diego carried.'],'The sentence has a subject and predicate.','Chose an incomplete sentence.');
add('4.11C.iii','201_210','medium','Which is a complete compound sentence?','Maya read the poem, and Ava drew a picture.',['Maya read the poem and Ava.','Maya read, and drew a picture.','Maya read the poem Ava drew.'],'Both sides of the conjunction are complete thoughts.','Chose a sentence missing a subject or predicate.');
add('4.11C.iii','201_210','medium','Which sentence is complete and correct?','The students were quiet, but the hallway was noisy.',['The students was quiet, but the hallway were noisy.','The students quiet, but the hallway noisy.','The students were quiet but.'],'Both clauses are complete and agreement is correct.','Missed agreement or sentence completeness.');
add('4.11C.iii','211_220','hard','Which revision creates a complete sentence?','The book on the table belongs to Theo.',['The book on the table.','On the table belongs to Theo.','The book, belongs, to Theo.'],'The revision adds a predicate to the subject.','Mistook a phrase for a complete sentence.');
add('4.11C.iii','221_230','hard','Which sentence is complete and avoids a run-on?','The hikers stopped, and the guide checked the map.',['The hikers stopped the guide checked the map.','The hikers stopped, the guide checked the map.','The hikers, stopped and the guide, checked the map.'],'A comma and conjunction correctly join the two complete thoughts.','Created a run-on or comma splice.');

// 4.11B.i Organization
add('4.11B.i','191_200','easy','Which sentence would make the best introduction?','School gardens help students learn in many ways.',['That is why gardens are useful.','First, water the plants.','In conclusion, gardens are helpful.'],'An introduction states the main idea.','Chose a detail or conclusion instead of an introduction.');
add('4.11B.i','201_210','medium','Which transition best begins a final paragraph?','In conclusion,',['For example,','Next,','At first,'],'In conclusion signals the ending paragraph.','Chose a transition for a detail or sequence step.');
add('4.11B.i','201_210','medium','Which sentence belongs in a conclusion?','These reasons show why the library should stay open later.',['One reason is that students need computers.','For example, Priya used the printer.','The library opens at nine.'],'A conclusion restates the main idea and wraps up reasons.','Chose a supporting detail instead of a closing idea.');
add('4.11B.i','211_220','hard','Which order is best for an essay?','introduction, reasons, conclusion',['reasons, conclusion, introduction','conclusion, introduction, reasons','introduction, conclusion, reasons'],'A clear essay begins, develops, and ends.','Put essay parts in an illogical order.');

// 4.11B.ii Details
add('4.11B.ii','191_200','easy','Which detail best supports: Exercise helps students focus?','After running, our class listened carefully.',['My shoes are blue.','Lunch was pizza.','The hallway has lockers.'],'The detail directly supports focus after exercise.','Picked an unrelated detail.');
add('4.11B.ii','201_210','medium','Which sentence adds the most specific detail?','The butterfly rested on a milkweed leaf for ten minutes.',['The butterfly was there.','It was nice.','The thing happened outside.'],'Specific details name what, where, and how long.','Chose a vague detail.');
add('4.11B.ii','201_210','medium','Which detail does not belong in a paragraph about recycling?','My cousin plays soccer after school.',['Glass bottles can be reused.','Paper can be sorted into bins.','Recycling keeps some trash out of landfills.'],'The cousin sentence is off topic.','Did not identify the unrelated detail.');
add('4.11B.ii','211_220','hard','Which revision develops the idea best?','The aquifer matters because cities use its water during dry months.',['The aquifer matters a lot.','Water is good.','The aquifer is a thing underground.'],'The best revision explains why the aquifer matters.','Chose a vague or underdeveloped detail.');
add('4.11B.ii','221_230','hard','Which detail best supports an essay about safe biking?','A helmet can protect a rider during a fall.',['My bike is green and shiny.','I like riding after dinner.','The park has many trees.'],'The helmet detail directly supports the idea of safe biking.','Picked an interesting but weak or off-topic detail.');

// 4.3D Homographs/homophones
add('4.3D','191_200','easy','Which sentence uses right correctly?','Turn right at the corner.',['I will right my bike to school.','The right barked loudly.','She ate a right apple.'],'Right can mean the opposite of left.','Chose a sentence where the homograph meaning does not fit.');
add('4.3D','201_210','medium','Choose the meaning of bat in: The bat flew at dusk.','a flying mammal',['a wooden sports tool','to blink','a flat board'],'At dusk and flew show bat means the animal.','Ignored context clues for a homograph.');
add('4.3D','201_210','medium','Choose the correct word: Please ___ your name clearly.','write',['right','rite','wright'],'Write means to form words.','Confused homophones.');
add('4.3D','211_220','hard','Choose the meaning of present: The present speaker is Dr. Lee.','currently here',['a gift','to give formally','the past tense'],'Present describes the speaker who is here now.','Used the wrong meaning of a homograph.');
add('4.3D','221_230','hard','Which sentence uses close as an adjective?','The store is close to my house.',['Please close the door.','They close the store at six.','We will close the meeting now.'],'Close describes distance, so it is an adjective here.','Confused verb and adjective meanings of a homograph.');

// 4.3E Thesaurus
add('4.3E','191_200','easy','Which word is the best synonym for happy?','joyful',['angry','tired','silent'],'Joyful has a similar meaning to happy.','Chose an antonym or unrelated word.');
add('4.3E','201_210','medium','Which word could replace tiny?','small',['huge','heavy','late'],'Small is a synonym for tiny.','Confused synonym with antonym or unrelated word.');
add('4.3E','201_210','medium','A thesaurus would help you find ___.','a stronger word for said',['the page number of a chapter','the pronunciation of a word','the capital of Texas'],'A thesaurus lists synonyms and related words.','Confused a thesaurus with other reference tools.');
add('4.3E','211_220','hard','Which word best replaces walked in: Hana walked quietly into the room?','tiptoed',['sprinted','shouted','dropped'],'Tiptoed gives a more exact quiet way of walking.','Chose a word that changes the meaning.');
add('4.3E','221_230','hard','Which replacement keeps the meaning but improves precision? The storm was big.','The storm was enormous.',['The storm was tiny.','The storm was cheerful.','The storm was wooden.'],'Enormous is a more precise synonym for big.','Chose an antonym or nonsensical replacement.');

if (items.length !== 100) {
  throw new Error(`Expected 100 questions, got ${items.length}`);
}

const counts = items.reduce((acc, x) => {
  acc[x.teks_code] = (acc[x.teks_code] || 0) + 1;
  return acc;
}, {});

const dollar = (tag, value) => `$${tag}$${String(value).replaceAll(`$${tag}$`, '')}$${tag}$`;
function sqlFor(rows) {
  const values = rows.map((x, i) => `(${i + 1},${dollar('code', x.teks_code)},'${x.rit_band}'::map_rit_band,'${x.difficulty}'::map_difficulty,${dollar('stem', x.stem)},NULL,${dollar('exp', x.explanation)},${dollar('src', x.source_note)},${dollar('choices', JSON.stringify(x.choices))}::jsonb)`).join(',\n');
  return `with seed(ord,teks_code,rit_band,difficulty,stem,stem_image_svg,explanation,source_note,choices) as (values\n${values}\n), ins as (\n  insert into map_questions(subject,grade,standard_id,passage_id,rit_band,difficulty,stem,stem_image_svg,audio_supported,explanation,source_note,is_active,question_format)\n  select 'language'::map_subject,4,s.id,null,seed.rit_band,seed.difficulty,seed.stem,seed.stem_image_svg,true,seed.explanation,seed.source_note,true,'mcq'\n  from seed\n  join map_standards s on s.grade=4 and s.subject='language'::map_subject and s.teks_code=seed.teks_code\n  where not exists (\n    select 1 from map_questions q\n    where q.grade=4 and q.subject='language'::map_subject and q.source_note=seed.source_note and q.stem=seed.stem and q.explanation=seed.explanation\n  )\n  returning id, stem, explanation, source_note\n)\ninsert into map_question_choices(question_id,label,body,body_image_svg,is_correct,misconception,misconception_tag,sort_order)\nselect ins.id,c.label,c.body,null,c.is_correct,c.misconception,c.misconception_tag,c.sort_order\nfrom ins\njoin seed on seed.stem=ins.stem and seed.explanation=ins.explanation and seed.source_note=ins.source_note\ncross join lateral jsonb_to_recordset(seed.choices) as c(label char(1), body text, is_correct boolean, misconception text, misconception_tag text, sort_order smallint);`;
}

fs.writeFileSync(path.join(outDir, 'grade4_language_usage.json'), JSON.stringify(items, null, 2));
for (let i = 0; i < items.length; i += 20) {
  fs.writeFileSync(path.join(outDir, `batch${i / 20 + 1}.sql`), sqlFor(items.slice(i, i + 20)));
}
console.log(JSON.stringify({ total: items.length, counts, batches: Math.ceil(items.length / 20), outDir }, null, 2));
