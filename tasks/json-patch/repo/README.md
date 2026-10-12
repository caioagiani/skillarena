# json-patch-lite

`applyPatch(document, patch)` applies an [RFC 6902](https://www.rfc-editor.org/rfc/rfc6902) patch and
returns the **new** document. `PatchError` is exported from `src/patch.js`.

## Guarantees

- **Never mutates** `document` or `patch`, whether the patch succeeds or fails.
- **Atomic**: if any operation fails, `applyPatch` throws a `PatchError` and nothing is applied.
  The error has an `index` property: the position of the failing operation in `patch`
  (`-1` when `patch` itself is not an array).
- The result shares no objects or arrays with `document` (safe to mutate).

## Operations

Each operation is an object with `op` and `path`; extra members are ignored.

| op | Members | Behaviour |
|---|---|---|
| `add` | `value` | Object: set the member (replacing it if present). Array: insert **before** the index (index may equal the length); `-` appends. |
| `remove` | | Remove the target. It must exist. |
| `replace` | `value` | Replace the target's value. It must exist. |
| `move` | `from` | Remove from `from`, then add at `path`. `from` must exist and must not be a proper prefix of `path`. Moving to the same location is a no-op. |
| `copy` | `from` | Add a deep copy of the value at `from` to `path`. |
| `test` | `value` | Succeeds only if the target equals `value`. |

`value` is required for `add`, `replace` and `test` (it may be `null`). Unknown `op` values, missing
members, or members of the wrong type are errors.

**Equality** (`test`): same JSON type; numbers and strings by value; arrays element by element in order;
objects with the same set of keys and equal values regardless of key order.

## JSON Pointer (RFC 6901)

- `""` is the whole document. Otherwise the pointer starts with `/` and each `/` starts a reference token.
- Inside a token, `~1` means `/` and `~0` means `~` (so `/a~1b` is the key `a/b` and `/m~0n` is `m~n`).
  Any other `~` sequence is an error.
- Array indexes are `0` or digits without a leading zero (`01` is an error). `-` refers to the position
  after the last element and is only valid as the target of `add` (directly or via `move`/`copy`).
- Every token except the last must resolve to an existing object or array.
- `add`/`replace` at `""` replace the whole document. `remove` at `""` is an error.
