# http-link-header-kit

Parses and serializes the HTTP `Link` header into an array of relation targets with parameters.

```js
import { parse, serialize } from 'http-link-header-kit';

const links = parse('</items?page=2>; rel="next"; type="application/json"');
// [ { target: '/items?page=2', params: { rel: 'next', type: 'application/json' } } ]

links[0].target;        // '/items?page=2'
links[0].params.rel;    // 'next'

serialize(links);
// '</items?page=2>; rel=next; type="application/json"'
```

## Why this exists

The `Link` header shows up in pagination (`rel="next"`), preload hints, and
descriptions of alternate representations. It looks like a simple comma-separated
list until a quoted parameter contains a comma or a semicolon, at which point a
naive `split(',')` silently produces garbage. This library does the character
scanning properly and keeps the parameter values exactly as the server sent them.

The trade-off: parsing is strict. A malformed entry throws `LinkHeaderError`
rather than being dropped. That makes broken upstreams visible instead of turning
them into a quietly shorter list, and callers who want to be lenient can wrap the
call in `try`/`catch` and fall back to whatever they prefer.

## What you get back

`parse(input)` returns an array of `{ target, params }`. `target` is the raw
string between the angle brackets. `params` is a null-prototype object whose keys
are parameter names and whose values are strings; a parameter written without a
value (`; anchor`) maps to `''`. Repeated parameter names keep the last value.

`serialize(links)` accepts the same shape and returns one comma-separated header
value. Values that are not RFC 7230 tokens are quoted and escaped, so a title of
`hello world` becomes `title="hello world"`. Parameter order follows the insertion
order of the object.

## The awkward edge

When the header arrives over the wire, Node's `http` module may hand you the same
`Link` header more than once. This library does not read headers for you; join the
values with `', '` before calling `parse`:

```js
const raw = Array.isArray(req.headers.link)
  ? req.headers.link.join(', ')
  : req.headers.link;
const links = parse(raw ?? '');
```

Joining is safe because the grammar treats a comma-separated list in one header as
equivalent to several headers carrying the same field name.
