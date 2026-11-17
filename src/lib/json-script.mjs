// JSON for the inside of a <script> element (JSON-LD, the index's file names). The pages
// put it there with set:html, which writes it as it is, and a recipe's name comes from
// another site: one called "…</script><script>…" would end the element and run. So the
// characters HTML could read as markup are written as \u escapes, which JSON reads back as
// the same text: <, > and &, and the two line separators that old script parsers choke on.

const ESCAPES = { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' };

/** JSON.stringify, safe to put inside <script type="application/ld+json">. */
export function jsonForScript(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (c) => ESCAPES[c]);
}
