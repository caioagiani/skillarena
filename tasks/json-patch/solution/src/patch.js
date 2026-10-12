export class PatchError extends Error {
  constructor(message, index) {
    super(message);
    this.name = "PatchError";
    this.index = index;
  }
}

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

function equal(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => equal(x, b[i]));
  }
  if (isObj(a) || isObj(b)) {
    if (!isObj(a) || !isObj(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]));
  }
  return a === b;
}

function parsePointer(ptr) {
  if (typeof ptr !== "string") throw new Error("pointer must be a string");
  if (ptr === "") return [];
  if (!ptr.startsWith("/")) throw new Error(`invalid pointer: ${ptr}`);
  return ptr.slice(1).split("/").map((t) => {
    if (/~[^01]|~$/.test(t)) throw new Error(`invalid escape in ${ptr}`);
    return t.replace(/~1/g, "/").replace(/~0/g, "~");
  });
}

function arrayIndex(arr, token, allowEnd) {
  if (token === "-") {
    if (!allowEnd) throw new Error("'-' not allowed here");
    return arr.length;
  }
  if (!/^(0|[1-9]\d*)$/.test(token)) throw new Error(`invalid array index: ${token}`);
  const i = Number(token);
  if (i > arr.length || (!allowEnd && i === arr.length)) throw new Error(`index out of bounds: ${token}`);
  return i;
}

function parentOf(doc, tokens) {
  let node = doc;
  for (const t of tokens.slice(0, -1)) {
    if (Array.isArray(node)) node = node[arrayIndex(node, t, false)];
    else if (isObj(node) && Object.hasOwn(node, t)) node = node[t];
    else throw new Error("path not found");
    if (node === null || typeof node !== "object") throw new Error("path not found");
  }
  return node;
}

function get(doc, tokens) {
  if (!tokens.length) return doc;
  const parent = parentOf(doc, tokens);
  const last = tokens[tokens.length - 1];
  if (Array.isArray(parent)) return parent[arrayIndex(parent, last, false)];
  if (!Object.hasOwn(parent, last)) throw new Error("path not found");
  return parent[last];
}

function add(doc, tokens, value) {
  if (!tokens.length) return value;
  const parent = parentOf(doc, tokens);
  const last = tokens[tokens.length - 1];
  if (Array.isArray(parent)) parent.splice(arrayIndex(parent, last, true), 0, value);
  else if (isObj(parent)) parent[last] = value;
  else throw new Error("path not found");
  return doc;
}

function remove(doc, tokens) {
  if (!tokens.length) throw new Error("cannot remove the root");
  const parent = parentOf(doc, tokens);
  const last = tokens[tokens.length - 1];
  if (Array.isArray(parent)) parent.splice(arrayIndex(parent, last, false), 1);
  else if (isObj(parent) && Object.hasOwn(parent, last)) delete parent[last];
  else throw new Error("path not found");
  return doc;
}

export function applyPatch(document, patch) {
  if (!Array.isArray(patch)) throw new PatchError("patch must be an array", -1);
  let doc = clone(document);
  patch.forEach((op, i) => {
    try {
      if (!isObj(op)) throw new Error("operation must be an object");
      const path = parsePointer(op.path);
      const needsValue = ["add", "replace", "test"].includes(op.op);
      if (needsValue && !Object.hasOwn(op, "value")) throw new Error("missing value");
      switch (op.op) {
        case "add":
          doc = add(doc, path, clone(op.value));
          break;
        case "remove":
          doc = remove(doc, path);
          break;
        case "replace":
          get(doc, path);
          doc = path.length ? add(remove(doc, path), path, clone(op.value)) : clone(op.value);
          break;
        case "move": {
          const from = parsePointer(op.from);
          if (from.length < path.length && from.every((t, k) => t === path[k])) throw new Error("cannot move into a child");
          const value = get(doc, from);
          if (from.length === path.length && from.every((t, k) => t === path[k])) break;
          doc = add(remove(doc, from), path, value);
          break;
        }
        case "copy":
          doc = add(doc, path, clone(get(doc, parsePointer(op.from))));
          break;
        case "test":
          if (!equal(get(doc, path), op.value)) throw new Error("test failed");
          break;
        default:
          throw new Error(`unknown op: ${op.op}`);
      }
    } catch (e) {
      throw e instanceof PatchError ? e : new PatchError(e.message, i);
    }
  });
  return doc;
}
