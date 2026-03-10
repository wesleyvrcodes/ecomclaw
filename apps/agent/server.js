import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const PORT = parseInt(process.env.PORT || "8080");
let SOUL_MD = (process.env.AGENT_SOUL_MD || "You are a helpful AI assistant.").replace(/\\n/g, "\n");

// Memory persistence: load from disk first (survives container restarts), fall back to env var
const MEMORY_FILE = path.join(process.env.HOME || "/tmp", ".openclaw-memory.md");

function loadMemoryFromDisk() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const diskMemory = fs.readFileSync(MEMORY_FILE, "utf-8");
      if (diskMemory.length > 0) {
        console.log(`[Memory] Loaded ${diskMemory.length} chars from disk: ${MEMORY_FILE}`);
        return diskMemory;
      }
    }
  } catch (err) {
    console.error("[Memory] Failed to load from disk:", err.message);
  }
  return null;
}

function saveMemoryToDisk() {
  try {
    fs.writeFileSync(MEMORY_FILE, MEMORY_MD, "utf-8");
  } catch (err) {
    console.error("[Memory] Failed to save to disk:", err.message);
  }
}

// Priority: disk (has learned state from previous runs) > env var (from deploy)
let MEMORY_MD = loadMemoryFromDisk() || process.env.AGENT_MEMORY_MD || "";
// Persist initial memory to disk if loaded from env
if (MEMORY_MD && !fs.existsSync(MEMORY_FILE)) saveMemoryToDisk();

// Worksheet persistence (JSON array of rows)
const WORKSHEET_FILE = path.join(process.env.HOME || "/tmp", ".openclaw-worksheet.json");

function loadWorksheetFromDisk() {
  try {
    if (fs.existsSync(WORKSHEET_FILE)) {
      const data = fs.readFileSync(WORKSHEET_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[Worksheet] Failed to load from disk:", err.message);
  }
  return null;
}

function saveWorksheetToDisk() {
  try {
    fs.writeFileSync(WORKSHEET_FILE, JSON.stringify(WORKSHEET_DATA), "utf-8");
  } catch (err) {
    console.error("[Worksheet] Failed to save to disk:", err.message);
  }
}

let WORKSHEET_DATA = loadWorksheetFromDisk() || (() => {
  try { return JSON.parse(process.env.AGENT_WORKSHEET_JSON || "[]"); } catch { return []; }
})();
if (WORKSHEET_DATA.length > 0 && !fs.existsSync(WORKSHEET_FILE)) saveWorksheetToDisk();
// Agent settings persistence (structured config from the platform UI)
const SETTINGS_FILE = path.join(process.env.HOME || "/tmp", ".openclaw-settings.json");

function loadSettingsFromDisk() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[Settings] Failed to load from disk:", err.message);
  }
  return null;
}

function saveSettingsToDisk() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(AGENT_SETTINGS), "utf-8");
  } catch (err) {
    console.error("[Settings] Failed to save to disk:", err.message);
  }
}

let AGENT_SETTINGS = loadSettingsFromDisk() || (() => {
  try { return JSON.parse(process.env.AGENT_SETTINGS_JSON || "{}"); } catch { return {}; }
})();
if (Object.keys(AGENT_SETTINGS).length > 0 && !fs.existsSync(SETTINGS_FILE)) saveSettingsToDisk();

// Task queue persistence
const TASK_FILE = path.join(process.env.HOME || "/tmp", ".openclaw-tasks.json");
let TASK_QUEUE = []; // Array of task objects

