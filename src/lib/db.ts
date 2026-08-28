/**
 * Firestore data layer with a Prisma-compatible API.
 *
 * The whole app (28 API routes) is written against the Prisma Client
 * surface used by the previous Supabase Postgres deployment:
 *   db.<model>.findUnique / findFirst / findMany / create / update /
 *   updateMany / upsert / delete / deleteMany / count
 *   db.$transaction([...])  and  db.$transaction(async (tx) => ...)
 *
 * This module re-implements exactly that surface on top of Google
 * Firestore (via firebase-admin), so no route code changes:
 *   - Collections map 1:1 to the old Prisma models.
 *   - `where` supports equality, in/notIn, gt/gte/lt/lte, contains,
 *     startsWith, NOT, AND, OR plus RELATIONAL filters
 *     (`{ some: ... }`, `{ none: ... }`, `{ every: ... }`).
 *   - `include`/`select` resolve relations (belongsTo + hasMany, with
 *     nested where/select on hasMany).
 *   - Numbers support { increment / decrement / multiply / divide }.
 *   - Firestore Timestamps are converted to JS Dates on read (the app
 *     code does `new Date(x)` everywhere).
 *   - createdAt/updatedAt defaults and @updatedAt behaviour preserved.
 *
 * Query strategy: flat equality/range constraints are pushed down to
 * Firestore where() clauses; anything relational/contains/OR is
 * filtered in memory (capped by MAX_SCAN — this is a school-scale
 * platform, collections stay in the thousands at most).
 */
import { Timestamp, Transaction } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase";
import { randomBytes } from "crypto";

// --------------------------------------------------------------------
// Model registry
// --------------------------------------------------------------------

type RelationDef =
  | { kind: "belongsTo"; model: ModelKey; fk: string }
  | { kind: "hasMany"; model: ModelKey; fk: string };

interface ModelDef {
  collection: string;
  defaults: Record<string, unknown>;
  relations: Record<string, RelationDef>;
}

const NOW = () => new Date();

const BASE_DEFAULTS = { createdAt: NOW, updatedAt: NOW };

