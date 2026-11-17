// The search rules the page, the MCP server and Ask share (src/lib/search-core.mjs).
// The word rules are checked on their own; everything else runs against the real index
// (built from data/ if it isn't there), with checks loose enough to survive a weekly crawl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeWords, creatorFor, creatorMatches, ingredientFor, looksLikeAsk, prepare, queryWords, search, searchVideos, stem, understand, viaIngredient, words, queryFor } from './search-core.mjs';
import { soleQuery, sortHits } from './page-state.mjs';
import { realIndex } from './test-index.mjs';
import { SLOW_SENTENCES } from './slow-sentences.mjs';

const index = realIndex();
const ready = prepare(index);
const blank = () => ({ q: '', with: [], without: [], notWords: [], sites: new Set(), time: 0, cuisine: '', course: '', fresh: false, diet: '', exact: false, show: '' });
const find = (f, opts) => search(ready, { ...blank(), ...f }, opts);
const names = (hits, n = 5) => hits.slice(0, n).map((h) => h.r.name);
const ing = (id) => ready.ing.findIndex((g) => g[0] === id);
const ids = (ps) => ps.map((p) => ready.ing[p][0]);
const said = (text, opts) => {
  const u = understand(ready, text, opts);
  return { ...u, with: ids(u.with), without: ids(u.without) };
};

// --- words ---------------------------------------------------------------------------

test('singular and plural share a stem: cookie and cookies, pie and pies, leaf and leaves', () => {
  for (const [a, b] of [['cookie', 'cookies'], ['pie', 'pies'], ['brownie', 'brownies'], ['smoothie', 'smoothies'], ['veggie', 'veggies'], ['leaf', 'leaves'], ['loaf', 'loaves'], ['berry', 'berries'], ['tomato', 'tomatoes'], ['sandwich', 'sandwiches'], ['dish', 'dishes'], ['olive', 'olives'], ['clove', 'cloves'], ['quiche', 'quiches'], ['taco', 'tacos'], ['noodle', 'noodles']])
    assert.equal(stem(a), stem(b), `${a} / ${b}`);
});

test('fries are not a fry, and words that only look plural are left alone', () => {
  assert.notEqual(stem('fries'), stem('fry'));
  for (const w of ['hummus', 'couscous', 'swiss', 'asparagus', 'brie', 'pho', 'gas']) assert.equal(stem(w), w);
});

test('every word in a recipe name that has a plural in another name shares its stem', () => {
  const seen = new Set(index.recipes.flatMap((r) => r[1].toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3)));
  const apart = [];
  for (const w of seen) {
    if (w.endsWith('s')) continue;
    for (const plural of [`${w}s`, `${w}es`]) if (seen.has(plural) && stem(plural) !== stem(w) && plural !== 'fries') apart.push(`${w}/${plural}`);
  }
  // A handful of pairs aren't the same word at all ("glass"/"glasses" would be, "mas"/"mass" not).
  assert.ok(apart.length <= 6, `stem apart: ${apart.join(', ')}`);
});

test('words are lowercase, accent-free and split on anything that is not a letter or number', () => {
  assert.deepEqual(words('Scallions, chopped!'), ['scallion', 'chopped']);
  assert.deepEqual(words('Jalapeños & tomatoes'), ['jalapeno', 'tomato']);
  assert.deepEqual(words("Kenji's López-Alt"), ['kenjis', 'lopez', 'alt']);
});

test('other scripts are kept as words: Chinese, Korean, Japanese and Thai', () => {
  assert.deepEqual(words('麻婆豆腐 Mapo Tofu'), ['麻婆豆腐', 'mapo', 'tofu']);
  assert.equal(words('김치찌개').length, 1);
  assert.equal(words('ข้าวมันไก่').length, 1, 'Thai vowel marks stay inside the word');
  assert.deepEqual(words('!!! ??? ...'), []);
});

