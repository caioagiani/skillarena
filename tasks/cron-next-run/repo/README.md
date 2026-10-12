# cron-lite

`nextRun(expression: string, from: Date): Date` returns the earliest minute **strictly after** `from`
that matches `expression`. All times are **UTC**. The result has seconds and milliseconds set to 0.

## Expression

Five fields separated by one or more spaces or tabs (leading/trailing whitespace ignored):

| Field | Allowed values |
|---|---|
| minute | 0-59 |
| hour | 0-23 |
| day of month | 1-31 |
| month | 1-12 or `JAN`-`DEC` |
| day of week | 0-7 (0 and 7 are Sunday) or `SUN`-`SAT` |

Names are case-insensitive. Each field is a comma-separated list of items. An item is:

- `*`: every value
- `N`: a single value
- `A-B`: an inclusive range (`A` must be <= `B`)
- `*/S`, `A-B/S`: every `S`-th value of the field's range or of `A-B`, starting at its first value
- `A/S`: every `S`-th value from `A` to the field's maximum

Names work anywhere a number does (`MON-FRI`, `JAN,JUL`).

**Day of month vs day of week.** If both fields are restricted (neither is a bare `*`), a day matches when
**either** field matches (standard Vixie cron behaviour). If one of them is `*`, only the other one applies.
A field that starts with `*` but has a step, like `*/2`, counts as restricted.

**Macros**: `@yearly` / `@annually` (`0 0 1 1 *`), `@monthly` (`0 0 1 * *`), `@weekly` (`0 0 * * 0`),
`@daily` / `@midnight` (`0 0 * * *`), `@hourly` (`0 * * * *`).

## Errors

- Malformed expressions throw `SyntaxError`: wrong number of fields, values out of range, `A > B`,
  a step of 0, unknown names or macros, empty list items, non-numeric junk.
- If nothing matches within 5 years after `from` (e.g. `0 0 30 2 *`), throw `RangeError`.
- An invalid `from` (not a `Date`, or an invalid date) throws `TypeError`.