const MODELS: Record<ModelKey, ModelDef> = {
  user: {
    collection: "users",
    defaults: {
      role: "student",
      status: "pending",
      level: 1,
      totalPoints: 0,
      pvpPoints: 0,
      currentStatus: "idle",
      lastActivity: NOW,
      emailVerified: null,
      trainerId: null,
      phone: null,
      validityEnd: null,
      aiAttemptsCount: 0,
      aiLastDate: null,
      lastDailyBonus: null,
    },
    relations: {
      trainer: { kind: "belongsTo", model: "trainer", fk: "trainerId" },
      friendshipsSent: { kind: "hasMany", model: "friendship", fk: "senderId" },
      friendshipsReceived: { kind: "hasMany", model: "friendship", fk: "receiverId" },
      notificationReads: { kind: "hasMany", model: "notificationRead", fk: "userId" },
      exams: { kind: "hasMany", model: "generatedExam", fk: "userId" },
      trainings: { kind: "hasMany", model: "training", fk: "userId" },
      notifications: { kind: "hasMany", model: "notification", fk: "userId" },
      withdrawalRequests: { kind: "hasMany", model: "withdrawalRequest", fk: "userId" },
      pvpMatchesAsP1: { kind: "hasMany", model: "pvpMatch", fk: "player1Id" },
      pvpMatchesAsP2: { kind: "hasMany", model: "pvpMatch", fk: "player2Id" },
      pvpWins: { kind: "hasMany", model: "pvpMatch", fk: "winnerId" },
      activityLogs: { kind: "hasMany", model: "activityLog", fk: "userId" },
      fcmTokens: { kind: "hasMany", model: "fcmToken", fk: "userId" },
      auditLogs: { kind: "hasMany", model: "auditLog", fk: "actorId" },
      auditLogTargets: { kind: "hasMany", model: "auditLog", fk: "targetUserId" },
      withdrawalsDecided: { kind: "hasMany", model: "withdrawalRequest", fk: "decidedBy" },
    },
  },
  trainer: {
    collection: "trainers",
    defaults: { email: null },
    relations: { users: { kind: "hasMany", model: "user", fk: "trainerId" } },
  },
  training: {
    collection: "trainings",
    defaults: {},
    relations: { user: { kind: "belongsTo", model: "user", fk: "userId" } },
  },
  generatedExam: {
    collection: "generatedExams",
    defaults: {},
    relations: { user: { kind: "belongsTo", model: "user", fk: "userId" } },
  },
  pvpMatch: {
    collection: "pvpMatches",
    defaults: {},
    relations: {
      player1: { kind: "belongsTo", model: "user", fk: "player1Id" },
      player2: { kind: "belongsTo", model: "user", fk: "player2Id" },
      winner: { kind: "belongsTo", model: "user", fk: "winnerId" },
    },
  },
  friendship: {
    collection: "friendships",
    defaults: { status: "pending" },
    relations: {
      sender: { kind: "belongsTo", model: "user", fk: "senderId" },
      receiver: { kind: "belongsTo", model: "user", fk: "receiverId" },
    },
  },
  notification: {
    collection: "notifications",
    defaults: { userId: null, isBroadcast: false },
    relations: {
      user: { kind: "belongsTo", model: "user", fk: "userId" },
      notificationReads: { kind: "hasMany", model: "notificationRead", fk: "notificationId" },
    },
  },
  notificationRead: {
    collection: "notificationReads",
    defaults: {},
    relations: {
      notification: { kind: "belongsTo", model: "notification", fk: "notificationId" },
      user: { kind: "belongsTo", model: "user", fk: "userId" },
    },
  },
  withdrawalRequest: {
    collection: "withdrawalRequests",
    defaults: { decidedBy: null, decidedAt: null, status: "pending" },
    relations: {
      user: { kind: "belongsTo", model: "user", fk: "userId" },
      decidedByUser: { kind: "belongsTo", model: "user", fk: "decidedBy" },
    },
  },
  systemSetting: {
    collection: "systemSettings",
    defaults: {},
    relations: {},
  },
  activityLog: {
    collection: "activityLogs",
    defaults: { userId: null, ip: null, userAgent: null },
    relations: { user: { kind: "belongsTo", model: "user", fk: "userId" } },
  },
  auditLog: {
    collection: "auditLogs",
    defaults: { targetUserId: null, meta: null },
    relations: {
      actor: { kind: "belongsTo", model: "user", fk: "actorId" },
      target: { kind: "belongsTo", model: "user", fk: "targetUserId" },
    },
  },
  fcmToken: {
    collection: "fcmTokens",
    defaults: { userAgent: null },
    relations: { user: { kind: "belongsTo", model: "user", fk: "userId" } },
  },
  session: {
    collection: "sessions",
    defaults: { expires: NOW, sessionToken: "", userId: "" },
    relations: {},
  },
};

export type ModelKey =
  | "user"
  | "trainer"
  | "training"
  | "generatedExam"
  | "pvpMatch"
  | "friendship"
  | "notification"
  | "notificationRead"
  | "withdrawalRequest"
  | "systemSetting"
  | "activityLog"
  | "auditLog"
  | "fcmToken"
  | "session";

type Doc = Record<string, any>;
type Where = Record<string, any>;

const MAX_SCAN = 20_000; // in-memory filter safety cap

// --------------------------------------------------------------------
// Value helpers
// --------------------------------------------------------------------

function genId(): string {
  return (
    "c" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8) +
    randomBytes(8).toString("hex")
  );
}

/** Recursively convert Firestore Timestamps → JS Date on read. */
function reviveDates(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value && typeof value === "object") {
    const out: Doc = {};
    for (const [k, v] of Object.entries(value as Doc)) out[k] = reviveDates(v);
    return out;
  }
  return value;
}

/** Strip undefined values (Firestore rejects them). Preserves Dates. */
function stripUndefined(value: unknown): unknown {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") {
    const out: Doc = {};
    for (const [k, v] of Object.entries(value as Doc)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out;
  }
  return value;
}