test('spellings that mean the same thing are one word', () => {
  for (const group of [['chili', 'chilli', 'chile', 'chilies', 'chillies'], ['yogurt', 'yoghurt'], ['donut', 'doughnut', 'doughnuts'], ['bbq', 'barbecue'], ['jjigae', 'jigae', 'chigae'], ['tteokbokki', 'ddukbokki', 'topokki'], ['lasagna', 'lasagne']])
    assert.equal(new Set(group.map((w) => words(w)[0])).size, 1, group.join(' '));
});

// --- the words a search matches on -------------------------------------------------------

test('a search in another script finds names that hold it, not everything', () => {
  const hits = find({ q: '麻婆豆腐' });
  assert.ok(hits.length >= 1 && hits.length < 50);
  assert.ok(hits.every((h) => h.r.name.includes('麻婆豆腐')));
  assert.ok(find({ q: '麻婆' }).length >= hits.length, 'a piece of a name matches too');
});

test('a search with no words in it finds nothing, not the whole index', () => {
  assert.equal(find({ q: '???' }).length, 0);
  assert.equal(find({ q: '!!! ...' }).length, 0);
  assert.equal(searchVideos(ready, { ...blank(), q: '???' }).length, 0);
});

test('after Enter a word is a whole word; while typing the last one can be unfinished', () => {
  const gin = find({ q: 'gin' });
  assert.ok(gin.length > 0 && gin.length < 60, `gin found ${gin.length}`);
  assert.ok(find({ q: 'gin' }, { typing: true }).length > 10 * gin.length, 'typing "gin" is on the way to ginger');
  assert.ok(find({ q: 'bun' }).length < find({ q: 'bun' }, { typing: true }).length);
});

test('a word that is only the start of others still finds them after Enter', () => {
  assert.ok(find({ q: 'dumpl' }).length > 20);
});

test('an unfinished word never matches inside an ingredient’s other names', () => {
  // "pea" is a word; it must not find recipes just because they use peanuts.
  const whole = new Set(ready.ingWord.get('pea') || []);
  const peanuts = ing('peanuts');
  assert.ok(!whole.has(peanuts));
  for (const h of find({ q: 'pea' }, { typing: true })) {
    const inWords = [...h.r.title, ...h.r.other].some((w) => w.startsWith('pea'));
    assert.ok(inWords || [...h.r.pos].some((p) => whole.has(p)), `${h.r.name} only uses peanuts`);
  }
});

test('filler words are ignored, unless they are all there is', () => {
  assert.deepEqual(queryWords(ready, 'easy mapo tofu recipe').words, ['mapo', 'tofu']);
  assert.deepEqual(queryWords(ready, 'everything that you have').words.length > 0, true);
  assert.deepEqual(queryWords(ready, 'easy dinner').words, ['easy', 'dinner']);
  assert.ok(find({ q: 'easy dinner' }).length > 0);
});

test('typos are fixed to the nearest word that fits, not a commoner one', () => {
  assert.deepEqual(queryWords(ready, 'dumpligns').words, ['dumpling']);
  assert.deepEqual(queryWords(ready, 'chiken parmesean').words, ['chicken', 'parmesan']);
  assert.equal(closeWords(ready, 'kimchii')[0], 'kimchi');
  assert.notEqual(queryWords(ready, 'kimchee stew').words[0], 'kitchen');
  assert.equal(queryWords(ready, 'kimchee stew').words[0], 'kimchi');
});

test('nonsense finds nothing instead of being "corrected"', () => {
  const q = queryWords(ready, 'xyzzy plugh');
  assert.deepEqual(q.fixes, []);
  assert.equal(find({ q: 'xyzzy plugh' }).length, 0);
  assert.equal(find({ q: 'xyzzy plugh' }, { loose: true }).length, 0);
});

