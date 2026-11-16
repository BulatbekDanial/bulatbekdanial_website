import { body, codeMatches, limit, fail, route } from "../lib/util.js";

export default route({
  async POST(req) {
    if (!process.env.ADMIN_CODE) throw fail(503, "no_admin_code");
    const { code } = await body(req);
    if (codeMatches(code)) return { ok: true };
    // Only wrong guesses count toward the limit: 8 per 15 minutes from one address.
    await limit(req, "login", 8, 900);
    throw fail(401, "wrong_code");
  },
});