function cmp(a: unknown, b: unknown): number {
  const anull = a === null || a === undefined;
  const bnull = b === null || b === undefined;
  if (anull && bnull) return 0;
  if (anull) return -1; // nulls smallest → asc: first, desc: last (Postgres NULLS LAST on desc)
  if (bnull) return 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return (a ? 1 : 0) - (b ? 1 : 0);
  return String(a).localeCompare(String(b), "ar", { numeric: true });
}

function asComparable(v: unknown): unknown {
  return v instanceof Timestamp ? v.toDate() : v;
}

// --------------------------------------------------------------------
// Where-clause evaluation (in memory)
// --------------------------------------------------------------------

const NUMERIC_OPS = new Set(["gt", "gte", "lt", "lte"]);
const OPERATORS = new Set(["in", "notIn", "gt", "gte", "lt", "lte", "contains", "startsWith", "endsWith", "not", "every", "has", "hasSome"]);

function matchesField(doc: Doc, key: string, cond: unknown): boolean {
  const value = doc[key];
  if (cond !== null && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date)) {
    for (const [op, operand] of Object.entries(cond as Doc)) {
      switch (op) {
        case "in":
          if (!(operand as unknown[]).some((o) => cmp(asComparable(value), asComparable(o)) === 0)) return false;
          break;
        case "notIn":
          if ((operand as unknown[]).some((o) => cmp(asComparable(value), asComparable(o)) === 0)) return false;
          break;
        case "gt":
          if (!(cmp(asComparable(value), asComparable(operand)) > 0)) return false;
          break;
        case "gte":
          if (!(cmp(asComparable(value), asComparable(operand)) >= 0)) return false;
          break;
        case "lt":
          if (!(cmp(asComparable(value), asComparable(operand)) < 0)) return false;
          break;
        case "lte":
          if (!(cmp(asComparable(value), asComparable(operand)) <= 0)) return false;
          break;
        case "contains":
          if (!String(value ?? "").includes(String(operand))) return false;
          break;
        case "startsWith":
          if (!String(value ?? "").startsWith(String(operand))) return false;
          break;
        case "endsWith":
          if (!String(value ?? "").endsWith(String(operand))) return false;
          break;
        case "not":
          if (cmp(asComparable(value), asComparable(operand)) === 0) return false;
          break;
        case "mode":
        case "caseInsensitive":
          break; // Postgres-mode hints — Arabic text is caseless anyway
        default:
          return false;
      }
    }
    return true;
  }
  return cmp(asComparable(value), asComparable(cond)) === 0;
}

function isOperatorObject(v: unknown): boolean {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    Object.keys(v as Doc).length > 0 &&
    Object.keys(v as Doc).every((k) => OPERATORS.has(k))
  );
}

async function matchesWhere(doc: Doc, where: Where, model: ModelKey, ctx: Ctx): Promise<boolean> {
  for (const [key, cond] of Object.entries(where ?? {})) {
    if (cond === undefined) continue;
    if (key === "AND") {
      for (const sub of cond as Where[]) {
        if (!(await matchesWhere(doc, sub, model, ctx))) return false;
      }
      continue;
    }
    if (key === "OR") {
      let any = false;
      for (const sub of cond as Where[]) {
        if (await matchesWhere(doc, sub, model, ctx)) { any = true; break; }
      }
      if (!any) return false;
      continue;
    }
    if (key === "NOT") {
      if (await matchesWhere(doc, cond as Where, model, ctx)) return false;
      continue;
    }

    const rel = MODELS[model].relations[key];
    if (rel && !isOperatorObject(cond)) {
      // relational filter: { some|none|every: subWhere } (hasMany)
      // or plain subWhere (belongsTo → match the FK target doc)
      const children = await loadChildren(doc, model, key, ctx);
      if (rel.kind === "belongsTo") {
        if (children === null) {
          if (cond === null) continue; // { relation: null } matches missing
          return false;
        }
        if (!(await matchesWhere(children as Doc, cond as Where, rel.model, ctx))) return false;
      } else {
        const sub = (cond as Doc).some ?? (cond as Doc).none ?? (cond as Doc).every;
        const kind = (cond as Doc).some !== undefined ? "some" : (cond as Doc).none !== undefined ? "none" : "every";
        if (sub === undefined) continue;
        const results: boolean[] = [];
        for (const child of children as Doc[]) {
          results.push(await matchesWhere(child, sub as Where, rel.model, ctx));
        }
        if (kind === "some" && !results.some(Boolean)) return false;
        if (kind === "none" && results.some(Boolean)) return false;
        if (kind === "every" && !(children as Doc[]).length && (cond as Doc).every !== undefined && results.length === 0) {
          // Prisma: every on empty list → true
        }
        if (kind === "every" && !results.every(Boolean)) return false;
      }
      continue;
    }

    if (!matchesField(doc, key, cond)) return false;
  }
  return true;
}