test('two words the index writes as one are joined, and one it writes as two is split', () => {
  assert.deepEqual(queryWords(ready, 'pot sticker').words, ['potsticker']);
  assert.deepEqual(queryWords(ready, 'meat ball').words, ['meatball']);
  assert.deepEqual(queryWords(ready, 'stirfry').words, ['stir', 'fry']);
  assert.deepEqual(queryWords(ready, 'hot pot').words, ['hot', 'pot'], 'a pair that works as typed is left alone');
});

test('a real word one letter off is fixed when the search would find almost nothing', () => {
  const q = queryWords(ready, 'pad tai');
  assert.deepEqual(q.words, ['pad', 'thai']);
  assert.deepEqual(q.fixes, [['tai', 'thai']]);
  assert.ok(find({ q: 'pad tai' }).length > 30);
  assert.deepEqual(queryWords(ready, 'pad tai', { exact: true }).words, ['pad', 'tai'], '"search for exactly this" turns it off');
});

test('a word nothing has is dropped when something else carries the search, and said', () => {
  const q = queryWords(ready, 'kimchi blorpzz');
  assert.deepEqual(q.words, ['kimchi']);
  assert.deepEqual(q.ignored, ['blorpzz']);
  assert.ok(find({ q: 'kimchi blorpzz' }).length > 5);
  // With an ingredient tag carrying it, leftover words nothing has don't zero the search.
  assert.ok(find({ q: 'blorpzz', with: [ing('kimchi')] }).length > 5);
});

// --- understanding a sentence ----------------------------------------------------------

test('filler around a creator and an ingredient does not zero the search', () => {
  const u = said('everything Maangchi has with kimchi');
  assert.deepEqual([u.q, u.sites, u.with], ['', ['maangchi'], ['kimchi']]);
});

test('typed, pasted and "i have" ingredient lists come out the same', () => {
  const want = ['eggplant', 'tofu', 'green-onion'];
  assert.deepEqual(said('eggplant, tofu, scallions').with, want);
  assert.deepEqual(said('eggplant, tofu and scallions').with, want);
  assert.deepEqual(said('i have eggplant, tofu and scallions').with, want);
  assert.deepEqual(said("I've got eggplant, tofu, scallions").with, want);
  assert.deepEqual(said('using eggplant tofu and scallions').with, want);
  for (const text of ['eggplant, tofu, scallions', 'i have eggplant, tofu and scallions']) assert.equal(said(text).q, '', text);
  // Once a comma has made a tag, the rest of the list carries on without one.
  assert.deepEqual(said('tofu and scallions', { list: true }).with, ['tofu', 'green-onion']);
  assert.deepEqual(said('scallions', { list: true }).with, ['green-onion']);
  // ...but on its own, "chicken and rice" is a dish.
  assert.deepEqual(said('chicken and rice').with, []);
});

test('a sentence becomes tags and filters', () => {
  const u = said('something quick with chicken thighs and rice, under 30 minutes');
  assert.deepEqual([u.q, u.time, u.with], ['', 30, ['chicken-thighs', 'rice']]);
  assert.deepEqual(said('what can i make with fish, kimchi and onions').with, ['fish', 'kimchi', 'onion']);
});

test('a number in a dish’s name is not a time limit', () => {
  assert.equal(said('7 minute eggs').time, 0);
  assert.equal(said('7 minute eggs').q, '7 minute eggs');
  assert.equal(said('30 minute chicken').time, 30);
  assert.equal(said('soup in 5 minutes').time, 5);
  assert.equal(said('1 hour roast').time, 60);
});

test('"not" only leaves something out before an ingredient', () => {
  const u = said('not your average chili');
  assert.deepEqual([u.without, u.notWords], [[], []]);
  assert.equal(u.q, 'not your average chili');
  assert.deepEqual(said('curry not pork').without, ['any-pork']);
  assert.deepEqual(said('no knead bread').q, 'no knead bread');
});

