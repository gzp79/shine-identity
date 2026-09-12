# Shine Services

Rust workspace with identity/builder services. Stack: Axum, PostgreSQL, Redis, Tokio.

## Local Development Quick Start
- **Run**: `/local-development` skill OR VSCode task "identity: local"
- **Test (API)**: `cd tests && pnpm test:local` (requires service on port 8443)
- **Test (Rust crate)**: DB-backed tests skip unless `SHINE_TEST_REDIS_CNS`/`SHINE_TEST_PG_CNS` are set — see `/local-development` skill "Run Rust crate tests"
- **URL**: `https://cloud.local.scytta.com:8443/identity`
- **Windows**: Use PowerShell for env vars with `--` (bash unsupported)

## Architecture

**Clean Architecture Layers**: Routes → Handlers → Services → Repositories

| Layer | Responsibilities | Does NOT |
|-------|------------------|----------|
| **Routes** | HTTP extraction, validation (AuthPageRequest), response formatting | Business logic, DB access |
| **Handlers** | Orchestrate services (AuthHandler, ExternalLoginHandler, LoginEmailHandler), cross-cutting concerns | Direct DB/HTTP concerns |
| **Services** | Business logic (User, Token, Link, Role, Session, Mailer) | HTTP concerns, orchestration |
| **Repositories** | Data access (PgIdentityDb, RedisSessionDb) | Business logic, validation |

**Key Concepts:**
- **Handler Composition**: Handlers encapsulate complex cross-service workflows (e.g., AuthHandler coordinates token validation, session management, and email completion)
- **ExternalLoginHandler**: Orchestrates OAuth2/OIDC flows (login, registration, linking)
- **Dependency Injection**: AppState provides centralized access to services and handler factories, enabling testability and loose coupling
- **Service Granularity**: Each service has single responsibility (User, Token, Link, Role, Session, Mailer) to maximize reuse and minimize coupling

## Critical Patterns

### Separation of Concerns
**Goal**: Keep each layer focused on its responsibility
- Routes extract/validate HTTP, Handlers orchestrate, Services implement logic, Repositories access data
- **Why**: Testability, reusability, clarity about where to make changes
- **Example**: Route validates `AuthPageRequest`, Handler calls multiple Services, Services don't know about HTTP

### Multi-Method Auth Strategy
**Goal**: Support different auth contexts flexibly (query params, headers, cookies, sessions)
- **Why**: Different clients (browsers, APIs, mobile) need different auth mechanisms
- **Example**: `AuthHandler` provides 4 methods, routes choose appropriate one per endpoint
- **Pattern**: When adding endpoints, consider which auth method fits the client's capabilities

### Validation with Early Returns
**Goal**: Fail fast and show meaningful errors without nested logic
- **Why**: Security checks shouldn't be bypassed; users need clear error messages
- **Pattern**: Validation methods return `Option<AuthPage>` (`None` = continue, `Some` = error)
- **Usage**: `if let Some(err) = req.validate_query(query) { return Ok(err) }`
- **Apply to**: Any flow with multiple preconditions (auth pages, API endpoints)

### Email as Universal Login Credential
**Goal**: Users can log in with email regardless of signup method (email, OAuth2, OIDC)
- **Why**: Better UX - users shouldn't need to remember "did I sign up with Google or email?"
- **Implementation**: External logins must validate and store emails
- **Pattern**: `.filter(|e| e.validate_email()).map(|e| (e.as_str(), false))`
- **Critical**: Validation prevents invalid emails, storage enables future email login

## Agent Conventions

### Rust crate docs
Look up crate API, features, and versions on docs.rs (`https://docs.rs/<crate>/latest/<crate>/`) rather than guessing.

### Skills
Project skills live in `.claude/skills/`. Invoke before working in a domain.

| Skill | When |
|---|---|
| `client-web-architecture` | any file under `client/web/src/` |
| `service-architecture` | adding/reviewing routes, handlers, services, or repositories |
| `mesh-topology` | world/chunk/hex geometry |
| `sdp` | **any new feature or non-trivial change** — keeps the design doc and code in agreement; detects which side is ahead (write doc / write code from doc / sync doc from code). Do not write code without a doc |
| `local-development` | run services locally |
| `api-test-writing` | writing or modifying tests under `tests/api-tests/` or `tests/mock-tests/` |

### Design docs
HTML files under `docs/<domain>/`. Domain subfolders:

| Domain | Path |
|---|---|
| web game client | `docs/client/web/` |
| identity service | `docs/services/identity/` |
| core game | `docs/core/game/` |
| cross-cutting | `docs/shared/` |

Docs are human-readable HTML + agentic extensions: `<details data-agent="implementation|test|security|…">` blocks (collapsed by default) carry implementation notes, test plans, and other detail targeted at agents. CSS: `docs/doc.css` (shared, GitHub-raw-friendly via relative path). Conventions: `.claude/skills/sdp/references/conventions.md`.

Only SDP HTML design docs live under `docs/`. Everything else agent-produced is scratch — see below.

### Scratch & temp files
`temp/` (gitignored) is the scratch area for AI agents. Put anything not meant for git here, so the user can track what's going on without it polluting the working tree or getting auto-committed:
- Plans and non-SDP designs (freeform markdown, drafts) — a design becomes a committed doc only when written as SDP HTML under `docs/`
- Background task / subagent output, logs, review notes, todo scratch, and other transient artifacts

Default any such file to `temp/`. Do not write scratch into `docs/`, source dirs, or the repo root.

## Type-Level Flow Control
**Goal**: Use Rust's type system to encode "continue vs error" and "success vs failure" in function signatures
- **Why**: Compiler enforces error handling; impossible to forget checks; intent is clear from signature
- **Patterns**:
  - `Option<AuthPage>`: Validation gates - `None` means "precondition passed, continue", `Some(page)` means "show error, stop"
  - `Result<T, AuthPage>`: Extraction with fallback - `Ok(value)` means "got data, continue", `Err(page)` means "show error, stop"
  - `&self` vs consuming `self`: Read-only vs state transition - consuming prevents reuse after state change
- **Benefit**: Validation chains are readable and safe: `if let Some(err) = validate_x() { return Ok(err) }`