async function loadChildren(
  doc: Doc,
  model: ModelKey,
  relationName: string,
  ctx: Ctx
): Promise<Doc[] | Doc | null> {
  const rel = MODELS[model].relations[relationName];
  if (!rel) return null;
  if (rel.kind === "belongsTo") {
    const fk = doc[rel.fk];
    if (!fk) return null;
    return await getRaw(rel.model, fk, ctx);
  }
  // hasMany: children whose rel.fk === doc.id
  return await loadDocs(rel.model, { [rel.fk]: doc.id }, {}, ctx);
}

// --------------------------------------------------------------------
// Projection (select / include)
// --------------------------------------------------------------------

function projectDoc(doc: Doc, select: Doc | undefined): Doc {
  if (!select) return doc;
  const out: Doc = {};
  for (const [k, v] of Object.entries(select)) {
    if (v === true) out[k] = doc[k] ?? null;
    else if (v && typeof v === "object") out[k] = projectDoc(doc[k] ?? {}, v as Doc);
  }
  return out;
}

async function applyInclude(
  doc: Doc,
  model: ModelKey,
  include: Doc | undefined,
  ctx: Ctx,
  depth = 0
): Promise<Doc> {
  if (!include || depth > 3) return doc;
  const out: Doc = { ...doc };
  for (const [name, spec] of Object.entries(include)) {
    const rel = MODELS[model].relations[name];
    if (!rel) continue;
    if (rel.kind === "belongsTo") {
      const fk = doc[rel.fk];
      out[name] = fk ? await getRaw(rel.model, fk, ctx) : null;
      if (out[name] && spec && typeof spec === "object" && (spec as Doc).select) {
        out[name] = projectDoc(out[name], (spec as Doc).select as Doc);
      }
    } else {
      // hasMany (supports nested where + select)
      const specObj = (spec && typeof spec === "object" ? spec : {}) as Doc;
      const childModel = MODELS[rel.model];
      const children = await loadDocs(
        rel.model,
        { [rel.fk]: doc.id, ...(specObj.where ?? {}) },
        {},
        ctx
      );
      let mapped = children;
      if (specObj.orderBy) mapped = sortDocs(mapped, specObj.orderBy as Doc);
      if (specObj.take !== undefined) mapped = mapped.slice(0, specObj.take as number);
      if (specObj.select) mapped = mapped.map((c) => projectDoc(c, specObj.select as Doc));
      out[name] = mapped;
      void childModel;
    }
  }
  return out;
}

function sortDocs(docs: Doc[], orderBy: Doc | Doc[]): Doc[] {
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...docs].sort((a, b) => {
    for (const o of orders) {
      for (const [field, dir] of Object.entries(o as Doc)) {
        const r = cmp(asComparable(a[field]), asComparable(b[field]));
        if (r !== 0) return dir === "desc" ? -r : r;
      }
    }
    return 0;
  });
}

// --------------------------------------------------------------------
// Storage access (with optional transaction context)
//
// Transaction strategy: interactive transactions buffer ALL writes in
// an in-memory overlay (`overlay`/`deletes`) that is flushed to the
// real Firestore transaction ONLY after the callback resolves. Reads
// inside the callback see Firestore + overlay (read-your-writes), so
// ANY read/write ordering works — Firestore's all-reads-before-writes
// rule is satisfied because real writes happen exclusively at flush.
// --------------------------------------------------------------------