test('leaving out: an ingredient by its own name, a group, or a word in the name', () => {
  // "Pork" is the group (bacon, ham and lard too), not just the cut.
  assert.deepEqual(said('curry no pork').without, ['any-pork']);
  assert.deepEqual(said('curry no peanuts').without, ['peanuts']);
  assert.deepEqual(said('pasta no dairy').without, ['any-dairy']);
  assert.deepEqual(said('nut free dessert').without, ['any-nuts']);
  assert.deepEqual(said('dairy-free pasta').q, 'pasta');
  // Cilantro is filed under fresh herbs: leaving out every herb isn't what was asked.
  const u = said('salsa without cilantro');
  assert.deepEqual([u.without, u.notWords], [[], ['cilantro']]);
  assert.equal(said('no meat noodles').diet, 'vegetarian');
});

test('"have a cold" is not an ingredient phrase', () => {
  const u = said('soup for when you have a cold');
  assert.deepEqual(u.with, []);
  assert.match(u.q, /cold/);
});

test('after a dish, only an ingredient’s own name becomes a tag', () => {
  const u = said('pasta with tomato sauce');
  assert.deepEqual(u.with, []);
  assert.equal(u.q, 'pasta with tomato sauce');
  assert.deepEqual(said('noodles with tofu and eggs').with, ['tofu', 'eggs']);
});

test('course words, "videos" and cuisines said as one are understood', () => {
  assert.equal(said('vegan dessert').course, 'dessert');
  assert.deepEqual([said('thai desserts').cuisine, said('thai desserts').course], ['Thai', 'dessert']);
  assert.deepEqual([said('chocolate dessert').q, said('chocolate dessert').course], ['chocolate', 'dessert']);
  assert.equal(said('korean side dishes').course, 'side');
  assert.equal(said('breakfast').course, 'breakfast');
  assert.equal(said('breakfast burrito').course, '', 'a dish, not a course');
  assert.deepEqual([said('ramen videos').q, said('ramen videos').show], ['ramen', 'videos']);
  assert.equal(said('korean food').cuisine, 'Korean');
  assert.equal(said('mexican dinner ideas').cuisine, 'Mexican');
  assert.equal(said('quick korean').cuisine, 'Korean');
  assert.equal(said('thai').cuisine, '', 'a bare cuisine word stays a word');
  assert.equal(said('thai').q, 'thai');
});

test('a search that is only filler keeps its words', () => {
  assert.equal(said('easy dinner').q, 'easy dinner');
  assert.equal(said('recipe').q, 'recipe');
  assert.equal(said('quick dinner').q, '', 'filler goes when something else was understood');
  assert.equal(said('quick dinner').time, 30);
});

// --- creators -----------------------------------------------------------------------

test('a creator is recognised by full name, without "the", and by other names, longest first', () => {
  assert.deepEqual([said('hot thai kitchen pad thai').sites, said('hot thai kitchen pad thai').q], [['htk'], 'pad thai']);
  assert.deepEqual([said('smitten kitchen cake').sites, said('smitten kitchen cake').q], [['sk'], 'cake']);
  assert.deepEqual(said('woks of life dumplings').sites, ['woks']);
  assert.deepEqual(said('the woks of life dumplings').q, 'dumplings');
  assert.deepEqual(said('pailin curry').sites, ['htk']);
  assert.deepEqual(said('nagi lasagna').sites, ['rte']);
  assert.deepEqual(said('deb perelman cake').sites, ['sk']);
  assert.deepEqual(said('recipetin japan curry').sites, ['rtj'], 'the longer name wins over "recipetin"');
  assert.deepEqual(said("kenji's fried rice").sites, ['kenji']);
});

test('a creator’s name comes before a cuisine, and "lau" needs "from" or "by"', () => {
  const u = said('chinese cooking demystified mapo tofu');
  assert.deepEqual([u.sites, u.cuisine, u.q], [['ccd'], '', 'mapo tofu']);
  assert.deepEqual(said('lau lau').sites, []);
  assert.deepEqual(said('noodles from lau').sites, ['mwl']);
  assert.equal(said('french cooking').cuisine, 'French');
});

