import crypto from "node:crypto";

const BASE = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export function fail(status, error) {
  return Object.assign(new Error(error), { status });
}

/** Run Redis commands in one round trip. Each command is an array, e.g. ["GET", "key"]. */
export async function redis(...commands) {
  if (!BASE || !TOKEN) throw fail(503, "no_database");
  const r = await fetch(BASE + "/pipeline", {
    method: "POST",
    headers: { authorization: "Bearer " + TOKEN, "content-type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw fail(502, "database_error");
  const out = await r.json();
  return out.map((x) => {
    if (x.error) throw fail(502, "database_error");
    return x.result;
  });
}

export function parse(value, fallback) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const digest = (s) => crypto.createHash("sha256").update(s).digest();

export function codeMatches(given) {
  const code = process.env.ADMIN_CODE || "";
  if (!code || typeof given !== "string" || !given) return false;
  return crypto.timingSafeEqual(digest(code), digest(given));
}

export function isAdmin(req) {
  let given = String(req.headers["x-admin-code"] || "");
  try {
    given = decodeURIComponent(given);
  } catch {
    return false;
  }
  return codeMatches(given);
}

export function requireAdmin(req) {
  if (!isAdmin(req)) throw fail(401, "not_admin");
}

/** A short, salted hash of the caller's address: enough to rate-limit, not enough to identify. */
function caller(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  return digest(ip + "|" + (process.env.ADMIN_CODE || "salt")).toString("hex").slice(0, 24);
}

export async function limit(req, bucket, max, seconds) {
  const key = "rl:" + bucket + ":" + caller(req);
  const [n] = await redis(["INCR", key]);
  if (n === 1) await redis(["EXPIRE", key, seconds]);
  if (n > max) throw fail(429, "rate_limited");
}

export async function body(req) {
  let b = req.body;
  if (b === undefined) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    b = Buffer.concat(chunks).toString("utf8");
  }
  if (Buffer.isBuffer(b)) b = b.toString("utf8");
  if (typeof b === "string") b = b ? parse(b, null) : {};
  if (!b || typeof b !== "object" || Array.isArray(b)) throw fail(400, "bad_request");
  return b;
}

export function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function newId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
}

/** Wrap a handler: method routing, JSON errors, no caching by default. */
export function route(methods) {
  return async function handler(req, res) {
    res.setHeader("cache-control", "no-store");
    const fn = methods[req.method];
    if (!fn) return res.status(405).json({ error: "method_not_allowed" });
    try {
      const out = await fn(req, res);
      if (out !== undefined) res.status(200).json(out);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.status ? e.message : "server_error" });
    }
  };
}

/** Calendar day in UTC, `offset` days back, e.g. "2026-11-16". */
export const day = (offset = 0) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
