import { redis, parse, body, requireAdmin, limit, fail, text, newId, route } from "../lib/util.js";

const load = async () => parse((await redis(["GET", "msg:list"]))[0], []);
const store = (list) => redis(["SET", "msg:list", JSON.stringify(list.slice(-200))]);

export default route({
  async POST(req) {
    const b = await body(req);
    const name = text(b.name, 60);
    const contact = text(b.contact, 120);
    const message = text(b.text, 1500);
    if (!name || !contact || message.length < 2) throw fail(400, "bad_request");
    await limit(req, "message", 3, 3600);
    const list = await load();
    list.push({ id: newId(), name, contact, text: message, ts: Date.now() });
    await store(list);
    return { ok: true };
  },
  async DELETE(req) {
    requireAdmin(req);
    const list = await load();
    await store(list.filter((m) => m.id !== String(req.query.id || "")));
    return { ok: true };
  },
});