test('creators are looked up by exact name, and suggested as they are typed', () => {
  assert.equal(creatorFor(ready, 'Pailin'), 'htk');
  assert.equal(creatorFor(ready, 'woks of life'), 'woks');
  assert.equal(creatorFor(ready, 'a'), null);
  assert.ok(creatorMatches(ready, 'pail').some((c) => c.id === 'htk'));
  assert.ok(creatorMatches(ready, 'hot th').some((c) => c.id === 'htk'));
  // Name words and other-name words aren't mixed: "kitchen pailin" is nobody.
  assert.equal(creatorMatches(ready, 'thai pailin').length, 0);
});

test('an ingredient’s own name wins over another item’s other name', () => {
  assert.equal(ready.ing[ingredientFor(ready, 'scallions')][0], 'green-onion');
  assert.equal(ingredientFor(ready, 'cilantro', true), null);
  assert.notEqual(ingredientFor(ready, 'cilantro'), null);
});

// --- diet ---------------------------------------------------------------------------

test('vegetarian and vegan searches leave out meat, fish, dairy and eggs named anywhere', () => {
  const meat = /\b(chicken|beef|pork|bacon|lamb|shrimp|prawns?|salmon|tuna|sausage|meatballs?)\b/i;
  const plant = /vegan|vegetarian|mock|“|"/i;
  for (const q of ['fried chicken', 'chicken', 'pork', 'salmon', 'meatballs']) {
    const leaked = find({ q, diet: 'vegetarian' }).filter((h) => meat.test(h.r.name) && !plant.test(h.r.name));
    assert.deepEqual(names(leaked), [], `vegetarian "${q}"`);
  }
  for (const h of find({ diet: 'vegan' })) assert.ok(!/\b(cheese|omelet|custard|affogato|ice cream|buttermilk)\b/i.test(h.r.name) || /vegan|tofu|plant/i.test(h.r.name), h.r.name);
  assert.ok(find({ diet: 'vegetarian' }).length > 1500);
  assert.ok(find({ diet: 'vegan' }).length > 500);
});

test('a recipe with no ingredient list is not offered as vegetarian or free of anything', () => {
  const none = ready.recipes.filter((r) => r.flags === 255);
  const veg = new Set(find({ diet: 'vegetarian' }).map((h) => h.r.i));
  const noNuts = new Set(find({ without: [ing('any-nuts')] }).map((h) => h.r.i));
  for (const r of none) assert.ok(!veg.has(r.i) && !noNuts.has(r.i), r.name);
});

test('a group can be left out: no dairy, no nuts, no shellfish', () => {
  const dairy = find({ q: 'pasta', without: [ing('any-dairy')] });
  assert.ok(dairy.length > 5 && dairy.length < find({ q: 'pasta' }).length);
  assert.ok(dairy.every((h) => !/\b(cheese|cream|parmesan|butter|alfredo)\b/i.test(h.r.name.replace(/peanut butter/i, ''))), names(dairy.filter((h) => /cheese|cream|parmesan|butter/i.test(h.r.name))).join());
  assert.ok(find({ q: 'cookies', without: [ing('any-nuts')] }).every((h) => !/\b(peanut|almond|walnut|pecan|hazelnut|pistachio)/i.test(h.r.name)));
});

// --- videos -------------------------------------------------------------------------

const videos = (f, opts) => searchVideos(ready, { ...blank(), ...f }, opts);

test('videos match on their title, never on the channel’s name', () => {
  const thai = videos({ q: 'thai' });
  assert.ok(thai.length > 0);
  assert.ok(thai.every((v) => /thai/i.test(v[1])), 'every "thai" video says thai in its title');
  assert.equal(videos({ q: 'kitchen sink blorpzz' }).filter((v) => !/kitchen/i.test(v[1])).length, 0);
});

