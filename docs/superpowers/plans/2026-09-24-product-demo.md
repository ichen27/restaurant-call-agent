# Product presentation execution plan
Approved scope: recruiter-demo design and September 24 instruction to follow recommendations, prioritizing GitHub optics.
Execution: native, continuous, independent final review.

1. Share menu-priced order creation between the voice API and isolated demo; first prove duplicate voice submissions currently create two orders, then fix stable per-call identity without weakening validation.
2. Implement an isolated demo server with expiring random session identifiers, bounded capacity, a synthetic restaurant, scenario steps, explicit confirmation, order status updates, reset, and event delivery. No provider keys or production database.
3. Build a polished responsive React workspace: sidebar, operations overview, order columns, live sample-call pane, detail drawer, menu controls, architecture/about page. No fake operational analytics.
4. Add browser tests for entry, order confirmation/status progression, unavailable item/handoff, session separation, and reset; inspect desktop and mobile screenshots.
5. Package a self-contained demo Docker image and compose file. Verify container health and workflow. Keep actual voice deployment separately documented with required provider setup and unverified limitations.
6. Replace README with product overview, real screenshot, demo commands, architecture, verification, and honest deployment matrix. Add contributing and security guidance; remove obsolete claims from current entry docs.
7. Review full branch, fix actionable defects, and publish a feature branch plus draft PR with factual validation. Do not rewrite existing public history or merge main without explicit authorization.

Ruling: User authorized making the GitHub-side result concrete; a reviewable branch/draft PR is within scope. Production deployment and a main-branch merge remain separate.
