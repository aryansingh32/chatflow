You are a senior automation architect and AI systems engineer.

Design and implement a modular, scalable web automation system using:

* Crawlee (for large-scale crawling & mapping)
* Playwright (for browser automation)
* LLM APIs (GPT-4/Claude) for semantic understanding and decision-making
* Optional: Browser Use / Skyvern / AgentQL for AI-assisted interaction

## 🎯 SYSTEM OBJECTIVE

Build an intelligent browser automation platform that:

1. Traverses entire websites and builds structured maps
2. Stores page structure, elements, and navigation paths
3. Executes tasks (form filling, navigation, downloads/uploads)
4. Adapts to UI/layout changes automatically
5. Periodically rechecks and updates mappings
6. Supports multi-user sessions with proxy handling
7. Integrates with AI APIs for reasoning and dynamic task execution

---

## 🧩 SYSTEM ARCHITECTURE (MODULAR DESIGN)

### 1. CRAWLER & MAPPER MODULE

* Use Crawlee + Playwright
* Traverse entire domain (BFS + DFS hybrid)
* Extract:

  * URLs
  * DOM structure
  * Interactive elements (forms, buttons, inputs)
  * Navigation paths
* Store in:

  * JSON (for quick access)
  * SQLite / Postgres (for structured querying)

Output format:
{
url,
elements: [
{ type, label, selector, attributes }
],
links: [],
actions: []
}

---

### 2. SITE GRAPH ENGINE

* Build a graph database-like structure:

  * Nodes = pages
  * Edges = navigation paths
* Include metadata:

  * load time
  * reliability score
  * last verified timestamp

---

### 3. AI DECISION ENGINE

* Use LLM APIs to:

  * Interpret user intent (natural language → action plan)
  * Map intent to site elements
  * Handle ambiguous UI (e.g., “find login button”)

Prompt style:
"Given this DOM structure and task: {task}, identify the best action sequence."

---

### 4. EXECUTION ENGINE (PLAYWRIGHT CORE)

* Perform:

  * Form filling
  * Clicking
  * File upload/download
  * Navigation flows
* Use:

  * Auto-waiting
  * Retry logic
  * Timeout handling

---

### 5. ADAPTIVE SELECTOR SYSTEM

* Combine:

  * CSS selectors
  * Text-based matching
  * AI-based semantic matching (AgentQL-style)
* Fallback hierarchy:

  1. Stored selector
  2. Heuristic match
  3. AI re-identification

---

### 6. SESSION & PROXY MANAGEMENT

* Assign session per user
* Rotate proxies responsibly:

  * Avoid rate limits
  * Maintain session consistency
* Filter:

  * dead proxies
  * high-latency proxies

---

### 7. CHANGE DETECTION SYSTEM

* Use:

  * changedetection.io
  * scheduled cron jobs
* Detect:

  * DOM changes
  * broken selectors
* Trigger:

  * partial remap
  * full remap if needed

---

### 8. TASK MEMORY SYSTEM

* Store:

  * past executions
  * successful flows
  * failed attempts
* Enable:

  * fast replay of known workflows
  * continuous improvement

---

### 9. CAPTCHA HANDLING 

* Detect captcha presence
* Handle via:
the captcha, the bot should look so legitmit that captcha never comes, if captcha even came then a second bot captcha system comes and solves it it uses opensoruce solutions, AI to solve those captchas, opensource captcha solvers like sider captcha,puzzle captcha,captcha-solver,ai-capcha-bypass,Buster to solve those captcha
  * user intervention (manual solve)
  * allowed third-party solving APIs


---

### 10. SCALABILITY LAYER

* Use queue system:

  * Redis / RabbitMQ
* Support:

  * parallel crawling
  * distributed execution
* Containerize with Docker

---

## ⚙️ WORKFLOW

1. Crawl site → generate map
2. Store structured data
3. User gives task (natural language)
4. AI converts task → action plan
5. Execution engine performs actions
6. Monitor success/failure
7. Update memory + improve mapping
8. Periodically revalidate site

---

## 🧠 AI INTEGRATION STRATEGY

Use AI for:

* Element identification
* Decision making
* Error recovery
* Workflow optimization

Avoid AI for:

* deterministic execution
* timing-critical operations

---

## 🚀 OUTPUT REQUIREMENTS

Generate:

* Full system architecture diagram
* Modular code structure
* Sample implementations:

  * crawler
  * executor
  * AI planner
* Database schema
* Example task execution flow
* Deployment strategy (Docker + scaling)

