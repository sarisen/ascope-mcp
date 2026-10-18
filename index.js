#!/usr/bin/env node
// Bridges an MCP client speaking stdio to the HTTP server that Ascope for Mac
// runs on the loopback interface.
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";

const HELP = `Ascope's MCP server is not reachable at %URL%.

Open Ascope, activate a Pro license and turn the server on in Settings -> MCP.
Ascope has to stay open while your assistant uses it.

Download: https://ascope.app      Setup guide: https://ascope.app/mcp`;

function resolveEndpoint() {
  if (process.env.ASCOPE_MCP_URL) return process.env.ASCOPE_MCP_URL;
  let port = 47321;
  if (process.platform === "darwin") {
    try {
      const stored = execFileSync("defaults", ["read", "app.ascope.mac", "mcpPort"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (Number(stored) > 0) port = Number(stored);
    } catch {
      // Never configured, or Ascope was never launched: the default port stands.
    }
  }
  return `http://127.0.0.1:${port}/mcp`;
}

const url = resolveEndpoint();
let warned = false;

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function warn() {
  if (warned) return;
  warned = true;
  process.stderr.write(HELP.replace("%URL%", url) + "\n");
}

async function forward(line) {
  let id;
  try {
    id = JSON.parse(line).id;
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: line,
    });
  } catch (error) {
    warn();
    if (id !== undefined) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32001, message: `Ascope is not running (${url}): ${error.message}` },
      });
    }
    return;
  }

  // 202 is Ascope's reply to a notification, and it carries no body.
  if (response.status === 202) return;

  const body = await response.text();
  if (!body) return;

  // Ascope pretty-prints its JSON, so it has to be re-serialised to fit on one
  // line before it can go back over stdio.
  try {
    send(JSON.parse(body));
  } catch {
    if (id !== undefined) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: `Ascope returned HTTP ${response.status}` },
      });
    }
  }
}

const pending = new Set();
const lines = createInterface({ input: process.stdin });

lines.on("line", (line) => {
  if (!line.trim()) return;
  const call = forward(line).finally(() => pending.delete(call));
  pending.add(call);
});

// Requests already in flight still have to be answered after stdin closes.
lines.on("close", async () => {
  while (pending.size) await Promise.allSettled(pending);
  process.exit(0);
});
