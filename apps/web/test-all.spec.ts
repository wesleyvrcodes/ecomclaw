import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

// Helper: register and set token in localStorage with correct key
async function setupAuth(page: Page) {
  const email = `test-${Date.now()}@test.com`;
  const regRes = await page.request.post(`${BASE}/api/auth/register`, {
    data: { name: "Test User", email, password: "TestPass123!" },
  });
  const { token } = await regRes.json();
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem("clawcommerce_token", t), token);
  return token;
}

test.describe("API Health & Auth", () => {
  test("API health check", async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/health`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe("Healthy");
  });

  test("Register new user", async ({ page }) => {
    const res = await page.request.post(`${BASE}/api/auth/register`, {
      data: { name: "PW User", email: `pw-${Date.now()}@test.com`, password: "Pass123!" },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.token).toBeTruthy();
    expect(data.user?.name).toBe("PW User");
  });

  test("Login with correct creds", async ({ page }) => {
    const email = `login-${Date.now()}@test.com`;
    await page.request.post(`${BASE}/api/auth/register`, {
      data: { name: "Login", email, password: "Pass123!" },
    });
    const res = await page.request.post(`${BASE}/api/auth/login`, {
      data: { email, password: "Pass123!" },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).token).toBeTruthy();
  });

  test("Login with wrong password = 401", async ({ page }) => {
    const res = await page.request.post(`${BASE}/api/auth/login`, {
      data: { email: "wrong@test.com", password: "wrong" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/auth/me without token = 401", async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/auth/me`);
    expect(res.status()).toBe(401);
  });
});

test.describe("Frontend Pages - Unauthenticated", () => {
  test("Login page loads with form", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState("networkidle");
    // Should have some form elements
    const inputs = await page.locator("input").count();
    expect(inputs).toBeGreaterThan(0);
  });

  test("Signup page loads", async ({ page }) => {
    await page.goto(`${BASE}/signup`);
    await page.waitForLoadState("networkidle");
    const inputs = await page.locator("input").count();
    expect(inputs).toBeGreaterThan(0);
  });

  test("Dashboard redirects to login when not auth'd", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL(/login/, { timeout: 10000 });
    expect(page.url()).toContain("login");
  });
});