function loadTasksFromDisk() {
  try {
    if (fs.existsSync(TASK_FILE)) {
      const data = fs.readFileSync(TASK_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[Tasks] Failed to load from disk:", err.message);
  }
  return [];
}

function saveTasksToDisk() {
  try {
    fs.writeFileSync(TASK_FILE, JSON.stringify(TASK_QUEUE), "utf-8");
  } catch (err) {
    console.error("[Tasks] Failed to save to disk:", err.message);
  }
}

TASK_QUEUE = loadTasksFromDisk();

// Cron job persistence
const CRON_FILE = path.join(process.env.HOME || "/tmp", ".openclaw-cron.json");
let CRON_JOBS = []; // Array of cron job objects

function loadCronFromDisk() {
  try {
    if (fs.existsSync(CRON_FILE)) {
      const data = fs.readFileSync(CRON_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[Cron] Failed to load from disk:", err.message);
  }
  return [];
}

function saveCronToDisk() {
  try {
    fs.writeFileSync(CRON_FILE, JSON.stringify(CRON_JOBS), "utf-8");
  } catch (err) {
    console.error("[Cron] Failed to save to disk:", err.message);
  }
}

CRON_JOBS = loadCronFromDisk();

const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";
let ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
let OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
let OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
let AI_PROVIDER = process.env.AI_PROVIDER || ""; // "anthropic", "openai", or "openrouter" — empty = auto-detect
let AI_MODEL = process.env.AI_MODEL || ""; // e.g. "gpt-4o", "claude-sonnet-4-5-20250514", "anthropic/claude-sonnet-4.5"
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || "";
let SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || "";
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || "";
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || "";

// In-memory chat history per session
const sessions = new Map();

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// SSE streaming helpers
function sseStart(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sseEnd(res) {
  res.write("event: done\ndata: {}\n\n");
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

function authenticate(req) {
  if (!GATEWAY_TOKEN) return true;
  const auth = req.headers.authorization;
  return auth === `Bearer ${GATEWAY_TOKEN}`;
}

// Refresh Shopify access token using client credentials
async function refreshShopifyToken() {
  if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET || !SHOPIFY_STORE_URL) return false;
  const shop = SHOPIFY_STORE_URL.includes("://")
    ? new URL(SHOPIFY_STORE_URL).hostname
    : SHOPIFY_STORE_URL;
  try {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.access_token) {
      SHOPIFY_ACCESS_TOKEN = data.access_token;
      console.log("Shopify token refreshed successfully");
      return true;
    }
    return false;
  } catch (e) {
    console.error("Failed to refresh Shopify token:", e.message);
    return false;
  }
}

// Shopify API helper — auto-refreshes token on 401
async function shopifyRequest(endpoint, method = "GET", body = null) {
  if (!SHOPIFY_STORE_URL) return null;
  if (!SHOPIFY_ACCESS_TOKEN && SHOPIFY_CLIENT_ID) {
    await refreshShopifyToken();
  }
  if (!SHOPIFY_ACCESS_TOKEN) return null;

  const baseUrl = SHOPIFY_STORE_URL.startsWith("http")
    ? SHOPIFY_STORE_URL
    : `https://${SHOPIFY_STORE_URL}`;
  const url = `${baseUrl}/admin/api/2025-01/${endpoint}`;

  const doRequest = async () => {
    const opts = {
      method,
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(url, opts);
  };

  let res = await doRequest();

  // If 401, try refreshing the token and retry once
  if (res.status === 401 && SHOPIFY_CLIENT_ID) {
    const refreshed = await refreshShopifyToken();
    if (refreshed) {
      res = await doRequest();
    }
  }

  // Retry with exponential backoff on 429 (rate limit) or 5xx errors
  const RETRY_DELAYS = [1000, 2000, 4000];
  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (res.status !== 429 && res.status < 500) break;
    const delay = RETRY_DELAYS[attempt];
    console.log(`[Shopify] ${res.status} error, retrying in ${delay}ms (attempt ${attempt + 1}/${RETRY_DELAYS.length})...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    res = await doRequest();
  }

  return res.json();
}

// SSRF protection: block internal/private network URLs
const BLOCKED_URL_PATTERNS = [
  /^https?:\/\/169\.254\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/127\./,
  /^https?:\/\/0\./,
  /^https?:\/\/localhost/i,
  /^https?:\/\/\[::1\]/,
  /^https?:\/\/\[fc/i,
  /^https?:\/\/\[fd/i,
  /^https?:\/\/\[fe80:/i,
];

function isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return !BLOCKED_URL_PATTERNS.some(p => p.test(url));
  } catch {
    return false;
  }
}

// Tool definitions for AI providers
const SHOPIFY_TOOLS_OPENAI = [
  {
    type: "function",
    function: {
      name: "shopify_get_products",
      description: "Get a list of products from the Shopify store. Returns product titles, descriptions, tags, variants, prices, and images.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of products to fetch (max 250, default 50)" },
          collection_id: { type: "string", description: "Filter by collection ID" },
          status: { type: "string", enum: ["active", "draft", "archived"], description: "Filter by status" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shopify_get_product",
      description: "Get a single product by ID with full details including variants, images, and metafields.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "The Shopify product ID" },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shopify_update_product",
      description: "Update a product's title, description, tags, variants, images, or other fields. Use this to map images to variants by setting image_id on each variant. You can also update variant prices, SKUs, etc.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "The Shopify product ID" },
          title: { type: "string", description: "New product title" },
          body_html: { type: "string", description: "New product description in HTML" },
          tags: { type: "string", description: "Comma-separated tags" },
          product_type: { type: "string", description: "Product type/category" },
          seo_title: { type: "string", description: "SEO meta title (metafield)" },
          seo_description: { type: "string", description: "SEO meta description (metafield)" },
          variants: {
            type: "array",
            description: "Update variants — use this to set image_id, prices, SKUs, etc. Each variant needs its 'id' (from the created product) plus the fields to update.",
            items: {
              type: "object",
              properties: {
                id: { type: "number", description: "Variant ID (required for updates — get this from shopify_get_product or the create response)" },
                image_id: { type: "number", description: "Image ID to assign to this variant (maps a specific product image to this variant)" },
                price: { type: "string", description: "Variant price" },
                compare_at_price: { type: "string", description: "Compare-at price" },
                sku: { type: "string", description: "SKU" },
                option1: { type: "string", description: "First option value" },
                option2: { type: "string", description: "Second option value" },
                option3: { type: "string", description: "Third option value" },
              },
              required: ["id"],
            },
          },
          images: {
            type: "array",
            description: "Update product images — reorder, add, or modify alt text. Each image with an existing 'id' is updated; images with only 'src' are added as new.",
            items: {
              type: "object",
              properties: {
                id: { type: "number", description: "Existing image ID (for updates)" },
                src: { type: "string", description: "Image URL (for new images)" },
                alt: { type: "string", description: "Alt text" },
                position: { type: "number", description: "Image position (1-based)" },
              },
            },
          },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shopify_create_product",
      description: "Create a new product in the Shopify store with full details. Include images, variants, and HTML description. ALWAYS ask user for confirmation before calling this.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Product title" },
          body_html: { type: "string", description: "Product description in HTML with headers, lists, and formatting" },
          vendor: { type: "string", description: "Product vendor/brand" },
          product_type: { type: "string", description: "Product type/category" },
          tags: { type: "string", description: "Comma-separated tags (category, material, style, color, etc.)" },
          status: { type: "string", enum: ["active", "draft"], description: "Product status (default: draft)" },
          images: {
            type: "array",
            description: "Array of image objects with src URLs. Include ALL product images from the source.",
            items: {
              type: "object",
              properties: {
                src: { type: "string", description: "Image URL" },
                alt: { type: "string", description: "Alt text for the image" },
              },
              required: ["src"],
            },
          },
          variants: {
            type: "array",
            description: "Array of product variants (sizes, colors, etc.)",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Variant title" },
                option1: { type: "string", description: "First option value (e.g. size: S, M, L)" },
                option2: { type: "string", description: "Second option value (e.g. color: Red, Blue)" },
                option3: { type: "string", description: "Third option value" },
                price: { type: "string", description: "Variant price" },
                compare_at_price: { type: "string", description: "Original/compare price" },
                sku: { type: "string", description: "SKU" },
                inventory_quantity: { type: "number", description: "Stock quantity" },
              },
            },
          },
          options: {
            type: "array",
            description: "Product options like Size, Color. Each option has a name and values.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Option name (e.g. Size, Color)" },
                values: { type: "array", items: { type: "string" }, description: "Option values" },
              },
              required: ["name"],
            },
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shopify_get_orders",
      description: "Get recent orders from the Shopify store.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of orders (max 250, default 50)" },
          status: { type: "string", enum: ["open", "closed", "cancelled", "any"], description: "Order status filter" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shopify_get_collections",
      description: "Get all collections (custom and smart) from the store. Smart collections include their rules so you can see which tags/conditions auto-add products. Use this to determine which collection a product belongs to.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of collections per type (default 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shopify_add_to_collection",
      description: "Add a product to a custom collection. Use this after creating a product to place it in the right collection. For smart collections, just ensure the product has the correct tags — smart collections auto-include products that match their rules.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "number", description: "The product ID to add" },
          collection_id: { type: "number", description: "The custom collection ID to add the product to" },
        },
        required: ["product_id", "collection_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shopify_remove_from_collection",
      description: "Remove a product from a custom collection by deleting the collect.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "number", description: "The product ID to remove" },
          collection_id: { type: "number", description: "The custom collection ID to remove the product from" },
        },
        required: ["product_id", "collection_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch content from a URL. Useful to look up product pages, competitor sites, or external data sources.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to fetch" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Save or update your memory/preferences. Use this to remember user preferences, instructions, rules, and learnings. The content you write here persists across conversations. Always include a '## My Preferences' section at the top with the user's preferences, followed by any learnings.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "The full memory content to save (markdown format). This REPLACES the entire memory, so include everything you want to remember." },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_worksheet",
      description: "Read the shared worksheet. The worksheet is a table where the boss can paste product URLs, data, or tasks. Returns all rows with their columns. Use this when the boss says 'process the worksheet', 'import from worksheet', or 'verwerk de worksheet'.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_worksheet_row",
      description: "Add or update a row in the shared worksheet. Use this to write results, status updates, or processed data back. Set status to 'done'/'error'/'processing'. You can also ADD new rows (e.g. research results, competitor products found).",
      parameters: {
        type: "object",
        properties: {
          row_id: { type: "string", description: "Unique row ID. Use existing ID to update, or a new one to add a row." },
          data: {
            type: "object",
            description: "Key-value pairs for columns (e.g. { \"url\": \"...\", \"title\": \"...\", \"status\": \"done\" })",
            additionalProperties: { type: "string" },
          },
        },
        required: ["row_id", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_worksheet_row",
      description: "Delete a row from the shared worksheet by its ID.",
      parameters: {
        type: "object",
        properties: {
          row_id: { type: "string", description: "The ID of the row to delete." },
        },
        required: ["row_id"],
      },
    },
  },
];

// Anthropic tool format
const SHOPIFY_TOOLS_ANTHROPIC = SHOPIFY_TOOLS_OPENAI.map((t) => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters,
}));

// Auto-translate product content if listing language is set and source is in a different language
async function translateProductContent(product, options, variants) {
  const targetLang = AGENT_SETTINGS.listingLanguage;
  if (!targetLang) return { product, options, variants };

  // Build a compact payload for translation detection + translation
  const sampleText = [
    product.title || "",
    product.body_html ? product.body_html.replace(/<[^>]+>/g, " ").slice(0, 300) : "",
    ...(options || []).map(o => `${o.name}: ${(o.values || []).join(", ")}`),
  ].filter(Boolean).join(" | ");

  if (!sampleText.trim()) return { product, options, variants };

  const translationPrompt = `You are a product content translator. Detect the language of the source content below and translate it to ${targetLang} if it's not already in ${targetLang}.

RESPOND WITH ONLY VALID JSON, no markdown, no code fences.

Source content:
- Title: ${product.title || ""}
- Description (HTML): ${product.body_html || ""}
- Options: ${JSON.stringify(options || [])}
- Variant option values: ${JSON.stringify((variants || []).slice(0, 5).map(v => ({ option1: v.option1, option2: v.option2, option3: v.option3 })))}

Rules:
1. If the content is ALREADY in ${targetLang}, return {"skip": true}
2. If translation is needed, return:
{
  "skip": false,
  "title": "translated title",
  "body_html": "translated HTML (keep ALL HTML tags exactly as-is, only translate the text content)",
  "options": [{"name": "translated name", "values": ["translated value 1", ...]}],
  "value_map": {"original value": "translated value", ...}
}
3. For option values: translate color names, material names, style names. Keep universal values as-is: S, M, L, XL, XXL, numeric sizes (38, 40, 42), hex colors.
4. The value_map must contain ALL original option values that were translated, so we can update all variants.
5. Keep the same HTML structure in body_html. Only translate the text, not the tags.`;

  try {
    const provider = getActiveProvider();
    let result;

    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [{ role: "user", content: translationPrompt }],
      });
      result = resp.content.map(b => b.type === "text" ? b.text : "").join("");
    } else {
      const client = provider === "openrouter" ? createOpenRouterClient() : new OpenAI({ apiKey: OPENAI_API_KEY });
      const model = provider === "openrouter" ? (AI_MODEL || "anthropic/claude-haiku-4-5") : "gpt-4o-mini";
      const resp = await client.chat.completions.create({
        model,
        max_tokens: 4000,
        messages: [{ role: "user", content: translationPrompt }],
      });
      result = resp.choices[0]?.message?.content || "";
    }

    // Parse response — strip markdown fences if present
    result = result.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(result);

    if (parsed.skip) {
      console.log(`[Translate] Content already in ${targetLang}, no translation needed`);
      return { product, options, variants };
    }

    console.log(`[Translate] Translating product content to ${targetLang}`);

    // Apply translations
    const translated = { ...product };
    if (parsed.title) translated.title = parsed.title;
    if (parsed.body_html) translated.body_html = parsed.body_html;

    let translatedOptions = options;
    if (parsed.options && parsed.options.length > 0) {
      translatedOptions = parsed.options;
    }

    // Apply value_map to all variants
    let translatedVariants = variants;
    if (parsed.value_map && Object.keys(parsed.value_map).length > 0 && variants) {
      const vmap = parsed.value_map;
      translatedVariants = variants.map(v => ({
        ...v,
        option1: vmap[v.option1] || v.option1,
        option2: v.option2 ? (vmap[v.option2] || v.option2) : v.option2,
        option3: v.option3 ? (vmap[v.option3] || v.option3) : v.option3,
      }));
      console.log(`[Translate] Mapped ${Object.keys(vmap).length} option values: ${JSON.stringify(vmap)}`);
    }

    console.log(`[Translate] Done — title: "${translated.title}", ${translatedOptions?.length || 0} options, ${translatedVariants?.length || 0} variants`);
    return { product: translated, options: translatedOptions, variants: translatedVariants };
  } catch (err) {
    console.error(`[Translate] Translation failed, using original content: ${err.message}`);
    return { product, options, variants };
  }
}

// Execute a tool call
async function executeTool(name, args) {
  try {
    switch (name) {
      case "shopify_get_products": {
        const limit = args.limit || 50;
        let endpoint = `products.json?limit=${limit}`;
        if (args.collection_id) endpoint += `&collection_id=${args.collection_id}`;
        if (args.status) endpoint += `&status=${args.status}`;
        return await shopifyRequest(endpoint);
      }
      case "shopify_get_product": {
        return await shopifyRequest(`products/${args.product_id}.json`);
      }
      case "shopify_update_product": {
        const { product_id, seo_title, seo_description, variants, images, ...fields } = args;
        const updateBody = { product: { ...fields } };
        if (updateBody.product.body_html) {
          updateBody.product.body_html = updateBody.product.body_html.replace(/\\n/g, "\n").replace(/\n/g, "");
        }
        if (seo_title || seo_description) {
          updateBody.product.metafields_global_title_tag = seo_title;
          updateBody.product.metafields_global_description_tag = seo_description;
        }
        if (variants && variants.length > 0) updateBody.product.variants = variants;
        if (images && images.length > 0) updateBody.product.images = images;
        return await shopifyRequest(`products/${product_id}.json`, "PUT", updateBody);
      }
      case "shopify_create_product": {
        const { images, variants, options, ...rest } = args;
        const product = { ...rest, status: args.status || "draft" };
        // Fix image URLs: the AI sometimes rewrites cdn.shopify.com URLs to custom domain URLs
        // Custom domain URLs often fail because Shopify can't import from other stores' custom domains.
        // If we detect custom domain CDN URLs, try to find the cdn.shopify.com equivalents by
        // fetching the source product's .json endpoint.
        if (images && images.length > 0) {
          const hasCustomDomainUrls = images.some(img =>
            img.src && !img.src.includes("cdn.shopify.com") && /\/cdn\/shop\//.test(img.src));

          if (hasCustomDomainUrls) {
            // Extract the source domain from the first custom domain URL
            const firstCustom = images.find(img => img.src && /\/cdn\/shop\//.test(img.src));
            if (firstCustom) {
              const domainMatch = firstCustom.src.match(/^(https?:\/\/[^/]+)/);
              if (domainMatch) {
                const sourceDomain = domainMatch[1];
                console.log(`[Shopify] Detected custom domain image URLs from ${sourceDomain}, attempting to resolve CDN URLs...`);

                // Build a filename-to-src mapping from CDN URLs we might have
                // Try to fetch the product .json to get real CDN URLs
                try {
                  // Find a product URL from the body_html or try common patterns
                  // Use the products.json endpoint to search by title
                  const searchUrl = `${sourceDomain}/products.json?limit=250`;
                  const searchResp = await fetch(searchUrl, {
                    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
                    redirect: "follow",
                  });
                  if (searchResp.ok) {
                    const searchData = await searchResp.json();
                    const allProducts = searchData.products || [];
                    // Find the product whose images match our filenames
                    for (const sp of allProducts) {
                      const spImages = sp.images || [];
                      if (spImages.length === 0) continue;
                      // Check if any of our filenames match
                      const ourFilenames = images.map(img => {
                        const m = (img.src || "").match(/\/([^/?]+)$/);
                        return m ? m[1].split("?")[0] : "";
                      }).filter(Boolean);
                      const spFilenames = spImages.map(img => {
                        const m = (img.src || "").match(/\/([^/?]+)$/);
                        return m ? m[1].split("?")[0] : "";
                      });
                      const overlap = ourFilenames.filter(f => spFilenames.includes(f));
                      if (overlap.length >= Math.min(2, ourFilenames.length)) {
                        // Found the matching product! Build CDN URL map
                        const cdnMap = {};
                        for (const spImg of spImages) {
                          const fn = (spImg.src || "").match(/\/([^/?]+)$/);
                          if (fn) cdnMap[fn[1].split("?")[0]] = spImg.src;
                        }
                        // Replace custom domain URLs with CDN URLs
                        product.images = images.map(img => {
                          const fn = (img.src || "").match(/\/([^/?]+)$/);
                          const filename = fn ? fn[1].split("?")[0] : "";
                          if (filename && cdnMap[filename]) {
                            console.log(`[Shopify] Resolved: ${filename} -> cdn.shopify.com`);
                            return { ...img, src: cdnMap[filename] };
                          }
                          return img;
                        });
                        console.log(`[Shopify] Resolved ${Object.keys(cdnMap).length} image URLs to cdn.shopify.com`);
                        break;
                      }
                    }
                  }
                } catch (err) {
                  console.log(`[Shopify] Could not resolve CDN URLs: ${err.message}`);
                }
              }
            }
          }
          if (!product.images) product.images = images;
        }
        // Clean up body_html: remove literal \n that the AI sometimes puts in HTML
        if (product.body_html) {
          product.body_html = product.body_html.replace(/\\n/g, "\n").replace(/\n/g, "");
        }
        // Auto-translate if listing language is configured
        const txResult = await translateProductContent(product, options, variants);
        const txProduct = txResult.product;
        const txOptions = txResult.options;
        const txVariants = txResult.variants;
        Object.assign(product, txProduct);
        if (txVariants && txVariants.length > 0) product.variants = txVariants;
        else if (variants && variants.length > 0) product.variants = variants;
        if (txOptions && txOptions.length > 0) product.options = txOptions;
        else if (options && options.length > 0) product.options = options;
        console.log(`[Shopify] Creating product "${product.title}" with ${product.images?.length || 0} images, ${product.variants?.length || 0} variants`);
        if (product.images) product.images.forEach((img, i) => console.log(`  Image ${i+1}: ${img.src?.slice(0, 120)}`));
        const result = await shopifyRequest("products.json", "POST", { product });
        const created = result?.product;
        if (created) {
          const uploadedCount = created.images?.length || 0;
          const requestedCount = product.images?.length || 0;
          console.log(`[Shopify] Created product ${created.id} — ${uploadedCount}/${requestedCount} images uploaded`);
          if (uploadedCount < requestedCount) {
            console.log(`[Shopify] WARNING: ${requestedCount - uploadedCount} images failed to upload! Shopify may have rejected some URLs.`);
          }
        }
        return result;
      }
      case "shopify_get_orders": {
        const limit = args.limit || 50;
        const status = args.status || "any";
        return await shopifyRequest(`orders.json?limit=${limit}&status=${status}`);
      }
      case "shopify_get_collections": {
        const limit = args.limit || 50;
        const [custom, smart] = await Promise.all([
          shopifyRequest(`custom_collections.json?limit=${limit}`),
          shopifyRequest(`smart_collections.json?limit=${limit}`),
        ]);
        return { custom_collections: custom?.custom_collections, smart_collections: smart?.smart_collections };
      }
      case "shopify_add_to_collection": {
        const { product_id, collection_id } = args;
        console.log(`[Shopify] Adding product ${product_id} to collection ${collection_id}`);
        const result = await shopifyRequest("collects.json", "POST", {
          collect: { product_id, collection_id },
        });
        if (result?.collect) {
          return { success: true, collect_id: result.collect.id, product_id, collection_id };
        }
        return result;
      }
      case "shopify_remove_from_collection": {
        const { product_id, collection_id } = args;
        // First find the collect linking this product to this collection
        const collects = await shopifyRequest(`collects.json?product_id=${product_id}&collection_id=${collection_id}`);
        const collect = collects?.collects?.[0];
        if (!collect) {
          return { error: "Product is not in this collection" };
        }
        console.log(`[Shopify] Removing collect ${collect.id} (product ${product_id} from collection ${collection_id})`);
        await shopifyRequest(`collects/${collect.id}.json`, "DELETE");
        return { success: true, removed_collect_id: collect.id };
      }
      case "fetch_url": {
        if (!isSafeUrl(args.url)) {
          return { error: "URL not allowed (internal/private addresses are blocked)" };
        }

        // Detect Shopify product URLs and fetch the .json version for complete structured data
        const shopifyProductMatch = args.url.match(/^(https?:\/\/[^/]+\/products\/[^/.?#]+)/);
        if (shopifyProductMatch && !args.url.endsWith(".json")) {
          let jsonUrl = shopifyProductMatch[1] + ".json";
          try {
            let jsonResp = await fetch(jsonUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
              redirect: "follow",
            });

            // If .json gives 404, the slug may have changed. Follow HTML redirect to get the real slug.
            if (!jsonResp.ok) {
              const htmlResp = await fetch(args.url, {
                method: "HEAD",
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                redirect: "follow",
              });
              const finalUrl = htmlResp.url;
              const redirectMatch = finalUrl.match(/^(https?:\/\/[^/]+\/products\/[^/.?#]+)/);
              if (redirectMatch && redirectMatch[1] !== shopifyProductMatch[1]) {
                jsonUrl = redirectMatch[1] + ".json";
                console.log(`[fetch_url] Slug redirected, trying: ${jsonUrl}`);
                jsonResp = await fetch(jsonUrl, {
                  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
                  redirect: "follow",
                });
              }
            }
            if (jsonResp.ok) {
              const productData = await jsonResp.json();
              const p = productData.product;
              if (p) {
                // Build a clean image list with variant mapping info
                const images = (p.images || []).map(img => ({
                  id: img.id,
                  src: img.src,
                  alt: img.alt || "",
                  variant_ids: img.variant_ids || [],
                  position: img.position,
                }));

                // Build variant list with image references
                const variants = (p.variants || []).map(v => ({
                  id: v.id,
                  title: v.title,
                  option1: v.option1,
                  option2: v.option2,
                  option3: v.option3,
                  price: v.price,
                  compare_at_price: v.compare_at_price,
                  sku: v.sku,
                  image_id: v.image_id,
                  price_currency: v.price_currency || null,
                }));

                return {
                  url: args.url,
                  source: "shopify_json",
                  status: jsonResp.status,
                  product: {
                    title: p.title,
                    body_html: p.body_html,
                    vendor: p.vendor,
                    product_type: p.product_type,
                    tags: p.tags,
                    options: p.options?.map(o => ({ name: o.name, values: o.values })) || [],
                    images,
                    variants,
                  },
                  IMPORTANT_NOTE: "When creating the product, use the EXACT image src URLs from this response (cdn.shopify.com URLs). Do NOT rewrite them to the store's custom domain. Shopify can only import from cdn.shopify.com URLs reliably.",
                };
              }
            }
          } catch { /* Fall through to HTML fetch */ }
        }

        // Fallback: regular HTML fetch
        const resp = await fetch(args.url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
          redirect: "follow",
        });
        const contentType = resp.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await resp.json();
          return { url: args.url, status: resp.status, data };
        }
        if (contentType.includes("text/html")) {
          const html = await resp.text();
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 12000);

          // Extract images from HTML
          const imageUrls = new Set();
          const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/gi);
          if (ogMatch) ogMatch.forEach(m => { const u = m.match(/content="([^"]+)"/); if (u) imageUrls.add(u[1]); });
          const imgMatches = html.matchAll(/<img[^>]+src="(https?:\/\/[^"]*(?:product|media|cdn|image|photo|upload)[^"]*)"/gi);
          for (const m of imgMatches) imageUrls.add(m[1]);

          return { url: args.url, status: resp.status, content: text, images: [...imageUrls].slice(0, 20) };
        }
        const text = await resp.text();
        return { url: args.url, status: resp.status, content: text.slice(0, 12000) };
      }
      case "save_memory": {
        MEMORY_MD = args.content;
        saveMemoryToDisk();
        console.log(`[Memory] Agent saved memory directly (${args.content.length} chars)`);
        // Check if consolidation needed after manual save
        maybeConsolidateMemory().catch(err => console.error("[Memory] Consolidation error:", err.message));
        return { success: true, message: "Memory saved successfully." };
      }
      case "read_worksheet": {
        return { rows: WORKSHEET_DATA, count: WORKSHEET_DATA.length };
      }
      case "update_worksheet_row": {
        const idx = WORKSHEET_DATA.findIndex(r => r.id === args.row_id);
        if (idx >= 0) {
          WORKSHEET_DATA[idx] = { id: args.row_id, ...WORKSHEET_DATA[idx], ...args.data };
        } else {
          WORKSHEET_DATA.push({ id: args.row_id, ...args.data });
        }
        saveWorksheetToDisk();
        console.log(`[Worksheet] Row ${args.row_id} ${idx >= 0 ? "updated" : "added"} (${WORKSHEET_DATA.length} total rows)`);
        return { success: true, row_id: args.row_id, total_rows: WORKSHEET_DATA.length };
      }
      case "delete_worksheet_row": {
        const deleteIdx = WORKSHEET_DATA.findIndex(r => r.id === args.row_id);
        if (deleteIdx >= 0) {
          WORKSHEET_DATA.splice(deleteIdx, 1);
          saveWorksheetToDisk();
          console.log(`[Worksheet] Row ${args.row_id} deleted (${WORKSHEET_DATA.length} remaining)`);
          return { success: true, deleted: args.row_id, total_rows: WORKSHEET_DATA.length };
        }
        return { error: `Row ${args.row_id} not found` };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

// Resolve which AI provider to use
function getActiveProvider() {
  if (AI_PROVIDER === "openrouter" && OPENROUTER_API_KEY) return "openrouter";
  if (AI_PROVIDER === "openai" && OPENAI_API_KEY) return "openai";
  if (AI_PROVIDER === "anthropic" && ANTHROPIC_API_KEY) return "anthropic";
  // Auto-detect from available keys
  if (OPENROUTER_API_KEY) return "openrouter";
  if (ANTHROPIC_API_KEY) return "anthropic";
  if (OPENAI_API_KEY) return "openai";
  return "none";
}

function getModel(provider) {
  if (AI_MODEL) return AI_MODEL;
  if (provider === "openrouter") return "anthropic/claude-sonnet-4-5";
  return provider === "openai" ? "gpt-4o" : "claude-sonnet-4-5-20250514";
}

// OpenRouter uses OpenAI-compatible API at https://openrouter.ai/api/v1
function createOpenRouterClient() {
  return new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://ecomclaw.com",
      "X-Title": "EcomClaw Agent",
    },
  });
}

// Memory management: full memory always goes in prompt, periodic consolidation prevents bloat

function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

// Split memory into sections for structured access
function parseMemorySections(memory) {
  const sections = { preferences: "", rules: "", learnings: "", rest: "" };
  if (!memory) return sections;

  const prefMatch = memory.match(/## My Preferences\n([\s\S]*?)(?=\n## |$)/i);
  if (prefMatch) sections.preferences = prefMatch[1].trim();

  const rulesMatch = memory.match(/## Rules\n([\s\S]*?)(?=\n## |$)/i);
  if (rulesMatch) sections.rules = rulesMatch[1].trim();

  const learnMatch = memory.match(/## Learnings\n([\s\S]*?)(?=\n## |$)/i);
  if (learnMatch) sections.learnings = learnMatch[1].trim();

  // Anything else
  const withoutSections = memory
    .replace(/## My Preferences\n[\s\S]*?(?=\n## |$)/i, "")
    .replace(/## Rules\n[\s\S]*?(?=\n## |$)/i, "")
    .replace(/## Learnings\n[\s\S]*?(?=\n## |$)/i, "")
    .trim();
  if (withoutSections) sections.rest = withoutSections;

  return sections;
}

function countBullets(text) {
  if (!text) return 0;
  return text.split(/\n(?=- )/).filter(b => b.trim()).length;
}

// Consolidation threshold: when learnings have 30+ bullets, merge them into rules
const CONSOLIDATION_THRESHOLD = 30;
let consolidationRunning = false;

async function maybeConsolidateMemory() {
  const sections = parseMemorySections(MEMORY_MD);
  const bulletCount = countBullets(sections.learnings);

  if (bulletCount < CONSOLIDATION_THRESHOLD || consolidationRunning) return;

  consolidationRunning = true;
  console.log(`[Memory] Consolidation triggered: ${bulletCount} learnings, merging into rules...`);

  const provider = getActiveProvider();
  if (provider === "none") { consolidationRunning = false; return; }

  const prompt = `You are a memory manager for an AI e-commerce agent. The agent has accumulated many individual learnings over time. Your job is to CONSOLIDATE them into permanent rules WITHOUT losing any information.

CURRENT RULES:
${sections.rules || "(none yet)"}

LEARNINGS TO CONSOLIDATE:
${sections.learnings}

---

Your job:
1. Merge related learnings into clear, permanent rules
2. If a learning contradicts an older one, keep only the newest version
3. If a learning is already covered by an existing rule, drop the learning
4. Group rules by topic (pricing, descriptions, images, tags, etc.)
5. Keep the format as bullet points starting with "- "

Output TWO sections:

RULES:
(All consolidated rules — existing rules merged with new patterns from learnings. These are permanent instructions the agent must always follow.)

REMAINING_LEARNINGS:
(Only learnings that are too specific/recent to be a rule yet, OR one-off facts that don't generalize. If nothing remains, write NONE.)

Be concise but NEVER drop information that could affect the agent's behavior.`;

  try {
    let result = "";
    const model = getReflectionModel(provider);

    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const resp = await client.messages.create({ model, max_tokens: 1500, messages: [{ role: "user", content: prompt }] });
      result = resp.content.map(b => b.type === "text" ? b.text : "").join("");
    } else {
      const client = provider === "openrouter" ? createOpenRouterClient() : new OpenAI({ apiKey: OPENAI_API_KEY });
      const resp = await client.chat.completions.create({ model, max_tokens: 1500, messages: [{ role: "user", content: prompt }] });
      result = resp.choices[0]?.message?.content || "";
    }

    const rulesMatch = result.match(/RULES:\s*([\s\S]*?)(?=REMAINING_LEARNINGS:|$)/i);
    const remainMatch = result.match(/REMAINING_LEARNINGS:\s*([\s\S]*?)$/i);

    const newRules = rulesMatch?.[1]?.trim();
    let remaining = remainMatch?.[1]?.trim();
    if (remaining === "NONE" || remaining === "(none)") remaining = "";

    if (newRules && newRules.length > 20) {
      // Rebuild memory with consolidated structure
      let newMemory = "";
      if (sections.preferences) newMemory += `## My Preferences\n${sections.preferences}\n\n`;
      newMemory += `## Rules\n${newRules}`;
      if (remaining) newMemory += `\n\n## Learnings\n${remaining}`;
      if (sections.rest) newMemory += `\n\n${sections.rest}`;

      const oldBullets = bulletCount + countBullets(sections.rules);
      const newBullets = countBullets(newRules) + countBullets(remaining);

      MEMORY_MD = newMemory.trim();
      saveMemoryToDisk();
      console.log(`[Memory] Consolidated: ${oldBullets} items -> ${newBullets} items (${estimateTokens(MEMORY_MD)} tokens)`);
    }
  } catch (err) {
    console.error("[Memory] Consolidation failed:", err.message);
  } finally {
    consolidationRunning = false;
  }
}

// Build system prompt with store context
function buildSystemPrompt() {
  const provider = getActiveProvider();
  const model = getModel(provider);
  let prompt = SOUL_MD;
  prompt += `\n\n## System Info\n- AI Model: ${model}\n- Provider: ${provider}\n- Date: ${new Date().toISOString().split("T")[0]}`;
  if (SHOPIFY_STORE_URL) {
    prompt += `\n\n## Connected Store\n- URL: ${SHOPIFY_STORE_URL}\n- You have DIRECT API access to this Shopify store via tools.\n- Use the shopify_* tools to read and modify products, orders, and collections.\n- Use fetch_url to look up external websites and product pages.`;
  }
  if (MEMORY_MD) {
    prompt += `\n\n## Agent Memory\n${MEMORY_MD}`;
  }
  // Owner Settings come LAST so they take priority over everything above (including memory)
  if (Object.keys(AGENT_SETTINGS).length > 0) {
    const s = AGENT_SETTINGS;
    prompt += "\n\n## MANDATORY Owner Settings (OVERRIDE everything above including Agent Memory)";
    prompt += "\nThese settings were configured by the store owner in the dashboard. They ALWAYS take priority over your memory, preferences, or any other instructions.";
    if (s.responseLanguage) prompt += `\n- RESPONSE LANGUAGE: You MUST respond in ${s.responseLanguage}. Not English, not any other language. ${s.responseLanguage} ONLY.`;
    if (s.listingLanguage) prompt += `\n- LISTING LANGUAGE: Write all product content in ${s.listingLanguage}.`;
    if (s.titlePrompt) prompt += `\n- TITLE RULES: ${s.titlePrompt}`;
    if (s.descriptionPrompt) prompt += `\n- DESCRIPTION RULES: ${s.descriptionPrompt}`;
    if (s.priceRules) prompt += `\n- PRICE RULES: ${s.priceRules}`;
    if (s.defaultStatus) prompt += `\n- DEFAULT STATUS: ${s.defaultStatus}`;
    if (s.customRules) prompt += `\n- CUSTOM RULES: ${s.customRules}`;
    if (s.memoryWriteEnabled === "false") prompt += "\n- SELF-LEARNING: DISABLED — do NOT call save_memory automatically";
  }
  if (WORKSHEET_DATA.length > 0) {
    const worksheetSummary = WORKSHEET_DATA.slice(0, 20).map(r => {
      const { id, ...cols } = r;
      return `- [${id}] ${Object.entries(cols).map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`).join(" | ")}`;
    }).join("\n");
    prompt += `\n\n## Worksheet (${WORKSHEET_DATA.length} rows)\n${worksheetSummary}`;
    if (WORKSHEET_DATA.length > 20) prompt += `\n- ... and ${WORKSHEET_DATA.length - 20} more rows (use read_worksheet to see all)`;
  }
  return prompt;
}

// Check if onboarding is complete (preferences saved in memory)
function isOnboarded() {
  return /## My Preferences/i.test(MEMORY_MD);
}

// Quick check: is this message worth reflecting on?
function isSubstantiveMessage(userMessage) {
  const trimmed = (userMessage || "").trim().toLowerCase();
  // Skip trivial messages that won't teach the agent anything
  const trivialPatterns = [
    /^(ok|okay|sure|thanks|thank you|thx|yes|no|yep|nope|cool|nice|good|great|perfect|awesome|👍|✅|❌|🙏)\.?$/i,
    /^(hi|hello|hey|hoi|hallo)\.?$/i,
    /^.{0,5}$/,  // Very short messages (< 6 chars)
  ];
  return !trivialPatterns.some(p => p.test(trimmed));
}

// Use a smaller/cheaper model for reflection when available
function getReflectionModel(provider) {
  // Use haiku/mini for reflection — much cheaper than the main model
  if (provider === "anthropic") return "claude-haiku-4-5-20251001";
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "openrouter") return "anthropic/claude-haiku-4-5";
  return getModel(provider);
}

// After each response: update preferences and learn from every interaction
async function reflectAndLearn(userMessage, assistantResponse, sessionId, fullHistory) {
  const provider = getActiveProvider();
  if (provider === "none") return;

  // Skip reflection for trivial messages — saves tokens
  if (isOnboarded() && !isSubstantiveMessage(userMessage)) {
    return;
  }

  // Only send the current preferences + recent learnings + last 4 messages
  const sections = parseMemorySections(MEMORY_MD);
  const currentPrefs = sections.preferences || "(not yet configured)";
  const currentRules = sections.rules || "";
  // Send last 10 learnings for context (not all — saves tokens in the reflection call)
  const learningBullets = (sections.learnings || "").split(/\n(?=- )/).filter(b => b.trim());
  const recentLearnings = learningBullets.slice(-10).join("\n");

  const recentMessages = fullHistory.slice(-4).map(m =>
    `${m.role === "user" ? "BOSS" : "AGENT"}: ${typeof m.content === "string" ? m.content.slice(0, 300) : "[tool interaction]"}`
  ).join("\n\n");

  const reflectionPrompt = `You manage memory for an AI e-commerce agent. Decide what to save from this interaction.

CURRENT PREFERENCES:
${currentPrefs}
${currentRules ? `\nCURRENT RULES:\n${currentRules}` : ""}

RECENT LEARNINGS:
${recentLearnings || "(none)"}

LATEST EXCHANGE:
${recentMessages}

---

Your job: output ONLY the changes. Follow this exact format:

PREFERENCES_UPDATE: (write updated preferences if any preference changed, or NONE)
NEW_LEARNING: (write a single bullet point starting with "- " if something new was learned, or NONE)

RULES:
- If a preference changed (language, tone, style, price rules, etc), output the FULL updated preferences section
- If the boss gave feedback/correction/new rule, write ONE concise bullet point
- If nothing new: output PREFERENCES_UPDATE: NONE and NEW_LEARNING: NONE
- Be concise — bullet points only, no explanations`;

  try {
    let result = "";
    const reflectionModel = getReflectionModel(provider);

    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: reflectionModel,
        max_tokens: 500,
        messages: [{ role: "user", content: reflectionPrompt }],
      });
      result = resp.content.map(b => b.type === "text" ? b.text : "").join("");
    } else {
      const client = provider === "openrouter" ? createOpenRouterClient() : new OpenAI({ apiKey: OPENAI_API_KEY });
      const resp = await client.chat.completions.create({
        model: reflectionModel,
        max_tokens: 500,
        messages: [{ role: "user", content: reflectionPrompt }],
      });
      result = resp.choices[0]?.message?.content || "";
    }

    result = result.trim();

    // Parse the structured response
    const prefMatch = result.match(/PREFERENCES_UPDATE:\s*([\s\S]*?)(?=NEW_LEARNING:|$)/i);
    const learnMatch = result.match(/NEW_LEARNING:\s*([\s\S]*?)$/i);

    const prefUpdate = prefMatch?.[1]?.trim();
    const newLearning = learnMatch?.[1]?.trim();

    const prefsChanged = prefUpdate && prefUpdate !== "NONE" && prefUpdate.length > 10;
    const hasLearning = newLearning && newLearning !== "NONE" && newLearning.length > 5;

    if (!prefsChanged && !hasLearning) {
      return;
    }

    // Rebuild memory from sections
    const updatedPrefs = prefsChanged ? prefUpdate : sections.preferences;
    const date = new Date().toISOString().split("T")[0];
    let updatedLearnings = sections.learnings || "";
    if (hasLearning) {
      const bullet = newLearning.startsWith("- ") ? newLearning : `- ${newLearning}`;
      updatedLearnings = updatedLearnings
        ? `${updatedLearnings}\n${bullet} (${date})`
        : `${bullet} (${date})`;
    }

    let newMemory = "";
    if (updatedPrefs) newMemory += `## My Preferences\n${updatedPrefs}`;
    if (updatedLearnings) newMemory += `${newMemory ? "\n\n" : ""}## Learnings\n${updatedLearnings}`;

    if (newMemory && newMemory !== MEMORY_MD) {
      MEMORY_MD = newMemory;
      saveMemoryToDisk();
      console.log(`[Memory] Updated for session ${sessionId}${prefsChanged ? " (prefs changed)" : ""}${hasLearning ? " (new learning)" : ""}`);

      // Check if learnings need consolidation into rules (fire-and-forget)
      maybeConsolidateMemory().catch(err => console.error("[Memory] Consolidation error:", err.message));
    }
  } catch (err) {
    console.error("[Memory] Reflection failed:", err.message);
  }
}

async function handleChat(req, res) {
  const body = await readBody(req);
  if (!body?.message) return json(res, 400, { error: "message is required" });

  const sessionId = body.sessionId || "default";
  const files = body.files || []; // [{ name, type, data (base64) }]

  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, []);
  }
  const history = sessions.get(sessionId);

  // Build user message content (with optional image attachments)
  const provider = getActiveProvider();
  const hasImages = files.some(f => f.type && f.type.startsWith("image/"));

  if (hasImages && provider === "anthropic") {
    // Anthropic multimodal format
    const content = [];
    for (const f of files) {
      if (f.type && f.type.startsWith("image/")) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: f.type, data: f.data },
        });
      }
    }
    content.push({ type: "text", text: body.message });
    history.push({ role: "user", content });
  } else if (hasImages && provider === "openai") {
    // OpenAI multimodal format
    const content = [];
    for (const f of files) {
      if (f.type && f.type.startsWith("image/")) {
        content.push({
          type: "image_url",
          image_url: { url: `data:${f.type};base64,${f.data}` },
        });
      }
    }
    content.push({ type: "text", text: body.message });
    history.push({ role: "user", content });
  } else {
    // Text-only or non-image files: mention file names in the message
    let messageText = body.message;
    if (files.length > 0) {
      const fileNames = files.map(f => f.name).join(", ");
      messageText += `\n\n[Attached files: ${fileNames}]`;
    }
    history.push({ role: "user", content: messageText });
  }

  // Keep last 50 messages to avoid token overflow
  if (history.length > 50) history.splice(0, history.length - 50);

  const model = getModel(provider);
  const hasShopify = SHOPIFY_STORE_URL && SHOPIFY_ACCESS_TOKEN;

  // Build a clean history with only user/assistant text messages for the API.
  // Tool interactions happen within a single request's loop using a separate messages array;
  // only the final text answer is persisted to history.
  function getCleanHistory() {
    return history.filter(m =>
      (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
    );
  }

  // Use SSE streaming for live updates
  const streaming = body.stream === true ||
    (req.headers.accept || "").includes("text/event-stream");

  if (streaming) sseStart(res);

  // Token usage tracking
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Helper: send progress update to client
  function sendProgress(type, data) {
    if (streaming) sseSend(res, type, data);
  }

  // Helper: finish with final response
  function finish(assistantMessage) {
    history.push({ role: "assistant", content: assistantMessage });
    reflectAndLearn(body.message, assistantMessage, sessionId, history).catch(() => {});
    if (streaming) {
      sseSend(res, "usage", { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, model });
      sseSend(res, "response", { response: assistantMessage, sessionId, model });
      sseEnd(res);
    } else {
      json(res, 200, { response: assistantMessage, sessionId, model, usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens } });
    }
  }

  try {
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const loopMessages = [...getCleanHistory()];
      const opts = {
        model, max_tokens: 4096, system: buildSystemPrompt(), messages: loopMessages,
      };
      opts.tools = SHOPIFY_TOOLS_ANTHROPIC;

      let lastTextParts = [];
      for (let i = 0; i < 25; i++) {
        const response = await client.messages.create(opts);
        totalInputTokens += response.usage?.input_tokens || 0;
        totalOutputTokens += response.usage?.output_tokens || 0;
        const textParts = [];
        const toolCalls = [];
        for (const block of response.content) {
          if (block.type === "text") textParts.push(block.text);
          if (block.type === "tool_use") toolCalls.push(block);
        }

        // Stream intermediate text
        if (textParts.length > 0) {
          lastTextParts = textParts;
          sendProgress("text", { text: textParts.join("\n") });
        }

        if (toolCalls.length === 0 || response.stop_reason !== "tool_use") {
          return finish(textParts.join("\n") || "No response generated.");
        }

        loopMessages.push({ role: "assistant", content: response.content });
        const toolResults = [];
        for (const tc of toolCalls) {
          sendProgress("tool_start", { tool: tc.name, input: JSON.stringify(tc.input).slice(0, 200) });
          console.log(`Tool call: ${tc.name}`, JSON.stringify(tc.input).slice(0, 200));
          const result = await executeTool(tc.name, tc.input);
          sendProgress("tool_done", { tool: tc.name, success: !result?.error });
          toolResults.push({
            type: "tool_result", tool_use_id: tc.id,
            content: JSON.stringify(result).slice(0, 50000),
          });
        }
        loopMessages.push({ role: "user", content: toolResults });
        opts.messages = loopMessages;
      }

      // Loop limit reached — queue continuation task and ask model to summarize
      const continuationPrompt = `Continue the task from where you left off. The previous run completed 25 tool call rounds. The user's original request was: "${body.message}". Summarize what still needs to be done and then do it.`;
      const continuationTask = {
        id: `task-${Date.now()}`,
        type: "chat",
        status: "pending",
        input: { prompt: continuationPrompt },
        result: null,
        progress: "Queued as continuation",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null
      };
      TASK_QUEUE.push(continuationTask);
      saveTasksToDisk();

      loopMessages.push({ role: "user", content: "You've reached the maximum tool calls for this turn. A continuation task has been queued to finish the remaining work. Please summarize what you've accomplished so far. Reply in the same language the user used." });
      opts.messages = loopMessages;
      opts.tools = undefined; // no more tool calls
      const summaryResp = await client.messages.create(opts);
      totalInputTokens += summaryResp.usage?.input_tokens || 0;
      totalOutputTokens += summaryResp.usage?.output_tokens || 0;
      const summaryText = summaryResp.content.map(b => b.type === "text" ? b.text : "").join("\n");
      return finish(summaryText || lastTextParts.join("\n") || "Done.");
    }

    if (provider === "openai" || provider === "openrouter") {
      const client = provider === "openrouter" ? createOpenRouterClient() : new OpenAI({ apiKey: OPENAI_API_KEY });
      const loopMessages = [
        { role: "system", content: buildSystemPrompt() },
        ...getCleanHistory(),
      ];
      const opts = { model, max_tokens: 4096, messages: loopMessages };
      opts.tools = SHOPIFY_TOOLS_OPENAI;

      let lastContent = "";
      for (let i = 0; i < 25; i++) {
        const response = await client.chat.completions.create(opts);
        totalInputTokens += response.usage?.prompt_tokens || 0;
        totalOutputTokens += response.usage?.completion_tokens || 0;
        const choice = response.choices[0];

        if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
          const assistantMessage = choice.message.content ?? "No response generated.";
          // Stream final text
          sendProgress("text", { text: assistantMessage });
          return finish(assistantMessage);
        }

        // Stream intermediate text if present
        if (choice.message.content) {
          lastContent = choice.message.content;
          sendProgress("text", { text: choice.message.content });
        }

        loopMessages.push(choice.message);
        for (const tc of choice.message.tool_calls) {
          let args;
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch (parseErr) {
            // Try to fix common JSON issues (truncated strings, unescaped chars)
            console.error(`[JSON] Failed to parse tool args for ${tc.function.name}: ${parseErr.message}`);
            try {
              // Try fixing by closing any unclosed strings/objects
              let fixed = tc.function.arguments || "{}";
              // Remove trailing incomplete string value
              fixed = fixed.replace(/,\s*"[^"]*":\s*"[^"]*$/, "");
              if (!fixed.endsWith("}")) fixed += "}";
              args = JSON.parse(fixed);
              console.log(`[JSON] Fixed by truncating incomplete field`);
            } catch {
              // Last resort: skip this tool call
              console.error(`[JSON] Could not fix, skipping tool call`);
              loopMessages.push({
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({ error: "Failed to parse tool arguments. Please try again with simpler input." }),
              });
              continue;
            }
          }
          sendProgress("tool_start", { tool: tc.function.name, input: JSON.stringify(args).slice(0, 200) });
          console.log(`Tool call: ${tc.function.name}`, JSON.stringify(args).slice(0, 200));
          const result = await executeTool(tc.function.name, args);
          sendProgress("tool_done", { tool: tc.function.name, success: !result?.error });
          loopMessages.push({
            role: "tool", tool_call_id: tc.id,
            content: JSON.stringify(result).slice(0, 50000),
          });
        }
        opts.messages = loopMessages;
      }

      // Loop limit reached — queue continuation task and ask model to summarize
      const continuationPrompt = `Continue the task from where you left off. The previous run completed 25 tool call rounds. The user's original request was: "${body.message}". Summarize what still needs to be done and then do it.`;
      const continuationTask = {
        id: `task-${Date.now()}`,
        type: "chat",
        status: "pending",
        input: { prompt: continuationPrompt },
        result: null,
        progress: "Queued as continuation",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null
      };
      TASK_QUEUE.push(continuationTask);
      saveTasksToDisk();

      loopMessages.push({ role: "user", content: "You've reached the maximum tool calls for this turn. A continuation task has been queued to finish the remaining work. Please summarize what you've accomplished so far. Reply in the same language the user used." });
      opts.messages = loopMessages;
      delete opts.tools; // no more tool calls
      const summaryResp = await client.chat.completions.create(opts);
      totalInputTokens += summaryResp.usage?.prompt_tokens || 0;
      totalOutputTokens += summaryResp.usage?.completion_tokens || 0;
      const summaryText = summaryResp.choices[0]?.message?.content || lastContent || "Done.";
      return finish(summaryText);
    }

    // Fallback: echo mode
    const fallback = `[No AI API key configured] Echo: ${body.message}`;
    return finish(fallback);
  } catch (err) {
    console.error("Chat error:", err.message);
    let details = err.message;
    try {
      const parsed = JSON.parse(err.message);
      if (parsed?.error?.message) details = parsed.error.message;
    } catch {
      if (err.status && err.error?.error?.message) details = err.error.error.message;
    }

    if (details.includes("Unexpected role") || details.includes("role")) {
      console.log(`[Chat] Cleaning corrupted session history for ${sessionId}`);
      const cleaned = history.filter(m =>
        (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
      );
      sessions.set(sessionId, cleaned);
    }

    if (streaming) {
      sseSend(res, "error", { error: "AI request failed", details });
      sseEnd(res);
    } else {
      json(res, err.status || 500, { error: "AI request failed", details });
    }
  }
}