test('videos rank by how well the title matches, with the exact phrase first', () => {
  const top = videos({ q: 'pad thai' }).slice(0, 5);
  assert.ok(top.every((v) => /pad thai/i.test(v[1])), top.map((v) => v[1]).join(' | '));
});

test('videos honour what is left out and the diet', () => {
  const pork = ing('pork');
  assert.ok(videos({ q: 'belly' }).some((v) => /pork/i.test(v[1])));
  assert.ok(videos({ q: 'belly', without: [pork] }).every((v) => !/\bpork\b/i.test(v[1])));
  const veg = videos({ q: 'fried rice', diet: 'vegetarian' });
  assert.ok(veg.length > 0 && veg.length < videos({ q: 'fried rice' }).length);
  assert.ok(veg.every((v) => !/\b(chicken|pork|beef|shrimp|bacon|crab)\b/i.test(v[1])), veg.map((v) => v[1]).filter((t) => /chicken|pork|beef|shrimp|bacon|crab/i.test(t)).join(' | '));
  assert.ok(videos({ q: 'curry', notWords: ['chicken'] }).every((v) => !/\bchickens?\b/i.test(v[1])));
});

test('videos have no cooking time, so a time limit shows none; a cuisine goes by the channel', () => {
  assert.equal(videos({ q: 'ramen', time: 30 }).length, 0);
  const korean = videos({ q: 'kimchi', cuisine: 'Korean' });
  assert.ok(korean.length > 0 && korean.length < videos({ q: 'kimchi' }).length);
});

test('a creator with only a channel shows their videos', () => {
  assert.ok(videos({ sites: new Set(['maangchi']) }).length > 100);
  assert.ok(videos({ q: 'kimchi', sites: new Set(['maangchi']) }).length > 5);
});

// --- Ask ----------------------------------------------------------------------------

test('a question goes to Ask; a dish name that starts like one does not', () => {
  for (const t of ['what can I make with fish and kimchi', 'something quick and vegetarian for dinner', 'how do I make dumplings', 'make it vegetarian please', 'any ideas for leftover rice tonight?', 'i have chicken thighs and rice for dinner'])
    assert.ok(looksLikeAsk(t), t);
  for (const t of ["my mom's chicken soup", 'red braised pork belly', 'any day dal', 'mapo tofu', 'more cheese pizza', 'my best pork dumplings']) assert.ok(!looksLikeAsk(t), t);
});

// --- links and rows ------------------------------------------------------------------

test('a link with only ?q= finds what typing the sentence finds (the SearchAction hands out such links)', () => {
  const link = '?q=quick+vegetarian+dinner+without+mushrooms';
  // What the page does with a fresh link: read the sentence, then search.
  const u = understand(ready, soleQuery(link));
  assert.equal(u.diet, 'vegetarian');
  assert.equal(u.time, 30);
  assert.ok(u.without.length + u.notWords.length > 0, 'mushrooms are left out');
  const typed = find({ q: u.q, diet: u.diet, time: u.time, without: u.without, notWords: u.notWords, with: u.with }, { count: true });
  // Before the fix the link searched the raw words: no diet, no time limit, mushrooms wanted.
  const raw = find({ q: 'quick vegetarian dinner without mushrooms' });
  assert.ok(typed > 50, `the sentence finds plenty (${typed})`);
  assert.ok(!raw.length || raw.some((h) => /mushroom/i.test(h.r.name)), 'the raw words look for mushrooms');
  assert.notEqual(typed, raw.length);
  // A link the page wrote itself keeps q as plain words.
  assert.equal(soleQuery('?q=dinner&diet=vegetarian&time=30'), '');
});

