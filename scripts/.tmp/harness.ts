import { createMcpHandler } from "mcp-handler";
import { registrarToolsYamasend, INSTRUCCIONES_SERVIDOR } from "@/lib/mcp/tools";
import { runWithAccessToken } from "@/lib/supabase/request-auth";
import { crearCodigoConfirmacion, verificarCodigoConfirmacion } from "@/lib/mcp/confirmacion";

const h = createMcpHandler((s) => registrarToolsYamasend(s), { serverInfo: { name: "YamaSend", version: "1.0.0" }, instructions: INSTRUCCIONES_SERVIDOR });

async function rpc(body: unknown, proto = "2025-11-25") {
  const res = await runWithAccessToken("fake.token.x", () => h(new Request("http://x/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": proto },
    body: JSON.stringify(body),
  })));
  const txt = await res.text();
  const m = txt.match(/data: (.*)/);
  return JSON.parse(m ? m[1] : txt);
}

(async () => {
  const init = await rpc({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
  console.log("init:", init.result?.serverInfo, "instr:", Boolean(init.result?.instructions));
  const list = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  for (const t of list.result.tools) console.log(t.name.padEnd(26), JSON.stringify(t.annotations), t.title, "| params:", Object.keys(t.inputSchema?.properties ?? {}).join(","));
  const call = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "listar_campanas", arguments: {} } });
  console.log("call listar_campanas:", JSON.stringify(call.result ?? call.error));
  const bad = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ver_metricas", arguments: { periodo: "90d" } } });
  console.log("arg inválido:", JSON.stringify(bad.result ?? bad.error).slice(0, 200));
  // códigos
  const d = { a: 1, b: ["x", "y"] };
  const c = crearCodigoConfirmacion("campana", "u1", d)!;
  console.log("codigo", c, verificarCodigoConfirmacion(c, "campana", "u1", { b: ["x", "y"], a: 1 }),
    verificarCodigoConfirmacion(c, "campana", "u2", d), verificarCodigoConfirmacion(c, "campana", "u1", { a: 2, b: ["x", "y"] }),
    verificarCodigoConfirmacion(c, "template", "u1", d), verificarCodigoConfirmacion("zzz", "campana", "u1", d));
})();
