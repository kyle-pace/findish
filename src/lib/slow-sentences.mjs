// Sentences built to be slow, for the tests of the search rules and the MCP search. The
// pattern that once read "no …" tried every way of splitting what followed: 96 characters
// took 42 seconds. /mcp takes 200 characters from anyone, and so does a ?q= link.
export const SLOW_SENTENCES = [
  `no ${'a or '.repeat(60)}`.slice(0, 197) + ' 1',
  `without ${'a and '.repeat(60)}`.slice(0, 197) + ' 1',
  `no ${'a, '.repeat(80)}`.slice(0, 197) + ' 1',
  `no ${'a , b or c and '.repeat(20)}`.slice(0, 197) + ' 1',
  `hold the ${'or '.repeat(70)}`.slice(0, 197) + ' 1',
  `no ${'a '.repeat(100)}`.slice(0, 197) + ' 1',
  'no a '.repeat(40),
  `not ${'and or '.repeat(30)}`.slice(0, 198) + '!',
  `with ${'a, b & c or '.repeat(20)}`.slice(0, 197) + ' 1',
  `${'no pork, '.repeat(22)}`.slice(0, 198) + ' 1',
];