interface Ctx {
  tx?: Transaction;
  /** Buffered writes keyed as `${model}:${id}` — flushed at tx end. */
  overlay?: Map<string, Doc>;
  /** Buffered deletes keyed as `${model}:${id}` — flushed at tx end. */
  deletes?: Set<string>;
}

function ovKey(model: ModelKey, id: string): string {
  return `${model}:${id}`;
}

function col(model: ModelKey): string {
  return MODELS[model].collection;
}

function snapToDoc(snap: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): Doc {
  const data = (snap.data() ?? {}) as Doc;
  const revived = reviveDates(data) as Doc;
  revived.id = snap.id;
  return revived;
}

function overlayDocsFor(model: ModelKey, ctx: Ctx): Doc[] {
  if (!ctx.overlay) return [];
  const out: Doc[] = [];
  for (const [key, doc] of ctx.overlay) {
    if (key.startsWith(`${model}:`) && !ctx.deletes?.has(key)) out.push(doc);
  }
  return out;
}

async function getRaw(model: ModelKey, id: string, ctx: Ctx): Promise<Doc | null> {
  const key = ovKey(model, id);
  if (ctx.overlay?.has(key)) return ctx.overlay.get(key)!;
  if (ctx.deletes?.has(key)) return null;
  const ref = firestore.collection(col(model)).doc(id);
  const snap = ctx.tx ? await ctx.tx.get(ref) : await ref.get();
  return snap.exists ? snapToDoc(snap) : null;
}

/** Extract pushable flat constraints (equality on primitives + one range field). */
function pushableConstraints(model: ModelKey, where: Where): { eqs: [string, unknown][]; range?: { field: string; op: FirebaseFirestore.WhereFilterOp; value: unknown } } {
  const eqs: [string, unknown][] = [];
  let range: { field: string; op: FirebaseFirestore.WhereFilterOp; value: unknown } | undefined;
  for (const [key, cond] of Object.entries(where ?? {})) {
    if (["AND", "OR", "NOT"].includes(key)) return { eqs: [] };
    if (MODELS[model].relations[key]) return { eqs: [] }; // relation filters stay in memory
    if (key === "id" && (cond === null || typeof cond !== "object")) {
      eqs.push([key, cond]);
      continue;
    }
    if (cond === null || typeof cond !== "object" || cond instanceof Date) {
      eqs.push([key, cond]);
      continue;
    }
    const ops = Object.keys(cond as Doc);
    if (ops.length === 1 && NUMERIC_OPS.has(ops[0])) {
      if (range) return { eqs: [] }; // only one range field supported
      const opMap: Record<string, FirebaseFirestore.WhereFilterOp> = {
        gt: ">", gte: ">=", lt: "<", lte: "<=",
      };
      range = { field: key, op: opMap[ops[0]], value: asComparable((cond as Doc)[ops[0]]) };
      continue;
    }
    return { eqs: [] }; // in / contains / multi-op → in-memory
  }
  return { eqs, range };
}