async function handleConfig(req, res) {
  const body = await readBody(req);
  if (!body) return json(res, 400, { error: "Invalid request body" });

  let updated = [];

  if (typeof body.anthropicApiKey === "string") {
    ANTHROPIC_API_KEY = body.anthropicApiKey;
    updated.push("anthropicApiKey");
  }
  if (typeof body.openAiApiKey === "string") {
    OPENAI_API_KEY = body.openAiApiKey;
    updated.push("openAiApiKey");
  }
  if (typeof body.openRouterApiKey === "string") {
    OPENROUTER_API_KEY = body.openRouterApiKey;
    updated.push("openRouterApiKey");
  }
  if (typeof body.aiProvider === "string") {
    AI_PROVIDER = body.aiProvider;
    updated.push("aiProvider");
  }
  if (typeof body.aiModel === "string") {
    AI_MODEL = body.aiModel;
    updated.push("aiModel");
  }

  // Accept structured agent settings from the platform
  if (body.agentSettings && typeof body.agentSettings === "object") {
    AGENT_SETTINGS = { ...AGENT_SETTINGS, ...body.agentSettings };
    saveSettingsToDisk();
    updated.push("agentSettings");
    console.log(`[Settings] Updated:`, Object.keys(body.agentSettings).join(", "));
  }

  if (updated.length === 0) {
    return json(res, 400, { error: "No recognized config fields provided" });
  }

  const activeProvider = getActiveProvider();
  console.log(`Config updated: ${updated.join(", ")}`);
  console.log(`  AI provider: ${activeProvider} (model: ${getModel(activeProvider)})`);

  // Persist config changes to env file so they survive container restarts
  persistConfigToEnvFile();

  return json(res, 200, {
    updated,
    ai: activeProvider,
    model: getModel(activeProvider),
  });
}

