import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseOf, COURSES } from './course.mjs';

test('site labels fold into a few courses', () => {
  assert.equal(courseOf('Main Course', 'Pad Krapow'), 'main');
  assert.equal(courseOf('Dinner', 'Tacos'), 'main');
  assert.equal(courseOf('Pork', 'Mapo Tofu'), 'main'); // The Woks of Life files by ingredient
  assert.equal(courseOf('Vegetables', 'Stir-fried Bok Choy'), 'side');
  assert.equal(courseOf('Sides &amp; Salads', 'Coleslaw'), 'side');
  assert.equal(courseOf('Appetiser', 'Prawn Toast'), 'starter');
  assert.equal(courseOf('Sweets and Desserts', 'Mango Pudding'), 'dessert');
  assert.equal(courseOf('Beverages', 'Hong Kong Milk Tea'), 'drink');
  assert.equal(courseOf('Sauces & Condiments', 'Pesto'), 'sauce');
});

test('a mixed shelf goes by the name', () => {
  assert.equal(courseOf('Soups & Sandwiches', 'Tomato Soup'), 'soup');
  assert.equal(courseOf('Soups & Sandwiches', 'Big Cheese Squeeze'), 'main');
});

test('no label: only a plain name decides', () => {
  assert.equal(courseOf('', 'Hot and Sour Soup'), 'soup');
  assert.equal(courseOf('', 'Chili Oil'), 'sauce');
  assert.equal(courseOf('', 'Brown Butter Chocolate Chip Cookies'), 'dessert');
  assert.equal(courseOf('', 'Smashed Cucumber Salad'), 'side');
});

test('a dish served with a sauce is not a sauce, and unclear stays unlabeled', () => {
  assert.equal(courseOf('', 'Sichuan Spareribs With Mala BBQ Sauce'), '');
  assert.equal(courseOf('', 'Japanese Salmon with Mirin and Soy Sauce'), '');
  assert.equal(courseOf('', 'Tortilla de Patatas (Tortilla Española)'), '');
  assert.equal(courseOf('', 'Steamed Black Cod'), '');
  assert.equal(courseOf(undefined, undefined), '');
});

test('a plain name beats a main or side label', () => {
  assert.equal(courseOf('Salads', 'All-Purpose Thai Salad Dressing'), 'sauce');
  assert.equal(courseOf('Salad', 'Authentic Thai Peanut Dressing (Salad Kaeg)'), 'sauce');
  assert.equal(courseOf('Main Course', 'Homemade Thai Green Curry Paste'), 'sauce');
  assert.equal(courseOf('Side Dish', 'Almond Agar Jelly & Fruit Salad (Almond Float)'), 'dessert');
  assert.equal(courseOf('Salad', 'Thai Salad with Chicken and Lime Peanut Dressing'), 'side');
  assert.equal(courseOf('Appetizer', 'Satay Peanut Sauce'), 'starter'); // only main and side labels give way
});

test('every course has a label', () => {
  for (const [id, label] of COURSES) assert.ok(id && label);
});