async function loadDocs(model: ModelKey, where: Where, opts: { orderBy?: Doc | Doc[]; limit?: number }, ctx: Ctx): Promise<Doc[]> {
  const { eqs, range } = pushableConstraints(model, where);
  let q: FirebaseFirestore.Query = firestore.collection(col(model));

  const isComplex = Object.entries(where ?? {}).some(([k, v]) =>
    ["AND", "OR", "NOT"].includes(k) ||
    !!MODELS[model].relations[k] ||
    (v !== null && typeof v === "object" && !(v instanceof Date) && !isSimpleScalarCond(v))
  );

  if (eqs.length || range) {
    for (const [f, v] of eqs) q = q.where(f, "==", asComparable(v));
    if (range) q = q.where(range.field, range.op, range.value);
  }
  q = q.limit(MAX_SCAN);

  const snap = ctx.tx ? await ctx.tx.get(q) : await q.get();
  let docs = snap.docs.map(snapToDoc);

  // Merge buffered transaction writes into the result set so reads see
  // pending writes (read-your-writes) and deleted docs disappear.
  if (ctx.overlay || ctx.deletes) {
    const seen = new Set(docs.map((d) => d.id));
    for (const ov of overlayDocsFor(model, ctx)) {
      if (!seen.has(ov.id)) { docs.push(ov); seen.add(ov.id); }
    }
    docs = docs.map((d) => ctx.overlay?.get(ovKey(model, d.id)) ?? d);
    docs = docs.filter((d) => !ctx.deletes?.has(ovKey(model, d.id)));
  }

  // Apply the full where in memory whenever anything non-trivial is present
  // (when only flat equalities were pushed down Firestore already filtered).
  if (isComplex) {
    const out: Doc[] = [];
    for (const d of docs) {
      if (await matchesWhere(d, where, model, ctx)) out.push(d);
    }
    docs = out;
  }
  return docs;
}

function isSimpleScalarCond(v: unknown): boolean {
  // equality or single numeric range → already pushed down
  if (v === null || typeof v !== "object" || v instanceof Date) return true;
  const ops = Object.keys(v as Doc);
  return ops.length === 1 && NUMERIC_OPS.has(ops[0]);
}

// --------------------------------------------------------------------
// Write helpers
// --------------------------------------------------------------------

function applyDataOps(doc: Doc, data: Doc): Doc {
  const out: Doc = { ...doc };
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const ops = Object.keys(v as Doc);
      if (ops.length === 1 && ["increment", "decrement", "multiply", "divide"].includes(ops[0])) {
        const [op, amount] = [ops[0], (v as Doc)[ops[0]] as number];
        const base = Number(out[k] ?? 0);
        if (op === "increment") out[k] = base + amount;
        else if (op === "decrement") out[k] = base - amount;
        else if (op === "multiply") out[k] = base * amount;
        else out[k] = base / amount;
        continue;
      }
    }
    out[k] = v;
  }
  return out;
}

async function writeDoc(model: ModelKey, id: string, data: Doc, ctx: Ctx): Promise<void> {
  if (ctx.tx && ctx.overlay) {
    // Buffered — flushed to the real transaction after the callback.
    ctx.overlay.set(ovKey(model, id), { ...data, id });
    ctx.deletes?.delete(ovKey(model, id));
    return;
  }
  const ref = firestore.collection(col(model)).doc(id);
  const payload = stripUndefined(data) as Doc;
  delete payload.id;
  await ref.set(payload, { merge: true });
}

async function deleteDocById(model: ModelKey, id: string, ctx: Ctx): Promise<void> {
  if (ctx.tx && ctx.overlay) {
    ctx.overlay.delete(ovKey(model, id));
    ctx.deletes?.add(ovKey(model, id));
    return;
  }
  await firestore.collection(col(model)).doc(id).delete();
}

// --------------------------------------------------------------------
// Unique where resolution (findUnique / upsert / update / delete)
// --------------------------------------------------------------------

const COMPOUND_KEYS = new Set(["notificationId_userId", "senderId_receiverId", "identifier_token", "provider_providerAccountId"]);

async function findByUnique(model: ModelKey, where: Where, ctx: Ctx): Promise<Doc | null> {
  const entries = Object.entries(where);
  if (entries.length === 0) return null;
  const [key, value] = entries[0];

  if (key === "id") {
    return value ? await getRaw(model, String(value), ctx) : null;
  }
  if (COMPOUND_KEYS.has(key) && value && typeof value === "object") {
    const docs = await loadDocs(model, value as Where, {}, ctx);
    return docs[0] ?? null;
  }
  // single unique field (username / email / key / token / phone …)
  const docs = await loadDocs(model, { [key]: value }, { limit: 5 }, ctx);
  return docs[0] ?? null;
}

// --------------------------------------------------------------------
// Model handle (the Prisma-like API)
// --------------------------------------------------------------------