test('a word that only matched an ingredient is named: "Uses chicken thighs"', () => {
  const f = { ...blank(), q: 'chicken thighs' };
  const terms = queryFor(ready, f).terms;
  const hits = find(f);
  const named = hits.filter((h) => /chicken/i.test(h.r.name) && /thigh/i.test(h.r.name));
  for (const h of named.slice(0, 5)) assert.deepEqual(viaIngredient(ready, h.r, terms), [], h.r.name);
  const quiet = hits.filter((h) => !/thigh/i.test(h.r.name) && viaIngredient(ready, h.r, terms).length);
  assert.ok(quiet.length > 0, 'some recipes only use them');
  for (const h of quiet.slice(0, 10)) {
    const ps = viaIngredient(ready, h.r, terms);
    for (const p of ps) assert.ok(h.r.pos.has(p), `${h.r.name} uses ${ready.ing[p][1]}`);
  }
  assert.deepEqual(viaIngredient(ready, hits[0].r, []), []);
});

// --- sentences built to be slow -----------------------------------------------------------

test('a 200-character sentence made to be slow is understood in well under 50 ms', () => {
  understand(ready, 'no pork'); // the first call sets up the creators' names
  for (const text of SLOW_SENTENCES) {
    assert.equal(text.length <= 200, true);
    const start = performance.now();
    understand(ready, text);
    understand(ready, text, { list: true });
    const took = performance.now() - start;
    assert.ok(took < 50, `${took.toFixed(0)} ms for ${JSON.stringify(text.slice(0, 40))}…`);
  }
});

test('a long "no …" list still leaves things out, and stops at eight', () => {
  const u = said('curry no pork, peanuts or shrimp');
  assert.deepEqual(u.without.length, 3);
  assert.equal(u.q, 'curry');
  const many = understand(ready, `no ${'abc, abd, abe, abf, abg, abh, abi, abj, abk, abl'}`);
  assert.equal(many.notWords.length, 8);
  assert.match(many.q, /abk abl/);
});

test('a comma before "with" ends what is left out, so "no pork, with tofu" still asks for tofu', () => {
  const u = said('no pork, with tofu');
  assert.deepEqual(u.with, ['tofu']);
  assert.equal(u.without.length, 1);
  assert.equal(u.q, '');
});

test('asking for only the first four gives the same four as the whole search, and how many matched', () => {
  for (const q of ['c', 'ch', 'chicken', 'chicken so', 'rice', 'tofu', 'pad t', 'easy', 'salad', 'no', 'mapo tofu', 'zzzz']) {
    for (const extra of [{}, { diet: 'vegetarian' }, { with: [ing('eggs')] }, { with: [ing('eggs'), ing('tofu')] }]) {
      const f = { ...blank(), q, ...extra };
      const whole = search(ready, f, { typing: true });
      const few = search(ready, f, { typing: true, first: 4 });
      assert.deepEqual(few.map((h) => h.r.key), whole.slice(0, 4).map((h) => h.r.key), `${q} ${JSON.stringify(extra)}`);
      assert.equal(few.total, whole.length, q);
    }
  }
});

test('"veggie" means vegetarian, but not beside meat, and "veggie burger" keeps its words', () => {
  const stir = said('chicken veggie stir fry');
  assert.equal(stir.diet, '');
  assert.equal(stir.q, 'chicken veggie stir fry');
  assert.ok(find({ q: stir.q }).length > 0 || find({ q: stir.q }, { loose: true }).length > 0, 'it finds something');
  assert.equal(said('beef and veggie soup').diet, '');
  const pasta = said('veggie pasta');
  assert.equal(pasta.diet, 'vegetarian');
  assert.equal(pasta.q, 'pasta');
  const burger = said('veggie burger');
  assert.equal(burger.diet, 'vegetarian');
  assert.equal(burger.q, 'veggie burger');
  assert.equal(said('quick veggie dinner').diet, 'vegetarian');
  assert.equal(said('vegan chicken').diet, 'vegan');
});

