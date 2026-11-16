import { body, limit, fail, route } from "../lib/util.js";

// Optional assistant. Works only when ANTHROPIC_API_KEY is set; each answer is billed to that key.
export default route({
  async POST(req) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw fail(404, "disabled");
    const { turns } = await body(req);
    if (!Array.isArray(turns) || !turns.length || turns.length > 14) throw fail(400, "bad_request");
    const messages = turns.map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", content: String(t.content || "").slice(0, 14000) }));
    if (messages.some((m) => !m.content) || messages[messages.length - 1].role !== "user") throw fail(400, "bad_request");
    await limit(req, "ask", 20, 86400);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5", max_tokens: 400, messages }),
    });
    if (!r.ok) throw fail(502, "assistant_error");
    const out = await r.json();
    const answer = (out.content || []).filter((p) => p.type === "text").map((p) => p.text).join("").trim();
    if (!answer) throw fail(502, "assistant_error");
    return { text: answer };
  },
});
