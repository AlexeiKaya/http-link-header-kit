import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, serialize, LinkHeaderError } from '../src/index.js';

test('parses a single link with parameters', () => {
  const links = parse('<https://api.example.org/items?page=2>; rel="next"; type="application/json"');
  assert.equal(links.length, 1);
  assert.equal(links[0].target, 'https://api.example.org/items?page=2');
  assert.equal(links[0].params.rel, 'next');
  assert.equal(links[0].params.type, 'application/json');
});

test('parses multiple comma-separated links', () => {
  const links = parse('</a>; rel=prev, </b>; rel=next, </c>; rel=last');
  assert.deepEqual(
    links.map((l) => [l.target, l.params.rel]),
    [
      ['/a', 'prev'],
      ['/b', 'next'],
      ['/c', 'last'],
    ]
  );
});

test('parses a link without parameters', () => {
  const links = parse('<https://example.org/>');
  assert.equal(links.length, 1);
  assert.equal(links[0].target, 'https://example.org/');
  assert.deepEqual(Object.keys(links[0].params), []);
});

test('a parameter without a value becomes an empty string', () => {
  const links = parse('</x>; anchor');
  assert.equal(links[0].params.anchor, '');
});

test('unquoted token parameter values are accepted', () => {
  const links = parse('</x>; rel=next');
  assert.equal(links[0].params.rel, 'next');
});

test('quoted values can contain the delimiter characters', () => {
  const links = parse('</x>; title="a, b; c"');
  assert.equal(links[0].params.title, 'a, b; c');
});

test('backslash escapes are decoded inside quoted values', () => {
  const links = parse('</x>; title="say \\"hi\\""');
  assert.equal(links[0].params.title, 'say "hi"');
});

test('repeated parameter names keep the last value', () => {
  const links = parse('</x>; rel=prev; rel=next');
  assert.equal(links[0].params.rel, 'next');
});

test('empty slots between commas are ignored', () => {
  const links = parse('</a>, , </b>');
  assert.deepEqual(links.map((l) => l.target), ['/a', '/b']);
});

test('an empty header yields no links', () => {
  assert.deepEqual(parse(''), []);
  assert.deepEqual(parse('   '), []);
});

test('malformed input throws LinkHeaderError', () => {
  assert.throws(() => parse('not-a-link'), LinkHeaderError);
  assert.throws(() => parse('</x'), LinkHeaderError);
  assert.throws(() => parse('</x>; title="unterminated'), LinkHeaderError);
  assert.throws(() => parse('</x>; =oops'), LinkHeaderError);
  assert.throws(() => parse('</x>; rel=next extra'), LinkHeaderError);
  assert.throws(() => parse(null), LinkHeaderError);
});

test('serialize emits token values unquoted', () => {
  const out = serialize([{ target: '/next', params: { rel: 'next' } }]);
  assert.equal(out, '</next>; rel=next');
});

test('serialize quotes values that are not tokens', () => {
  const out = serialize([{ target: '/x', params: { title: 'hello world' } }]);
  assert.equal(out, '</x>; title="hello world"');
});

test('serialize escapes quotes and backslashes', () => {
  const out = serialize([{ target: '/x', params: { title: 'a"b\\c' } }]);
  assert.equal(out, '</x>; title="a\\"b\\\\c"');
});

test('serialize joins multiple links with a comma and space', () => {
  const out = serialize([
    { target: '/a', params: { rel: 'prev' } },
    { target: '/b', params: { rel: 'next' } },
  ]);
  assert.equal(out, '</a>; rel=prev, </b>; rel=next');
});

test('serialize accepts a link without params', () => {
  assert.equal(serialize([{ target: '/a' }]), '</a>');
});

test('serialize rejects invalid inputs', () => {
  assert.throws(() => serialize('nope'), LinkHeaderError);
  assert.throws(() => serialize([{ params: {} }]), LinkHeaderError);
  assert.throws(() => serialize([{ target: '/a', params: { 'bad name': 'x' } }]), LinkHeaderError);
});

test('parse and serialize round-trip', () => {
  const source = '</items?page=2>; rel="next"; type="application/json", </items?page=1>; rel=prev';
  const links = parse(source);
  const out = serialize(links);
  const again = parse(out);
  assert.deepEqual(
    again.map((l) => [l.target, l.params.rel, l.params.type]),
    links.map((l) => [l.target, l.params.rel, l.params.type])
  );
});