const ENV_FILE = "/opt/ecomclaw/agent.env";

function persistConfigToEnvFile() {
  try {
    if (!fs.existsSync(ENV_FILE)) return;
    let content = fs.readFileSync(ENV_FILE, "utf-8");

    const updates = {
      AI_PROVIDER: AI_PROVIDER,
      AI_MODEL: AI_MODEL,
    };
    if (ANTHROPIC_API_KEY) updates.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;
    if (OPENAI_API_KEY) updates.OPENAI_API_KEY = OPENAI_API_KEY;
    if (OPENROUTER_API_KEY) updates.OPENROUTER_API_KEY = OPENROUTER_API_KEY;

    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, "m");
      const line = `${key}=${value}`;
      if (regex.test(content)) {
        content = content.replace(regex, line);
      } else {
        content = content.trimEnd() + "\n" + line + "\n";
      }
    }

    fs.writeFileSync(ENV_FILE, content, "utf-8");
    console.log("[Config] Persisted to env file");
  } catch (err) {
    console.error("[Config] Failed to persist env file:", err.message);
  }
}

async function handleShopify(req, res) {
  const body = await readBody(req);
  if (!body?.endpoint) return json(res, 400, { error: "endpoint is required" });

  try {
    const data = await shopifyRequest(
      body.endpoint,
      body.method || "GET",
      body.body || null
    );
    return json(res, 200, { data });
  } catch (err) {
    return json(res, 500, { error: "Shopify request failed", details: err.message });
  }
}

