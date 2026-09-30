import { createMcpHandler } from "mcp-handler";
import { registrarToolsYamasend } from "@/lib/mcp/tools";
import { runWithAccessToken } from "@/lib/supabase/request-auth";
const h = createMcpHandler((s) => registrarToolsYamasend(s), { serverInfo: { name: "YamaSend", version: "1.0.0" } });
(async () => {
  for (const [method, name] of [["server/discover", ""], ["tools/list", ""], ["tools/call", "ver_mi_cuenta"]] as const) {
    const body: Record<string, unknown> = { jsonrpc: "2.0", id: 1, method, params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } } };
    if (name) (body.params as Record<string, unknown>).name = name, (body.params as Record<string, unknown>).arguments = {};
    const res = await runWithAccessToken("fake", () => h(new Request("http://x/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2026-07-28", "mcp-method": method, ...(name ? { "mcp-name": name } : {}) }, body: JSON.stringify(body) })));
    console.log(method, res.status, (await res.text()).slice(0, 220));
  }
})();