interface FindArgs {
  where?: Where;
  orderBy?: Doc | Doc[];
  skip?: number;
  take?: number;
  select?: Doc;
  include?: Doc;
}

class ModelHandle {
  constructor(private model: ModelKey, private ctx: Ctx) {}

  async findUnique(args: { where: Where; select?: Doc; include?: Doc }) {
    const doc = await findByUnique(this.model, args.where, this.ctx);
    if (!doc) return null;
    return this.finish(doc, args);
  }

  async findFirst(args: FindArgs = {}) {
    const docs = await this.query(args);
    return docs[0] ?? null;
  }

  async findMany(args: FindArgs = {}) {
    return this.query(args);
  }

  async count(args: { where?: Where } = {}) {
    const docs = await loadDocs(this.model, args.where ?? {}, {}, this.ctx);
    let n = 0;
    for (const d of docs) if (await matchesWhere(d, args.where ?? {}, this.model, this.ctx)) n++;
    return n;
  }

  /**
   * Prisma-style aggregate over numeric fields.
   * Supports: _count (true), _sum/_avg/_min/_max ({ field: true }).
   */
  async aggregate(args: {
    where?: Where;
    _count?: boolean;
    _sum?: Doc;
    _avg?: Doc;
    _min?: Doc;
    _max?: Doc;
  } = {}) {
    const docs = await loadDocs(this.model, args.where ?? {}, {}, this.ctx);
    const matched: Doc[] = [];
    for (const d of docs) if (await matchesWhere(d, args.where ?? {}, this.model, this.ctx)) matched.push(d);
    const result: Doc = {};
    if (args._count) result._count = matched.length;
    const ops = ["_sum", "_avg", "_min", "_max"] as const;
    for (const op of ops) {
      const fields = args[op];
      if (!fields) continue;
      const out: Doc = {};
      for (const f of Object.keys(fields)) {
        const vals = matched
          .map((d) => d[f])
          .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
        if (op === "_sum") out[f] = vals.reduce((a, b) => a + b, 0);
        else if (op === "_avg") out[f] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        else if (op === "_min") out[f] = vals.length ? Math.min(...vals) : null;
        else if (op === "_max") out[f] = vals.length ? Math.max(...vals) : null;
      }
      result[op] = out;
    }
    return result;
  }

  private async query(args: FindArgs): Promise<Doc[]> {
    let docs = await loadDocs(this.model, args.where ?? {}, {}, this.ctx);
    if (args.orderBy) docs = sortDocs(docs, args.orderBy);
    const skip = args.skip ?? 0;
    if (skip) docs = docs.slice(skip);
    if (args.take !== undefined) docs = docs.slice(0, args.take);
    const out: Doc[] = [];
    for (const d of docs) out.push(await this.finish(d, args));
    return out;
  }

  private async finish(doc: Doc, args: { select?: Doc; include?: Doc }): Promise<Doc> {
    if (args.include) return applyInclude(doc, this.model, args.include, this.ctx);
    if (args.select) return projectDoc(doc, args.select);
    return doc;
  }

  async create(args: { data: Doc; select?: Doc; include?: Doc }) {
    const id = (args.data.id as string) || genId();
    const defaults = { ...MODELS[this.model].defaults };
    // instantiate default thunks (NOW())
    for (const k of Object.keys(defaults)) {
      if (typeof defaults[k] === "function") defaults[k] = (defaults[k] as () => Date)();
    }
    const merged = { ...defaults, ...stripUndefined(args.data), id } as Doc;
    if (!merged.createdAt) merged.createdAt = new Date();
    if (!merged.updatedAt) merged.updatedAt = new Date();
    await writeDoc(this.model, id, merged, this.ctx);
    return this.finish(merged, args);
  }

  async update(args: { where: Where; data: Doc; select?: Doc; include?: Doc }) {
    const existing = await findByUnique(this.model, args.where, this.ctx);
    if (!existing) throw new Error(`Record not found for update on ${this.model}`);
    const updated = applyDataOps(existing, args.data);
    updated.updatedAt = new Date();
    await writeDoc(this.model, existing.id, updated, this.ctx);
    return this.finish(updated, args);
  }