function handleListFiles(req, res) {
  return json(res, 200, {
    files: [
      { name: "soul.md", description: "Agent personality and instructions", size: SOUL_MD.length },
      { name: "memory.md", description: "Persistent memory and notes", size: MEMORY_MD.length },
      { name: "worksheet.json", description: "Shared worksheet data", size: JSON.stringify(WORKSHEET_DATA).length },
    ],
  });
}

function handleGetFile(req, res, fileName) {
  if (fileName === "soul.md") {
    return json(res, 200, { name: "soul.md", content: SOUL_MD });
  }
  if (fileName === "memory.md") {
    return json(res, 200, { name: "memory.md", content: MEMORY_MD });
  }
  if (fileName === "worksheet.json") {
    return json(res, 200, { name: "worksheet.json", content: JSON.stringify(WORKSHEET_DATA) });
  }
  return json(res, 404, { error: `File not found: ${fileName}` });
}

async function handlePutFile(req, res, fileName) {
  const body = await readBody(req);
  if (!body || typeof body.content !== "string") {
    return json(res, 400, { error: "content is required" });
  }

  if (fileName === "soul.md") {
    SOUL_MD = body.content;
    return json(res, 200, { name: "soul.md", content: SOUL_MD, updated: true });
  }
  if (fileName === "memory.md") {
    MEMORY_MD = body.content;
    saveMemoryToDisk();
    return json(res, 200, { name: "memory.md", content: MEMORY_MD, updated: true });
  }
  if (fileName === "worksheet.json") {
    try {
      WORKSHEET_DATA = JSON.parse(body.content);
    } catch {
      return json(res, 400, { error: "Invalid JSON" });
    }
    saveWorksheetToDisk();
    return json(res, 200, { name: "worksheet.json", content: body.content, updated: true });
  }
  return json(res, 404, { error: `File not found: ${fileName}` });
}

