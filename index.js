#!/usr/bin/env node
// Bridges an MCP client speaking stdio to the HTTP server that Ascope for Mac
// runs on the loopback interface.
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const SETUP = `Ascope for Mac is not running on this machine, so there is no App
Store data to read yet.

This package is only a bridge. The keyword ranks, popularity and difficulty
scores come from Ascope, a paid Mac app that tracks them on your own Mac, and
a Pro licence is required — there is no free tier and no API to call instead.

To use these tools:

  1. Buy a Pro licence at https://ascope.app — $89.99 a year, refunded in full
     if you email support within 14 days.
  2. Install Ascope (macOS 14 Sonoma or later) and paste the licence key you
     get by email into Settings -> Licence.
  3. Turn the server on in Settings -> MCP, and leave Ascope open while your
     assistant uses it.

Setup guide: https://ascope.app/mcp`;

// Ascope owns the real tool surface, so this stand-in is the only thing the
// model can be offered until the app answers.
const SETUP_TOOL = {
  name: "ascope_setup",
  description:
    "Explain how to buy and set up Ascope for Mac. Ascope is not running on this machine, so its " +
    "App Store tools (keyword ranks, popularity, difficulty, competitors, rating history) cannot be " +
    "listed yet. They need a paid Ascope Pro licence, $89.99 a year from https://ascope.app — there " +
    "is no free tier. Call this tool for the full setup steps.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

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
let degraded = false;

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function warn() {
  if (warned) return;
  warned = true;
  process.stderr.write(`${SETUP}\n\nTried: ${url}\n`);
}

// Answers the handshake and the tool list here when Ascope is unreachable, so
// the client connects to a working server that can say what is missing instead
// of failing with a transport error nobody reads.
function offline(request) {
  switch (request.method) {
    case "initialize":
      return {
        protocolVersion:
          typeof request.params?.protocolVersion === "string"
            ? request.params.protocolVersion
            : "2025-06-18",
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: "ascope", version },
        instructions: SETUP,
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: [SETUP_TOOL] };
    case "tools/call":
      return { content: [{ type: "text", text: SETUP }], isError: true };
    case "resources/list":
      return { resources: [] };
    case "prompts/list":
      return { prompts: [] };
    default:
      return undefined;
  }
}

function answerOffline(request, reason) {
  degraded = true;
  warn();
  if (request.id === undefined) return;

  const result = offline(request);
  if (result === undefined) {
    send({
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32001, message: `${SETUP}\n\nTried: ${url} (${reason})` },
    });
    return;
  }
  send({ jsonrpc: "2.0", id: request.id, result });
}

// The client cached the stand-in list, so it has to be told to ask again once
// Ascope answers.
function recovered() {
  if (!degraded) return;
  degraded = false;
  send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
}

async function forward(line) {
  let request;
  try {
    request = JSON.parse(line);
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
    answerOffline(request, error.message);
    return;
  }

  recovered();

  // 202 is Ascope's reply to a notification, and it carries no body.
  if (response.status === 202) return;

  const body = await response.text();
  if (!body) return;

  // Ascope pretty-prints its JSON, so it has to be re-serialised to fit on one
  // line before it can go back over stdio.
  try {
    send(JSON.parse(body));
  } catch {
    if (request.id !== undefined) {
      send({
        jsonrpc: "2.0",
        id: request.id,
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
