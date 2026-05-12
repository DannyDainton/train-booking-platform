---
name: postman-runner
description: Use this skill to run a Postman collection and analyse the results. Trigger whenever the user wants to: run or execute a Postman collection, check if API tests pass or fail, get a summary of collection run results, debug failing requests, analyse response times or errors across a collection, or do anything involving "collection runner", "Postman CLI", "Newman", "run my tests", "execute my collection", "test results", or "which tests are failing". Always prefer the Postman CLI (postman) over Newman — only fall back to Newman if the Postman CLI is unavailable.
---

# Postman Collection Runner

This skill runs a Postman collection using the **Postman CLI** (`postman`) and produces a high-level analysis of the results. The Postman CLI is the preferred runner — it integrates directly with Postman workspaces, supports all collection features, and outputs structured results without extra configuration. Fall back to **Newman** only if the Postman CLI is not available on the user's machine.

---

## Prerequisites

Confirm before running:

1. **Postman CLI is installed** (preferred) — check with `postman --version`. If missing, install it:
   ```bash
   # macOS (Homebrew)
   brew install postman

   # Linux / Windows — download from https://learning.postman.com/docs/postman-cli/postman-cli-installation/
   ```
   Log in before the first run:
   ```bash
   postman login --with-api-key {{postman_api_key}}
   ```

2. **Newman** (fallback only) — use if the Postman CLI is unavailable:
   ```bash
   npm install -g newman
   ```

3. **Collection is accessible** — a Collection ID from your Postman workspace (preferred with the CLI), or a local `.json` export for Newman.

4. **Network access** — the target API must be reachable from the machine running the CLI.

5. **Environment** (optional) — if the collection uses `{{variables}}`, have either the Environment ID (Postman CLI) or a local environment `.json` export (Newman) ready.

---

## Running the Collection

### Postman CLI (preferred)

**Basic run:**
```bash
postman collection run {{collection_id}} \
  --output /tmp/postman_results.json
```

**With an environment:**
```bash
postman collection run {{collection_id}} \
  --environment {{environment_id}} \
  --output /tmp/postman_results.json
```

**With a local collection file:**
```bash
postman collection run collection.json \
  --environment environment.json \
  --output /tmp/postman_results.json
```

**Useful Postman CLI flags:**
| Flag | Purpose |
|------|---------|
| `--environment <id\|file>` | Environment ID or local JSON file |
| `--iteration-count <n>` | Run the collection N times |
| `--iteration-data <file>` | CSV or JSON data file for data-driven runs |
| `--timeout-request <ms>` | Per-request timeout in milliseconds |
| `--delay-request <ms>` | Pause between requests |
| `--bail` | Stop on first test failure |
| `--insecure` | Disable SSL certificate verification |
| `--folder <name>` | Run only a specific folder |
| `--verbose` | Show full request/response detail |

---

### Newman (fallback only)

Use Newman only if the Postman CLI is not available.

**Basic run:**
```bash
newman run collection.json \
  --reporters json \
  --reporter-json-export /tmp/newman_results.json \
  --timeout-request 10000
```

**With an environment:**
```bash
newman run collection.json \
  --environment environment.json \
  --reporters json \
  --reporter-json-export /tmp/newman_results.json \
  --timeout-request 10000
```

**Useful Newman flags:**
| Flag | Purpose |
|------|---------|
| `--environment <file>` | Load a Postman environment JSON |
| `--globals <file>` | Load a Postman globals JSON |
| `--iteration-count <n>` | Run the collection N times |
| `--iteration-data <file>` | CSV or JSON data file for data-driven runs |
| `--timeout-request <ms>` | Per-request timeout in milliseconds |
| `--delay-request <ms>` | Pause between requests |
| `--bail` | Stop on first test failure |
| `--insecure` | Disable SSL certificate verification |
| `--folder <name>` | Run only a specific folder |

---

## Reading the Results

After the run, parse the output file — `/tmp/postman_results.json` (Postman CLI) or `/tmp/newman_results.json` (Newman). Both follow the same structure:

```
run
├── stats         ← overall counts (requests, assertions, failures)
├── timings       ← total duration, average response time
├── executions[]  ← one entry per request
│   ├── item.name
│   ├── response  ← status, responseTime, responseSize
│   └── assertions[] ← each pm.test() result (passed/failed + error message)
└── failures[]    ← all failed assertions across the run
```

---

## High-Level Analysis

Once results are loaded, produce a summary covering these areas:

### 1. Overall Health
- Total requests executed
- Total assertions run
- Pass rate: `(passed assertions / total assertions) × 100`
- Total failures
- Whether the run completed or was aborted early

### 2. Response Time Summary
- Fastest and slowest requests (by `response.responseTime`)
- Average response time across all requests
- Flag any requests exceeding a reasonable threshold (e.g. > 2000ms)

### 3. Failure Breakdown
For each entry in `run.failures`, report:
- Request name and folder it belongs to
- The assertion that failed
- The error message
- HTTP status code received vs what was expected (where determinable)

Group failures by type:
- **Status code failures** — wrong HTTP status returned
- **Schema/field failures** — missing or malformed response fields
- **Timeout failures** — request exceeded the timeout threshold
- **Connection failures** — could not reach the host at all

### 4. Per-Request Detail (failures and slow requests only)
For each request with at least one failure or an elevated response time:
- Request name, method, and URL
- HTTP status code and response time
- Failed assertions with error messages
- Passed assertions

### 5. Recommendations
Based on the results, suggest:
- Which endpoints need investigation (consistent failures)
- Whether failures look environmental (auth, base URL, missing variables) vs logic errors in the tests or API
- Response time outliers that may indicate backend issues
- If all requests failed, prompt the user to verify `{{baseUrl}}` and auth variables are set correctly in the environment file

---

## Analysis Output Format

Present the analysis to the user in this structure:

```
## Collection Run Summary
- Collection: <name>
- Duration: <total ms>

## Overall Results
| Metric        | Value     |
|---------------|-----------|
| Requests      | 12        |
| Assertions    | 34        |
| Passed        | 29 (85%)  |
| Failed        | 5         |

## Failed Requests
1. POST /users — "Status code is 201" → expected 400 to equal 201
2. GET /users/99 — "Returns 404 for missing user" → expected 200 to equal 404

## Slow Requests (> 2000ms)
- GET /reports/export — 4312ms

## Recommendations
- POST /users failure suggests the request body may be malformed or a required
  field is missing.
- GET /users/99 returning 200 instead of 404 indicates the endpoint may not
  handle missing resources correctly.
- GET /reports/export is significantly slower than other endpoints — worth
  investigating backend query performance.
```

---

## Troubleshooting Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `postman: command not found` | Postman CLI not installed | Install via Homebrew or download from Postman docs |
| `Unauthorized` on CLI login | Invalid API key | Re-generate API key in Postman account settings |
| All requests fail with `ECONNREFUSED` | Server not running or wrong base URL | Check `{{baseUrl}}` in environment |
| All requests return 401 | Auth token missing or expired | Set `{{token}}` in environment |
| `collection could not be loaded` | Invalid ID, JSON, or wrong file path | Verify the collection ID or re-export from Postman |
| Variables showing as literal `{{name}}` | No environment provided | Pass `--environment` with the correct ID or file |
| Timeouts on all requests | Network issue or server overloaded | Increase `--timeout-request` or check connectivity |