// Execute a task through the AI (no HTTP/SSE — returns final text)
async function executeTaskChat(task) {
  const provider = getActiveProvider();
  if (provider === "none") throw new Error("No AI provider configured");

  const model = getModel(provider);
  const prompt = task.input.prompt;

  // Create a clean message list for the task
  const messages = [{ role: "user", content: prompt }];

  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const loopMessages = [...messages];
    const opts = {
      model, max_tokens: 4096, system: buildSystemPrompt(), messages: loopMessages,
      tools: SHOPIFY_TOOLS_ANTHROPIC,
    };

    let lastText = "";
    for (let i = 0; i < 25; i++) {
      const response = await client.messages.create(opts);
      const textParts = [];
      const toolCalls = [];
      for (const block of response.content) {
        if (block.type === "text") textParts.push(block.text);
        if (block.type === "tool_use") toolCalls.push(block);
      }

      if (textParts.length > 0) lastText = textParts.join("\n");

      if (toolCalls.length === 0 || response.stop_reason !== "tool_use") {
        return lastText || "Task completed.";
      }

      loopMessages.push({ role: "assistant", content: response.content });
      const toolResults = [];
      for (const tc of toolCalls) {
        task.progress = `Calling ${tc.name}...`;
        task.updatedAt = new Date().toISOString();
        saveTasksToDisk();
        console.log(`[Task ${task.id}] Tool call: ${tc.name}`);
        const result = await executeTool(tc.name, tc.input);
        toolResults.push({
          type: "tool_result", tool_use_id: tc.id,
          content: JSON.stringify(result).slice(0, 50000),
        });
      }
      loopMessages.push({ role: "user", content: toolResults });
      opts.messages = loopMessages;
    }

    return lastText || "Task completed (reached tool call limit).";
  }

  if (provider === "openai" || provider === "openrouter") {
    const client = provider === "openrouter" ? createOpenRouterClient() : new OpenAI({ apiKey: OPENAI_API_KEY });
    const loopMessages = [
      { role: "system", content: buildSystemPrompt() },
      ...messages,
    ];
    const opts = { model, max_tokens: 4096, messages: loopMessages, tools: SHOPIFY_TOOLS_OPENAI };

    let lastContent = "";
    for (let i = 0; i < 25; i++) {
      const response = await client.chat.completions.create(opts);
      const choice = response.choices[0];

      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        return choice.message.content ?? "Task completed.";
      }

      if (choice.message.content) lastContent = choice.message.content;

      loopMessages.push(choice.message);
      for (const tc of choice.message.tool_calls) {
        let args;
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          loopMessages.push({
            role: "tool", tool_call_id: tc.id,
            content: JSON.stringify({ error: "Failed to parse tool arguments." }),
          });
          continue;
        }
        task.progress = `Calling ${tc.function.name}...`;
        task.updatedAt = new Date().toISOString();
        saveTasksToDisk();
        console.log(`[Task ${task.id}] Tool call: ${tc.function.name}`);
        const result = await executeTool(tc.function.name, args);
        loopMessages.push({
          role: "tool", tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 50000),
        });
      }
      opts.messages = loopMessages;
    }

    return lastContent || "Task completed (reached tool call limit).";
  }

  throw new Error("No AI provider available");
}

