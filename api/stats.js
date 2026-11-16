import { redis, parse, requireAdmin, day, route } from "../lib/util.js";

export default route({
  async GET(req) {
    requireAdmin(req);
    const days = [0, 1, 2, 3, 4, 5, 6].map((d) => "hits:d:" + day(d));
    const [total, perDay, comments, messages] = await redis(["GET", "hits:total"], ["MGET", ...days], ["GET", "cm:list"], ["GET", "msg:list"]);
    const counts = perDay.map((n) => Number(n) || 0);
    return {
      visits: { total: Number(total) || 0, today: counts[0], week: counts.reduce((a, b) => a + b, 0) },
      comments: parse(comments, []),
      messages: parse(messages, []),
    };
  },
});
