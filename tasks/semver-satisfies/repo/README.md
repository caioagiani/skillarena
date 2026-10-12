# semver-lite

`satisfies(version: string, range: string): boolean`: does `version` match `range`?
Semantics are npm's (`node-semver` in strict mode). Never throws: invalid input returns `false`.

## Versions

`MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]`, as in [semver 2.0.0](https://semver.org). A leading `v` or `=` is
allowed (`v1.2.3`). Leading/trailing whitespace is ignored. Numeric parts have no leading zeros.

Precedence: compare MAJOR, MINOR, PATCH numerically. A version with a prerelease is lower than the same
version without one. Prerelease identifiers are compared one by one: numeric identifiers numerically,
alphanumeric ones in ASCII order, numeric < alphanumeric, and a longer list wins when all preceding
identifiers are equal (`1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0`).
Build metadata is ignored.

## Ranges

- `||` separates alternatives; the range matches if any alternative matches.
- Inside an alternative, whitespace-separated comparators must **all** match.
- An empty range or `*` matches any non-prerelease version.

**Primitive comparators**: `<`, `<=`, `>`, `>=`, `=` (or no operator) followed by a version.
Whitespace between operator and version is allowed (`>= 1.2.3`).

**X-ranges**: `x`, `X` or `*` stand for a missing part, and missing parts count as `x`:
`1.x` / `1` = `>=1.0.0 <2.0.0`, `1.2.x` / `1.2` = `>=1.2.0 <1.3.0`.
With an operator: `>1` = `>=2.0.0`, `>1.2` = `>=1.3.0`, `>=1.2` = `>=1.2.0`, `<1.2` = `<1.2.0`, `<=1.2` = `<1.3.0`.

**Hyphen ranges**: `A - B` = `>=A <=B`. A partial `A` is padded with zeros (`1.2 - 2.3.4` = `>=1.2.0 <=2.3.4`).
A partial `B` accepts everything in it (`1.2.3 - 2.3` = `>=1.2.3 <2.4.0`, `1.2.3 - 2` = `>=1.2.3 <3.0.0`).

**Tilde** allows patch-level changes when a minor is given, minor-level otherwise:
`~1.2.3` = `>=1.2.3 <1.3.0`, `~1.2` = `>=1.2.0 <1.3.0`, `~1` = `>=1.0.0 <2.0.0`, `~0.2.3` = `>=0.2.3 <0.3.0`,
`~1.2.3-beta.2` = `>=1.2.3-beta.2 <1.3.0`.

**Caret** allows changes that don't modify the left-most non-zero part:
`^1.2.3` = `>=1.2.3 <2.0.0`, `^0.2.3` = `>=0.2.3 <0.3.0`, `^0.0.3` = `>=0.0.3 <0.0.4`,
`^1.2.x` = `>=1.2.0 <2.0.0`, `^0.0.x` / `^0.0` = `>=0.0.0 <0.1.0`, `^1.x` / `^1` = `>=1.0.0 <2.0.0`, `^0.x` = `>=0.0.0 <1.0.0`.

## Prerelease rule

A version **with** a prerelease tag only satisfies an alternative if every comparator matches **and** at
least one comparator in that alternative has a prerelease tag on the same `MAJOR.MINOR.PATCH`.
So `1.2.3-alpha.7` satisfies `>1.2.3-alpha.3`, but `3.4.5-alpha.9` does not, even though it is greater.
Upper bounds derived from tilde/caret/x-ranges/hyphens never let a prerelease of the next version in:
`2.0.0-beta` does not satisfy `^1.2.3`.
