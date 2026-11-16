import { redis, parse, body, requireAdmin, limit, fail, text, newId, route } from "../lib/util.js";

const load = async () => parse((await redis(["GET", "cm:list"]))[0], []);
const store = (list) => redis(["SET", "cm:list", JSON.stringify(list.slice(-200))]);

export default route({
  // Visitors only ever receive notes the owner has approved.
  async GET() {
    const list = await load();
    return { comments: list.filter((c) => c.ok).map(({ id, name, text, ts }) => ({ id, name, text, ts })).reverse() };
  },
  async POST(req) {
    const b = await body(req);
    const name = text(b.name, 40);
    const note = text(b.text, 500);
    if (!name || note.length < 2) throw fail(400, "bad_request");
    await limit(req, "comment", 3, 3600);
    const list = await load();
    list.push({ id: newId(), name, text: note, ts: Date.now(), ok: false });
    await store(list);
    return { ok: true };
  },
  async PATCH(req) {
    requireAdmin(req);
    const { id } = await body(req);
    const list = await load();
    const item = list.find((c) => c.id === id);
    if (!item) throw fail(404, "not_found");
    item.ok = true;
    await store(list);
    return { ok: true };
  },
  async DELETE(req) {
    requireAdmin(req);
    const list = await load();
    await store(list.filter((c) => c.id !== String(req.query.id || "")));
    return { ok: true };
  },
});
