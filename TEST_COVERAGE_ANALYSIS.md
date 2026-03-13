# Test Coverage Analysis

## Current State

The project has **a single test file** (`apps/web/test-all.spec.ts`) containing **29 Playwright E2E tests** across 6 test suites. There are **zero unit tests** and **zero integration tests** outside of the E2E suite.

### What Exists Today

| Suite | Tests | What It Covers |
|-------|-------|----------------|
| API Health & Auth | 5 | Health check, register, login, wrong password (401), missing token (401) |
| Frontend Pages - Unauthenticated | 3 | Login page loads, signup page loads, dashboard redirects to login |
| Frontend Pages - Authenticated | 8 | Smoke tests: dashboard, agents, store, stores, chat, analytics, settings, onboarding pages load |
| API Endpoints - CRUD | 9 | Stores (list, validate, create), agents (list), templates, settings, analytics, onboarding flow, key validation |
| Console Errors on All Pages | 1 | Collects console errors across all dashboard pages |
| Screenshots All Pages | 2 | Desktop and mobile screenshots (visual documentation) |

### Key Gaps

- **No unit tests** for any backend service (C# API has 12 services, 14 controllers, 0 tests)
- **No unit tests** for frontend utilities (`lib/api.ts`, `lib/auth.tsx`, `lib/utils.ts`)
- **No component tests** for any React component
- **No test configuration** (no `playwright.config.ts`, no coverage reporting)
- **No CI/CD pipeline** running tests automatically
- **No npm test script** in any `package.json`

---

## Priority Recommendations

### 1. Backend Unit Tests (High Priority)

The C# API is the core of the platform and has zero test coverage. These services contain critical business logic that should be unit-tested with mocked dependencies.

#### 1a. `EncryptionService` — Crypto correctness
- **Why:** A bug here silently corrupts all stored secrets (API keys, Shopify credentials). This is the highest-risk untested code.
- **Tests needed:**
  - Encrypt then decrypt roundtrip returns original plaintext
  - Decrypt with wrong key throws `CryptographicException`
  - Empty/null input passes through unchanged
  - Versioned format: data encrypted with current key decrypts correctly
  - Key rotation: data encrypted with previous key still decrypts
  - `ReEncrypt` migrates data from old key to current key
  - `IsCurrentVersion` returns false for legacy-format data
  - Invalid base64 input throws appropriate error
  - Short ciphertext (< 28 bytes) throws "too short" error

#### 1b. `AuthService` — Authentication & authorization
- **Why:** Auth bugs = unauthorized access. Refresh token rotation and reuse detection are complex flows.
- **Tests needed:**
  - Register with valid data creates user, returns JWT + refresh token
  - Register with duplicate email returns 409
  - Register with invalid email format returns 400
  - Register with short password (< 8 chars) returns 400
  - Register with blank name returns 400
  - Login with valid credentials returns tokens
  - Login with wrong password returns 401
  - Login with nonexistent email returns 401
  - Refresh with valid token returns new token pair and revokes old token
  - Refresh with revoked token triggers full session invalidation (reuse detection)
  - Refresh with expired token returns 401
  - `DeleteAccountAsync` cascades deletion of agents, stores, settings, chat messages, deployments
  - `DeleteAccountAsync` revokes all refresh tokens

#### 1c. `BillingService` — Plan enforcement
- **Why:** Incorrect plan limits could allow free users unlimited resources or lock out paying users.
- **Tests needed:**
  - `CheckAgentLimit` allows creation under limit
  - `CheckAgentLimit` blocks creation at/over limit
  - `CheckStoreLimit` allows creation under limit
  - `CheckStoreLimit` blocks creation at/over limit
  - `CheckPlanActive` returns false for "none" plan
  - `CheckPlanActive` returns true for active plans
  - `GetSubscriptionStatus` returns correct counts and limits per plan
  - `ResolvePlanFromPriceId` maps configured price IDs correctly
  - `ResolvePlanFromPriceId` falls back to "starter" for unknown price IDs

#### 1d. `SopParserService` — Document parsing & rule extraction
- **Why:** Complex regex-heavy parsing logic with many edge cases. This is pure business logic with no external dependencies — ideal for unit testing.
- **Tests needed:**
  - Rejects unsupported file extensions
  - Validates PDF magic bytes (`%PDF`)
  - Validates DOCX magic bytes (PK ZIP header)
  - Rejects files with wrong magic bytes for their extension
  - Extracts text from `.txt` files
  - `ExtractRules` categorizes rules into correct categories (title, description, pricing, tags, don'ts, general)
  - `IsAgentRelevant` filters out manual UI instructions ("click", "scroll", "go to admin")
  - `IsAgentRelevant` filters out URLs, external tools, import steps
  - `IsAgentRelevant` keeps pricing rules, title format rules, product rules
  - `CollapseSubLists` merges bullet sub-items into parent line
  - Section header detection works for `#` headers, ALL CAPS, and "DOS/DON'TS" patterns
  - ChatGPT prompt block extraction captures multi-line prompts
  - Rules are deduped and capped at 20 per category
  - Fallback path works when no categories are detected
  - Raw text is truncated at 50,000 characters

#### 1e. `DeploymentService` — Infrastructure orchestration
- **Why:** Orchestrates Hetzner servers and Cloudflare tunnels. Bugs = orphaned servers (costing money) or broken deployments.
- **Tests needed:**
  - `DeployAgent` rejects if agent doesn't belong to user
  - `DeployAgent` rejects if agent is already deployed
  - `DeployAgent` rejects if no API key is configured
  - `StopAgent` updates deployment and agent status
  - `DeleteDeployment` retries Hetzner deletion up to 3 times
  - `DeleteDeployment` still removes DB record even if Hetzner deletion fails (avoiding orphaned data)
  - `RedeployAgent` decrypts and reuses existing tunnel token
  - `GetAgentBaseUrl` returns direct IP in mock mode, tunnel URL otherwise
  - Authorization checks on all operations (wrong userId = `UnauthorizedAccessException`)

### 2. Frontend Unit Tests (Medium Priority)

#### 2a. `lib/api.ts` — API client
- **Why:** Every page depends on this. A subtle bug (e.g., not clearing tokens on 401) affects all authenticated routes.
- **Tests needed:**
  - Attaches `Authorization: Bearer <token>` header when token exists
  - Does not attach auth header when no token
  - Redirects to `/login` and clears tokens on 401 response
  - Throws with error message from response body on non-OK responses
  - Returns `undefined` for empty response body
  - Parses JSON response correctly

#### 2b. `lib/auth.tsx` — Auth context
- **Tests needed:**
  - Provides user data from token on initial load
  - `login` stores token and updates state
  - `logout` clears token and redirects
  - Protected routes redirect when not authenticated

### 3. API Integration Tests (Medium Priority)

The existing E2E tests cover some API flows, but they run through the full browser stack. Dedicated API-level integration tests would be faster and more targeted.

- **Missing API test coverage:**
  - Agent CRUD (create, read, update, delete agents)
  - Agent cron job triggering (`AgentCronController`)
  - Chat message history and WebSocket hub (`ChatController`, `ChatHub`)
  - Admin endpoints (`AdminController`)
  - Billing endpoints (create checkout, webhook handling)
  - Settings CRUD (save/load API keys, update AI provider)
  - Deployment lifecycle (deploy, status check, stop, start, redeploy, delete)
  - Agent file upload/management (`AgentFilesController`)
  - Store update and deletion
  - Error responses for invalid input on all endpoints
  - Rate limiting behavior (if implemented)
  - Concurrent request handling

### 4. E2E Test Improvements (Low Priority)

The existing Playwright tests have some quality issues:

- **Weak assertions:** Many authenticated page tests only check that the URL contains the page name — they don't verify actual content rendered.
- **No negative flows:** No tests for form validation errors, failed submissions, or error states in the UI.
- **No user workflow tests:** Missing end-to-end user journeys like "register → onboard → create agent → deploy → view analytics".
- **Missing pages:** No tests for `/admin`, `/pricing`, individual agent detail page (`/dashboard/agents/[id]`), or settings sub-pages (account, API, billing).
- **Hardcoded timeouts:** Excessive `waitForTimeout(2000)` calls instead of waiting for specific elements.

### 5. Test Infrastructure (High Priority)

Before writing any tests, set up the infrastructure:

- **Backend:** Add an xUnit or NUnit test project (`apps/api.tests/`) with an in-memory SQLite database for service tests.
- **Frontend:** Add Vitest configuration for `apps/web/` with jsdom environment for component and utility tests.
- **Playwright config:** Add `playwright.config.ts` with proper base URL, timeouts, and reporter configuration.
- **npm scripts:** Add `test`, `test:unit`, and `test:e2e` scripts to package.json files.
- **CI pipeline:** Add GitHub Actions workflow that runs unit and integration tests on every PR.
- **Coverage reporting:** Configure coverage thresholds (aim for 80%+ on services, 60%+ on controllers).

---

## Suggested Implementation Order

1. **Test infrastructure setup** (xUnit project, Vitest config, npm scripts)
2. **EncryptionService unit tests** (highest risk, pure logic, no external deps)
3. **SopParserService unit tests** (complex parsing logic, pure functions)
4. **AuthService unit tests** (security-critical, needs in-memory DB)
5. **BillingService unit tests** (plan enforcement logic)
6. **`lib/api.ts` frontend unit tests** (shared by all pages)
7. **API integration tests for missing endpoints**
8. **DeploymentService unit tests** (needs mocked external services)
9. **E2E test hardening** (better assertions, negative flows, user journeys)