  async updateMany(args: { where: Where; data: Doc }) {
    const docs = await loadDocs(this.model, args.where, {}, this.ctx);
    let count = 0;
    for (const d of docs) {
      if (!(await matchesWhere(d, args.where, this.model, this.ctx))) continue;
      const updated = applyDataOps(d, args.data);
      updated.updatedAt = new Date();
      await writeDoc(this.model, d.id, updated, this.ctx);
      count++;
    }
    return { count };
  }

  async upsert(args: { where: Where; update: Doc; create: Doc; select?: Doc; include?: Doc }) {
    const existing = await findByUnique(this.model, args.where, this.ctx);
    if (existing) {
      const updated = applyDataOps(existing, args.update);
      updated.updatedAt = new Date();
      await writeDoc(this.model, existing.id, updated, this.ctx);
      return this.finish(updated, args);
    }
    return this.create({ data: args.create, select: args.select, include: args.include });
  }

  async delete(args: { where: Where; select?: Doc; include?: Doc }) {
    const existing = await findByUnique(this.model, args.where, this.ctx);
    if (!existing) throw new Error(`Record not found for delete on ${this.model}`);
    await deleteDocById(this.model, existing.id, this.ctx);
    return this.finish(existing, args);
  }

  async deleteMany(args: { where: Where }) {
    const docs = await loadDocs(this.model, args.where ?? {}, {}, this.ctx);
    let count = 0;
    for (const d of docs) {
      if (!(await matchesWhere(d, args.where ?? {}, this.model, this.ctx))) continue;
      await deleteDocById(this.model, d.id, this.ctx);
      count++;
    }
    return { count };
  }
}

// --------------------------------------------------------------------
// Root db object + transactions
// --------------------------------------------------------------------

function makeHandle(ctx: Ctx) {
  const proxy: Record<string, ModelHandle> = {};
  for (const key of Object.keys(MODELS) as ModelKey[]) {
    proxy[key] = new ModelHandle(key, ctx);
  }
  return proxy as Record<ModelKey, ModelHandle> & {
    $transaction: typeof $transaction;
    $disconnect: () => Promise<void>;
  };
}

async function $transaction<T>(operations: Array<Promise<any>>): Promise<any[]>;
async function $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
async function $transaction(arg: any): Promise<any> {
  if (typeof arg === "function") {
    // Interactive transaction. All writes are buffered in an overlay and
    // flushed to the REAL Firestore transaction after the callback — so
    // read/write ordering inside the callback is completely free while
    // the commit itself stays atomic.
    return firestore.runTransaction(async (tx) => {
      const ctx: Ctx = { tx, overlay: new Map(), deletes: new Set() };
      const handle = makeHandle(ctx);
      const result = await arg(handle);
      // Flush buffered writes (atomic with the transaction).
      for (const [key, doc] of ctx.overlay!) {
        const [modelName, id] = key.split(":");
        const payload = stripUndefined(doc) as Doc;
        delete payload.id;
        tx.set(firestore.collection(col(modelName as ModelKey)).doc(id), payload, { merge: true });
      }
      for (const key of ctx.deletes!) {
        const [modelName, id] = key.split(":");
        if (!ctx.overlay!.has(key)) {
          tx.delete(firestore.collection(col(modelName as ModelKey)).doc(id));
        }
      }
      return result;
    });
  }
  // Array form — the promises are pre-created against the root db, so
  // they can only run sequentially (not atomically). Every array-form
  // call-site here is low-contention (settings upserts / notifications);
  // atomic paths use the interactive form above.
  const results: any[] = [];
  for (const op of arg as Promise<any>[]) {
    results.push(await op);
  }
  return results;
}

const rootHandle = makeHandle({});

/**
 * Prisma-compatible db object backed by Firestore.
 * Usage unchanged: `import { db } from '@/lib/db'`.
 */
export const db = {
  ...rootHandle,
  $transaction,
  $disconnect: async () => {
    /* Firestore Admin has no explicit disconnect */
  },
};

export type DbType = typeof db;