test('a word finds an ingredient only by its whole name, not a word of one of its other names', () => {
  const uses = (q, id) => find({ q }).filter((h) => !h.named && h.r.pos.has(ing(id))).length;
  // "salad onions" is another name for green onions; "salad" alone isn't asking for them.
  const salad = find({ q: 'salad' });
  assert.ok(salad.length < 600, `salad: ${salad.length}`);
  assert.ok(salad.filter((h) => h.named).length > salad.length * 0.7);
  assert.ok(find({ q: 'stir fry' }).length < 400);
  assert.ok(find({ q: 'bun' }).length < 100);
  assert.ok(!names(find({ q: 'tacos' }), 200).some((n) => /char siu/i.test(n)));
  // Chicken broth concentrate isn't chicken; chicken thighs are.
  const chicken = find({ q: 'chicken' });
  assert.ok(chicken.length < 1000, `chicken: ${chicken.length}`);
  assert.ok(chicken.some((h) => !h.named && h.r.pos.has(ing('chicken-thighs'))));
  // The whole name still finds what uses it, by any of its names, and in any state.
  for (const q of ['scallions', 'green onion', 'spring onions', 'coriander', 'fish sauce', 'pak choi', 'aubergine']) assert.ok(find({ q }).length > 50, q);
  assert.ok(uses('scallions', 'green-onion') > 500);
  assert.ok(uses('fish sauce', 'fish-sauce') > 100);
});

test('the quickest and the newest keep recipes named for the search above ones that only use it', () => {
  for (const q of ['dumplings', 'curry', 'chicken', 'salad']) {
    for (const order of ['quickest', 'newest']) {
      const sorted = sortHits(find({ q }), order);
      const firstOther = sorted.findIndex((h) => !h.named);
      assert.ok(firstOther === -1 || sorted.slice(firstOther).every((h) => !h.named), `${q} ${order}`);
      const top = sorted.slice(0, 8);
      for (const h of top) assert.ok(words(h.r.name).some((w) => words(q).includes(w)), `${q} ${order}: ${h.r.name}`);
    }
  }
  const quick = sortHits(find({ q: 'dumplings' }), 'quickest').filter((h) => h.named);
  for (let i = 1; i < quick.length; i++) assert.ok((quick[i - 1].r.min ?? 1e9) <= (quick[i].r.min ?? 1e9));
});

test('a number of minutes in a dish’s name is set aside when nothing is called that', () => {
  const q = queryWords(ready, '7 minute eggs');
  assert.deepEqual(q.words, ['egg']);
  assert.deepEqual(q.ignored, ['7 minute']);
  const hits = find({ q: '7 minute eggs' });
  assert.ok(hits.length >= find({ q: 'eggs' }).length, 'no worse than plain "eggs"');
  assert.ok(hits.length > 50);
  // A name that has the number keeps it.
  const real = ready.recipes.find((r) => /^\d+[- ]minute /i.test(r.name));
  if (real) assert.equal(queryWords(ready, real.name).ignored.length, 0, real.name);
  assert.deepEqual(queryWords(ready, '7 minute eggs', { exact: true }).ignored, []);
});

test('a question’s own words are not searched for: steps, instructions, "goes with", "my mom’s"', () => {
  assert.deepEqual(queryWords(ready, 'how do I make mapo tofu step by step instructions').words, ['mapo', 'tofu']);
  assert.ok(find({ q: 'how do I make mapo tofu step by step instructions' }).length >= 5);
  assert.deepEqual(queryWords(ready, 'what goes with bulgogi').words, ['bulgogi']);
  assert.ok(!/pop goes/i.test(names(find({ q: 'what goes with bulgogi' }), 1)[0]));
  const mom = queryWords(ready, 'my mom’s chicken soup');
  assert.deepEqual(mom.words, ['chicken', 'soup']);
  assert.deepEqual(mom.fixes, []);
});