// Background task worker — processes one pending task every 5 seconds
let taskWorkerRunning = false;

async function processTaskQueue() {
  if (taskWorkerRunning) return;
  const next = TASK_QUEUE.find(t => t.status === "pending");
  if (!next) return;

  taskWorkerRunning = true;
  next.status = "running";
  next.updatedAt = new Date().toISOString();
  saveTasksToDisk();

  try {
    const result = await executeTaskChat(next);
    next.status = "completed";
    next.result = result;
  } catch (err) {
    next.status = "error";
    next.error = err.message;
  }
  next.updatedAt = new Date().toISOString();
  saveTasksToDisk();

  // If this was a cron task, update the cron job's lastResult and history
  if (next.input && next.input.cronJobId) {
    const cronJob = CRON_JOBS.find(j => j.id === next.input.cronJobId);
    if (cronJob) {
      const summary = next.status === "completed"
        ? (next.result || "").slice(0, 500)
        : `Error: ${next.error}`;
      cronJob.lastResult = {
        status: next.status === "completed" ? "success" : "error",
        summary,
        fullResponse: next.result || next.error || ""
      };
      cronJob.history = [
        { timestamp: new Date().toISOString(), status: cronJob.lastResult.status, summary },
        ...(cronJob.history || []).slice(0, 9)  // keep last 10
      ];
      saveCronToDisk();
    }
  }

  taskWorkerRunning = false;
}

