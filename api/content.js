import { redis, parse, body, requireAdmin, fail, route } from "../lib/util.js";

const KEYS = ["about", "photo", "contact", "awards", "projects", "certificates", "skills", "writing", "testimonials", "education", "experience"];

export default route({
  // Everything the page needs in one request: section documents and the photo list (without image bytes).
  async GET() {
    const values = await redis(["MGET", ...KEYS.map((k) => "c:" + k)], ["GET", "g:index"]);
    const content = {};
    KEYS.forEach((k, i) => {
      const v = parse(values[0][i], null);
      if (v && typeof v === "object") content[k] = v;
    });
    const index = parse(values[1], {});
    const gallery = Object.keys(index).map((id) => ({ id, ...index[id] }));
    return { content, gallery, features: { ai: Boolean(process.env.ANTHROPIC_API_KEY) } };
  },
  async POST(req) {
    requireAdmin(req);
    const { key, data } = await body(req);
    if (!KEYS.includes(key) || !data || typeof data !== "object" || Array.isArray(data)) throw fail(400, "bad_request");
    const json = JSON.stringify(data);
    if (json.length > 400000) throw fail(413, "too_large");
    await redis(["SET", "c:" + key, json]);
    return { ok: true };
  },
});