---

## 🧱 DESIGN PRINCIPLES

* Resilient (handles UI changes)
* Modular (replace components easily)
* Scalable (multi-user, multi-site)
* Maintainable (clean separation of concerns)
* Compliant (no bypassing safeguards)

---

Build this system as production-grade, not a prototype.
Prompt changes/optimization: 🔁 1. Convert Bot → Job-Based System (MANDATORY)
Problem right now:
Your bot likely runs:

User → Bot → Playwright → Result

This blocks everything.
Fix:
Introduce async job flow:

User → API → Queue → Worker → Result Store

Use:

    Redis (BullMQ) or RabbitMQ 
    Change required:
    Every action = job (crawl / fill form / download)

    No direct execution from API 
    👉 This alone enables scale.
    ⚙️ 2. Split Monolith into Services
    Right now everything is mixed. Break into micro-services:
    Required services:
    API Service (user requests)
    Crawler Service (Crawlee)
    Execution Service (Playwright)
    AI Service (LLM decisions)

    Scheduler Service (cron + remap) 
    👉 Each runs independently and scales separately.
    🌐 3. Replace “1 Browser per Task” → Browser Pool
    Problem:
    Launching browsers repeatedly = slow + heavy
    Fix:
    Use pooled browsers in Playwright
    Change:
    Pre-launch browsers
    Reuse them
    Use browser contexts per user

1 browser → 5–10 users

👉 Massive memory savings
🧩 4. Introduce Session Manager
You need a new module:
Responsibilities:

    assign session per user
    attach:
        cookies
        storage
        proxy

    reuse session when possible 
    👉 Without this, login + flows break at scale
    📬 5. Queue Prioritization + Backpressure
    At 1000 users:
    tasks pile up

    system crashes 
    Add:
    priority queues
    rate limiting
    max concurrency caps Example:

high priority → payments / critical tasks
low priority → crawling

🧠 6. Reduce AI Calls (Big Cost Saver)
Right now your design is AI-heavy.
Problem:

    slow
    expensive

    rate-limited 
    Fix:
    Introduce:
    task caching
    selector memory Flow:

First run → AI decides
Next runs → reuse stored flow

👉 AI becomes fallback, not primary
🔍 7. Smart Selector System Upgrade
Current idea is good but not scalable yet.
Improve it:
Store:

    multiple selectors per element

    confidence score 
    Fallback chain:
    stored selector
    text match
    DOM similarity

    AI recovery 
    👉 This reduces failures massively
    🔁 8. Incremental Remapping (NOT full recrawl)
    Problem:
    Full crawl = heavy + slow
    Fix:
    detect changes (via changedetection.io)

    only remap affected pages 
    👉 reduces load by 80–90%
    🌍 9. Proxy System Upgrade
    You mentioned rotation—good, but refine it.
    Add:
    proxy health scoring
    latency tracking
    failure rate tracking Flow:

bad proxy → auto remove
good proxy → reuse

👉 stability > rotation speed
🧪 10. Worker Auto-Scaling
Use:

    Docker

    Kubernetes 
    Change:
    Workers should scale based on:
    queue size
    CPU usage Example:

if queue > 100 → add workers
if idle → scale down

📊 11. Observability (Most Ignored, Most Critical)
Add:

    logs (per job)
    metrics (latency, success rate)

    alerts 
    Tools:
    Prometheus

    Grafana 
    👉 Without this, debugging 1000 users = nightmare
    🧱 12. Storage Optimization
    Your mapping system needs upgrade:
    Move from:

    JSON only ❌ 
    To:
    Postgres (structured queries)

    Redis (fast lookup) 
    👉 Hybrid storage = performance + flexibility
    🔐 13. Compliance + Stability Layer
    Important reality:

    aggressive automation = bans 
    Add:
    rate limiting per domain
    human-like delays
    session reuse 👉 This increases longevity of system 🚀 FINAL ARCHITECTURE (MENTAL MODEL)

                API Layer
                   ↓
                Queue
                   ↓
     ┌──────── Worker Cluster ────────┐
     │  Playwright + Browser Pool     │
     │  Session Manager              │
     │  Selector Engine              │
     └───────────────────────────────┘
                   ↓
             Data Storage
        (Postgres + Redis)
                   ↓
           AI Decision Layer
                   ↓
         Scheduler + Remapper

Queue + worker system
Browser pooling + sessions
AI + selector intelligence
scaling (Docker + Kubernetes)

build our bot make it modular
