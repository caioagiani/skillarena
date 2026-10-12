export class NotFoundError extends Error {
  constructor(id) {
    super(`user ${id} not found`);
    this.name = "NotFoundError";
    this.code = "ENOTFOUND";
  }
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.code = "EVALIDATION";
  }
}

const db = new Map();
let nextId = 1;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(user) {
  if (typeof user.name !== "string" || !user.name.trim()) return new ValidationError("name is required");
  if (typeof user.email !== "string" || !EMAIL.test(user.email)) return new ValidationError("email is invalid");
  return null;
}

// Simulates I/O latency.
const later = (fn) => setImmediate(fn);

export function resetUsers(cb) {
  later(() => {
    db.clear();
    nextId = 1;
    cb(null);
  });
}

export function createUser(data, cb) {
  later(() => {
    const user = { id: nextId, name: data.name, email: data.email };
    const err = validate(user);
    if (err) return cb(err);
    nextId++;
    db.set(user.id, user);
    cb(null, { ...user });
  });
}

export function getUser(id, cb) {
  later(() => {
    const user = db.get(id);
    if (!user) return cb(new NotFoundError(id));
    cb(null, { ...user });
  });
}

export function updateUser(id, patch, cb) {
  later(() => {
    const user = db.get(id);
    if (!user) return cb(new NotFoundError(id));
    const next = { ...user, ...patch, id: user.id };
    const err = validate(next);
    if (err) return cb(err);
    db.set(id, next);
    cb(null, { ...next });
  });
}

export function deleteUser(id, cb) {
  later(() => {
    if (!db.delete(id)) return cb(new NotFoundError(id));
    cb(null);
  });
}

export function listUsers(cb) {
  later(() => cb(null, [...db.values()].map((u) => ({ ...u }))));
}