setInterval(processTaskQueue, 5000);

// Cron job scheduling — timezone-aware
function getNowInTimezone(tz) {
  try {
    // Get current time parts in the target timezone
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "numeric", minute: "numeric", second: "numeric",
      year: "numeric", month: "numeric", day: "numeric", hour12: false,
    }).formatToParts(new Date());
    const get = (type) => parseInt(parts.find(p => p.type === type)?.value || "0");
    return { year: get("year"), month: get("month") - 1, day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
  } catch {
    // Fallback to UTC
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth(), day: now.getUTCDate(), hour: now.getUTCHours(), minute: now.getUTCMinutes(), second: now.getUTCSeconds() };
  }
}

function calculateNextRun(job) {
  const tz = job.timezone || "UTC";
  const now = new Date();

  if (job.schedule.type === "daily") {
    const [targetH, targetM] = job.schedule.time.split(":").map(Number);
    const tzNow = getNowInTimezone(tz);

    // Build "today at target time" in the user's timezone
    // We do this by finding the UTC equivalent of the target time in their timezone
    const todayTarget = new Date(Date.UTC(tzNow.year, tzNow.month, tzNow.day, targetH, targetM, 0));
    // Offset: difference between UTC and timezone
    const utcNow = new Date(Date.UTC(tzNow.year, tzNow.month, tzNow.day, tzNow.hour, tzNow.minute, tzNow.second));
    const tzOffset = utcNow.getTime() - now.getTime(); // ms offset from UTC

    let nextUtc = new Date(todayTarget.getTime() - tzOffset);
    if (nextUtc <= now) nextUtc = new Date(nextUtc.getTime() + 86400000); // tomorrow

    return nextUtc.toISOString();
  }
  if (job.schedule.type === "interval") {
    return new Date(now.getTime() + job.schedule.minutes * 60000).toISOString();
  }
  return null;
}

async function checkCronJobs() {
  const now = new Date();
  for (const job of CRON_JOBS) {
    if (!job.enabled || !job.nextRun) continue;
    if (new Date(job.nextRun) <= now) {
      console.log(`[Cron] Running job: ${job.name}`);
      const task = {
        id: `task-cron-${job.id}-${Date.now()}`,
        type: "cron",
        status: "pending",
        input: { prompt: job.prompt, cronJobId: job.id, cronJobName: job.name },
        result: null,
        progress: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        error: null
      };
      TASK_QUEUE.push(task);

      job.lastRun = now.toISOString();
      job.nextRun = calculateNextRun(job);
      saveTasksToDisk();
      saveCronToDisk();
    }
  }
}

setInterval(checkCronJobs, 60000);

// Task HTTP handlers
async function handleGetTasks(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const status = url.searchParams.get("status");
  let tasks = TASK_QUEUE;
  if (status) tasks = tasks.filter(t => t.status === status);
  // Return newest first, limit to 50
  return json(res, 200, { tasks: tasks.slice(-50).reverse() });
}

async function handleGetTask(req, res, taskId) {
  const task = TASK_QUEUE.find(t => t.id === taskId);
  if (!task) return json(res, 404, { error: "Task not found" });
  return json(res, 200, { task });
}

async function handleDeleteTask(req, res, taskId) {
  const idx = TASK_QUEUE.findIndex(t => t.id === taskId);
  if (idx < 0) return json(res, 404, { error: "Task not found" });
  TASK_QUEUE.splice(idx, 1);
  saveTasksToDisk();
  return json(res, 200, { deleted: true });
}

// Cron HTTP handlers
async function handleGetCron(req, res) {
  return json(res, 200, { jobs: CRON_JOBS });
}

async function handleCreateCron(req, res) {
  const body = await readBody(req);
  if (!body?.name || !body?.schedule || !body?.prompt) {
    return json(res, 400, { error: "name, schedule, and prompt are required" });
  }
  const job = {
    id: `cron-${Date.now()}`,
    name: body.name,
    schedule: body.schedule,
    prompt: body.prompt,
    timezone: body.timezone || "UTC",
    enabled: body.enabled !== false,
    lastRun: null,
    lastResult: null,
    nextRun: null,
    history: [],
    createdAt: new Date().toISOString()
  };
  job.nextRun = calculateNextRun(job);
  CRON_JOBS.push(job);
  saveCronToDisk();
  return json(res, 201, { job });
}

async function handleUpdateCron(req, res, cronId) {
  const body = await readBody(req);
  const job = CRON_JOBS.find(j => j.id === cronId);
  if (!job) return json(res, 404, { error: "Cron job not found" });

  if (body.name) job.name = body.name;
  if (body.timezone) job.timezone = body.timezone;
  if (body.schedule) { job.schedule = body.schedule; job.nextRun = calculateNextRun(job); }
  if (body.prompt) job.prompt = body.prompt;
  if (typeof body.enabled === "boolean") job.enabled = body.enabled;

  saveCronToDisk();
  return json(res, 200, { job });
}

async function handleDeleteCron(req, res, cronId) {
  const idx = CRON_JOBS.findIndex(j => j.id === cronId);
  if (idx < 0) return json(res, 404, { error: "Cron job not found" });
  CRON_JOBS.splice(idx, 1);
  saveCronToDisk();
  return json(res, 200, { deleted: true });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  // Health check — no auth required (no sensitive info)
  if (path === "/health" && method === "GET") {
    return json(res, 200, {
      status: "ok",
      uptime: process.uptime(),
    });
  }

  // Bootstrap logs — no auth required (used by deployment status checks)
  if (path === "/logs/bootstrap" && method === "GET") {
    return json(res, 200, { logs: "Agent running via Docker container." });
  }

  // All other endpoints require auth
  if (!authenticate(req)) {
    return json(res, 401, { error: "Unauthorized" });
  }

  if (path === "/chat" && method === "POST") return handleChat(req, res);
  if (path === "/config" && method === "POST") return handleConfig(req, res);
  if (path === "/shopify" && method === "POST") return handleShopify(req, res);

  // File endpoints
  if (path.startsWith("/files")) {
    const fileName = path.split("/files/")[1];
    if (!fileName && method === "GET") return handleListFiles(req, res);
    if (fileName && method === "GET") return handleGetFile(req, res, fileName);
    if (fileName && method === "PUT") return handlePutFile(req, res, fileName);
  }

  // Task endpoints
  if (path === "/tasks" && method === "GET") return handleGetTasks(req, res);
  if (path.startsWith("/tasks/") && method === "GET") return handleGetTask(req, res, path.split("/tasks/")[1]);
  if (path.startsWith("/tasks/") && method === "DELETE") return handleDeleteTask(req, res, path.split("/tasks/")[1]);

  // Cron endpoints
  if (path === "/cron" && method === "GET") return handleGetCron(req, res);
  if (path === "/cron" && method === "POST") return handleCreateCron(req, res);
  if (path.startsWith("/cron/") && method === "PUT") return handleUpdateCron(req, res, path.split("/cron/")[1]);
  if (path.startsWith("/cron/") && method === "DELETE") return handleDeleteCron(req, res, path.split("/cron/")[1]);

  // Info endpoint
  if (path === "/" && method === "GET") {
    return json(res, 200, {
      name: "openclaw-agent",
      version: "0.1.0",
      endpoints: ["/health", "/chat", "/config", "/shopify", "/files", "/tasks", "/cron"],
    });
  }

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  const provider = getActiveProvider();
  console.log(`OpenClaw agent listening on :${PORT}`);
  console.log(`  AI provider: ${provider} (model: ${getModel(provider)})`);
  console.log(`  Store: ${SHOPIFY_STORE_URL || "not connected"}`);
  console.log(`  Auth: ${GATEWAY_TOKEN ? "token required" : "open"}`);
});
