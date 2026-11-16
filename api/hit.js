import { redis, limit, day, route } from "../lib/util.js";

export default route({
  async POST(req) {
    await limit(req, "hit", 30, 86400);
    const key = "hits:d:" + day();
    await redis(["INCR", "hits:total"], ["INCR", key], ["EXPIRE", key, 60 * 86400]);
    return { ok: true };
  },
});
