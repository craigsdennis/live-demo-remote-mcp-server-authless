import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { env } from "cloudflare:workers"

// Helpers
const GOVEE_HOST = "https://openapi.api.govee.com";

function hexToRGBColor(hex: string): number {
  // Remove the # if present
  const cleanHex = hex.replace("#", "");

  // Parse the hex string to get r, g, b values
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Convert to Govee's integer format: ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | ((b & 0xFF) << 0)
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | ((b & 0xff) << 0);
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "Authless Calculator",
    version: "1.0.0",
  });

  async init() {
    // Simple addition tool
    this.server.tool(
      "add",
      { a: z.number(), b: z.number() },
      async ({ a, b }) => ({
        content: [{ type: "text", text: String(a + b) }],
      })
    );

    // Calculator tool with multiple operations
    this.server.tool(
      "calculate",
      {
        operation: z.enum(["add", "subtract", "multiply", "divide"]),
        a: z.number(),
        b: z.number(),
      },
      async ({ operation, a, b }) => {
        let result: number;
        switch (operation) {
          case "add":
            result = a + b;
            break;
          case "subtract":
            result = a - b;
            break;
          case "multiply":
            result = a * b;
            break;
          case "divide":
            if (b === 0)
              return {
                content: [
                  {
                    type: "text",
                    text: "Error: Cannot divide by zero",
                  },
                ],
              };
            result = a / b;
            break;
        }
        return { content: [{ type: "text", text: String(result) }] };
      }
    );

    this.server.tool(
      "changeLight",
      {
        hexColor: z.string(),
      },
      async ({ hexColor }) => {
        const rgb = hexToRGBColor(hexColor);
        console.log({ rgb, hexColor });
        const request = {
          requestId: crypto.randomUUID(),
          payload: {
            sku: env.GOVEE_SKU,
            device: env.GOVEE_DEVICE_ID,
            capability: {
              type: "devices.capabilities.color_setting",
              instance: "colorRgb",
              value: rgb,
            },
          },
        };
        const response = await fetch(
          `${GOVEE_HOST}/router/api/v1/device/control`,
          {
            headers: {
              "Content-Type": "application/json",
              "Govee-API-Key": env.GOVEE_API_KEY,
            },
            method: "POST",
            body: JSON.stringify(request),
          }
        );
        console.log({ success: response.ok });
        const obj = await response.json();
        console.log({ request: JSON.stringify(request) });
        console.log({ body: JSON.stringify(obj) });

        return {
          content: [{ type: "text", text: `Changed light to #${hexColor}` }],
        };
      }
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      return MyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};
