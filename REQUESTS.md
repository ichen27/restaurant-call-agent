# REQUESTS.md

## Purpose

This file collects ANY item where human input would improve decision quality. Please follow the template when creating a new request
    - New requests should be set as OPEN
    - Request that I have responded to will be labelled as RESPONDED
    - The file first starts with a file description, followed by a template, followed by the live requests backlog.

The agent should log requests here whenever:
- There is ambiguity
- Multiple valid approaches exist
- A tradeoff exists
- UX behavior is unclear
- Naming or wording matters
- Scope creep is possible
- A design preference may affect direction
- Approval is needed
- Or simply when human judgment would help
- New requests should be set as OPEN
- Request that I have responded to will be labelled as RESPONDED


### Request Status Modes

OPEN
- The agent created the request.
- Awaiting human response.

RESPONDED
- The human has filled in the HUMAN RESPONSE section.
- The agent must process the response before continuing.

DONE
- The agent processed the response.
- Backlog and/or Decisions updated accordingly.
- Request is complete.

# =========================
# ===== TEMPLATE (READ-ONLY)
# =========================

## Backlog Template
---

### OPEN 
<!-- Open Requests go here -->

---
### RESPONDED
<!-- Closed Requests go here -->

---
### DONE (recent)
<!-- Keep last ~10 for quick reference -->

## Request Template

### <TYPE>-<####> — <NAME>

Status: [OPEN | RESPONDED | DONE]

Blocking: [YES | NO]
Related Task: FEAT-032

Context:
We need to decide how to store refresh tokens.

Options:
1) HttpOnly cookie
2) LocalStorage
3) Server-side session

Tradeoffs:
- Cookie: safer vs XSS, harder for mobile apps
- LocalStorage: easier, higher XSS risk
- Server session: more infra complexity

Recommendation:
Option 1 — HttpOnly cookie

Impact:
Affects auth middleware + API design


Human Input Requested:
- Confirm preferred storage strategy
- Any mobile client constraints?

Human Response:

---




# =========================
# ===== LIVE REQUESTS BELOW
# =========================


---

## OPEN 
<!-- Open Requests go here -->

---
## RESPONDED
<!-- Closed Requests go here -->

---
## DONE (recent)
<!-- Keep last ~10 for quick reference -->

### REQ-2001 — Frontend Test Dependency Approval for DX-2008

Status: DONE

Blocking: YES
Related Task: DX-2008

Context:
DX-2008 requires automated frontend and end-to-end coverage for the staff web app to meet MVP "highly tested" expectations.
Current repository has backend test tooling only. Frontend workflow testing will likely require additional dev dependencies.

Options:
1) Approve adding frontend test stack dependencies now (recommended).
2) Keep zero new dependencies and rely on backend-only automated tests plus manual frontend smoke checks.
3) Defer frontend automation until after MVP launch and keep DX-2008 blocked.

Tradeoffs:
- Option 1: strongest regression prevention and CI confidence; adds tooling and maintenance overhead.
- Option 2: no dependency growth; significantly weaker UI regression protection.
- Option 3: fastest near-term delivery; carries highest post-release bug risk for staff UI behavior.

Recommendation:
Option 1 — approve targeted frontend test dependencies for critical path automation.

Impact:
Affects root CI scripts, `apps/staff-web` test setup, and test documentation.

Human Input Requested:
- Approve or reject adding frontend test dependencies for DX-2008.
- If approved, confirm preference: minimal component tests only, or component + browser E2E.

Human Response:
- Approved adding frontend test dependencies now.
- Preferred scope: component + browser E2E.


### REQ-2012 — Recruiter release direction and execution
Status: DONE
Human Response: User approved design and said to follow all recommendations, prioritizing complete product presentation, READMEs, demos, deployability, and commit quality.
Decision: Native execution, final independent review, preserve original work, no invented production claims.
