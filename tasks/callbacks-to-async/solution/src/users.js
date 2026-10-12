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
  if (typeof user.name !== "string" || !user.name.trim()) throw new ValidationError("name is required");
  if (typeof user.email !== "string" || !EMAIL.test(user.email)) throw new ValidationError("email is invalid");
}

const tick = () => new Promise((r) => setImmediate(r));

export async function resetUsers() {
  await tick();
  db.clear();
  nextId = 1;
}

export async function createUser(data) {
  await tick();
  const user = { id: nextId, name: data.name, email: data.email };
  validate(user);
  nextId++;
  db.set(user.id, user);
  return { ...user };
}

export async function getUser(id) {
  await tick();
  const user = db.get(id);
  if (!user) throw new NotFoundError(id);
  return { ...user };
}

export async function updateUser(id, patch) {
  await tick();
  const user = db.get(id);
  if (!user) throw new NotFoundError(id);
  const next = { ...user, ...patch, id: user.id };
  validate(next);
  db.set(id, next);
  return { ...next };
}

export async function deleteUser(id) {
  await tick();
  if (!db.delete(id)) throw new NotFoundError(id);
}

export async function listUsers() {
  await tick();
  return [...db.values()].map((u) => ({ ...u }));
}
