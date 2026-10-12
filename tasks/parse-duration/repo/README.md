# duration

`parseDuration(input: string): number` converts a human duration into **milliseconds**.

## Spec

- Supported units: `d` (days), `h` (hours), `m` (minutes), `s` (seconds), `ms` (milliseconds).
  Units are case-insensitive (`1H` == `1h`).
- Input is one or more `<number><unit>` segments, e.g. `1h30m`, `2d`, `500ms`.
- Segments may be separated by whitespace (`1h 30m`). Leading/trailing whitespace is ignored.
  There is no whitespace between a number and its unit.
- Numbers are non-negative decimals with a leading digit: `2`, `0.5`, `1.25`. Not `.5`, not `-1`, not `1e3`.
- Each unit may appear at most once. Units may appear in any order (`30m1h` == `1h30m`).
- The result is rounded to the nearest whole millisecond.
- A number without a unit is invalid.
- Any invalid input (empty string, unknown unit, duplicated unit, negative numbers,
  stray characters, non-string values) throws a `TypeError`.

## Examples

| input       | result     |
|-------------|------------|
| `"1h30m"`   | `5400000`  |
| `"1.5h"`    | `5400000`  |
| `" 2d "`    | `172800000`|
| `"250ms"`   | `250`      |
| `"1m 1s"`   | `61000`    |