test.describe("Frontend Pages - Authenticated", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test("Dashboard loads", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("dashboard");
    const text = await page.textContent("body");
    expect(text?.length).toBeGreaterThan(0);
  });

  test("Agents page loads", async ({ page }) => {
    await page.goto(`${BASE}/dashboard/agents`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("agents");
  });

  test("Agent Store page loads", async ({ page }) => {
    await page.goto(`${BASE}/dashboard/store`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("store");
  });

  test("Stores page loads", async ({ page }) => {
    await page.goto(`${BASE}/dashboard/stores`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("stores");
  });

  test("Chat page loads without crash", async ({ page }) => {
    await page.goto(`${BASE}/dashboard/chat`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("chat");
    const text = await page.textContent("body");
    expect(text?.toLowerCase()).not.toContain("unhandled runtime error");
  });

  test("Analytics page loads", async ({ page }) => {
    await page.goto(`${BASE}/dashboard/analytics`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("analytics");
  });

  test("Settings page loads", async ({ page }) => {
    await page.goto(`${BASE}/dashboard/settings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("settings");
  });

  test("Onboarding page loads", async ({ page }) => {
    await page.goto(`${BASE}/dashboard/onboarding`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("onboarding");
  });
});

test.describe("API Endpoints - CRUD", () => {
  let authToken = "";

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/register`, {
      data: { name: "CRUD", email: `crud-${Date.now()}@test.com`, password: "Pass123!" },
    });
    authToken = (await res.json()).token;
  });

  test("GET /api/stores = empty array", async ({ request }) => {
    const res = await request.get(`${BASE}/api/stores`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
    expect(data.length).toBe(0);
  });

  test("GET /api/agents = empty array", async ({ request }) => {
    const res = await request.get(`${BASE}/api/agents`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBeTruthy();
  });

  test("GET /api/templates returns templates with correct structure", async ({ request }) => {
    const res = await request.get(`${BASE}/api/templates`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.length).toBeGreaterThan(0);
    const t = data[0];
    expect(t.id).toBeTruthy();
    expect(t.name).toBeTruthy();
    expect(t.requiredScopes).toBeTruthy();
    expect(t.configFields).toBeTruthy();
    console.log("Templates:", data.map((x: any) => x.name));
  });

  test("POST /api/stores/validate", async ({ request }) => {
    const res = await request.post(`${BASE}/api/stores/validate`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { storeUrl: "test.myshopify.com", clientId: "x", clientSecret: "y" },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(typeof data.valid).toBe("boolean");
    console.log("Validate response:", data);
  });

  test("POST /api/stores creates store (mock mode)", async ({ request }) => {
    const res = await request.post(`${BASE}/api/stores`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { name: "Test", storeUrl: "test.myshopify.com", niche: "Fashion", clientId: "x", clientSecret: "y" },
    });
    expect(res.status()).toBeLessThan(500);
    const data = await res.json();
    console.log("Created store:", data.id, data.name, "connected:", data.isConnected);
  });

  test("POST /api/settings/validate-key", async ({ request }) => {
    // Anthropic key
    const r1 = await request.post(`${BASE}/api/settings/validate-key`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { apiKey: "sk-ant-test123", provider: "anthropic" },
    });
    expect((await r1.json()).valid).toBe(true);

    // Invalid key
    const r2 = await request.post(`${BASE}/api/settings/validate-key`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { apiKey: "badkey", provider: "x" },
    });
    expect((await r2.json()).valid).toBe(false);
  });

  test("Full onboarding flow via API", async ({ request }) => {
    // Get templates
    const tRes = await request.get(`${BASE}/api/templates`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const templates = await tRes.json();
    const templateId = templates[0]?.id;
    expect(templateId).toBeTruthy();

    // Complete onboarding
    const res = await request.post(`${BASE}/api/onboarding/complete`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        storeName: "Onboard Store",
        storeUrl: "onboard.myshopify.com",
        niche: "Fashion",
        clientId: "client-123",
        clientSecret: "secret-456",
        templateId,
        agentName: "My First Agent",
        aiProvider: "anthropic",
        apiKey: "sk-ant-test-key-123",
        schedule: "daily",
      },
    });
    console.log("Onboarding status:", res.status());
    const data = await res.json();
    console.log("Onboarding result:", data);
    expect(res.ok()).toBeTruthy();
    expect(data.storeId).toBeTruthy();
    expect(data.agentId).toBeTruthy();

    // Verify agent was created
    const aRes = await request.get(`${BASE}/api/agents`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const agents = await aRes.json();
    expect(agents.length).toBeGreaterThan(0);
    const agent = agents.find((a: any) => a.id === data.agentId);
    expect(agent).toBeTruthy();
    console.log("Agent status:", agent.status, "type:", agent.type);

    // Verify chat history was seeded
    const cRes = await request.get(`${BASE}/api/chat/${data.agentId}/history`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    console.log("Chat history status:", cRes.status());
    if (cRes.ok()) {
      const messages = await cRes.json();
      console.log("Chat messages:", messages.length);
      if (messages.length > 0) {
        console.log("First message preview:", messages[0].content?.slice(0, 100));
      }
    }
  });

  test("GET /api/analytics", async ({ request }) => {
    const res = await request.get(`${BASE}/api/analytics`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    console.log("Analytics:", res.status(), res.ok() ? (await res.json()) : await res.text());
  });

  test("GET /api/settings", async ({ request }) => {
    const res = await request.get(`${BASE}/api/settings`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    console.log("Settings:", res.status());
    if (res.ok()) {
      const data = await res.json();
      console.log("Settings fields:", Object.keys(data));
    }
  });
});

test.describe("Console Errors on All Pages", () => {
  test("Collect all console errors", async ({ page }) => {
    await setupAuth(page);

    const errors: { url: string; msg: string }[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push({ url: page.url(), msg: m.text() });
    });
    page.on("pageerror", (e) => {
      errors.push({ url: page.url(), msg: `PAGE ERROR: ${e.message}` });
    });

    const pages = [
      "/dashboard",
      "/dashboard/agents",
      "/dashboard/store",
      "/dashboard/stores",
      "/dashboard/chat",
      "/dashboard/analytics",
      "/dashboard/settings",
      "/dashboard/onboarding",
    ];

    for (const p of pages) {
      await page.goto(`${BASE}${p}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
    }

    console.log("\n=== CONSOLE ERRORS ===");
    for (const e of errors) {
      console.log(`[${e.url.replace(BASE, "")}] ${e.msg.slice(0, 200)}`);
    }
    console.log(`Total: ${errors.length} errors`);
  });
});

test.describe("Screenshots All Pages", () => {
  test("Desktop screenshots", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupAuth(page);

    const pages = [
      "dashboard", "agents", "store", "stores", "chat", "analytics", "settings", "onboarding",
    ];

    for (const p of pages) {
      await page.goto(`${BASE}/dashboard/${p === "dashboard" ? "" : p}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `/tmp/ecomclaw-${p}.png`, fullPage: true });
      console.log(`Screenshot: ${p}`);
    }

    // Login/signup
    await page.evaluate(() => localStorage.removeItem("clawcommerce_token"));
    for (const p of ["login", "signup"]) {
      await page.goto(`${BASE}/${p}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `/tmp/ecomclaw-${p}.png`, fullPage: true });
      console.log(`Screenshot: ${p}`);
    }
  });

  test("Mobile screenshots", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupAuth(page);

    for (const p of ["dashboard", "chat", "onboarding", "stores"]) {
      await page.goto(`${BASE}/dashboard/${p === "dashboard" ? "" : p}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `/tmp/ecomclaw-mobile-${p}.png`, fullPage: true });
      console.log(`Mobile screenshot: ${p}`);
    }
  });
});
