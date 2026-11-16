import { redis, parse, body, requireAdmin, fail, text, route } from "../lib/util.js";

const ID = /^[\w-]{1,40}$/;
const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_PHOTOS = 20;

export default route({
  async GET(req, res) {
    const id = String(req.query.id || "");
    if (!ID.test(id)) throw fail(400, "bad_request");
    const [src] = await redis(["GET", "g:img:" + id]);
    const m = typeof src === "string" ? DATA_URL.exec(src) : null;
    if (!m) throw fail(404, "not_found");
    // The address carries a version number, so the bytes behind one address never change.
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.setHeader("content-type", m[1]);
    res.status(200).send(Buffer.from(m[2], "base64"));
  },
  async POST(req) {
    requireAdmin(req);
    const b = await body(req);
    const id = String(b.id || "");
    if (!ID.test(id)) throw fail(400, "bad_request");
    const [raw] = await redis(["GET", "g:index"]);
    const index = parse(raw, {});
    const entry = index[id] || { v: 0 };
    const commands = [];
    if (b.src !== undefined) {
      if (typeof b.src !== "string" || b.src.length > 400000 || !DATA_URL.test(b.src)) throw fail(400, "bad_image");
      if (!index[id] && Object.keys(index).length >= MAX_PHOTOS) throw fail(409, "gallery_full");
      commands.push(["SET", "g:img:" + id, b.src]);
      entry.v = Date.now();
    } else if (!index[id]) throw fail(404, "not_found");
    entry.caption = text(b.caption, 140);
    entry.order = Number(b.order) || 0;
    entry.project = ID.test(String(b.project || "")) ? String(b.project) : "";
    index[id] = entry;
    commands.push(["SET", "g:index", JSON.stringify(index)]);
    await redis(...commands);
    return { ok: true, v: entry.v };
  },
  async DELETE(req) {
    requireAdmin(req);
    const id = String(req.query.id || "");
    if (!ID.test(id)) throw fail(400, "bad_request");
    const [raw] = await redis(["GET", "g:index"]);
    const index = parse(raw, {});
    delete index[id];
    await redis(["SET", "g:index", JSON.stringify(index)], ["DEL", "g:img:" + id]);
    return { ok: true };
  },
});
