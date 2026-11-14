# SafeSignal — Final Project Report

**Generated:** 14 November 2026  
**Version:** 1.0

## Deliverables

| File | Description |
|---|---|
| [`SafeSignal-Final-Project-Report.pdf`](./SafeSignal-Final-Project-Report.pdf) | Print-ready A4 report, 18 pages. |
| [`SafeSignal-Final-Project-Report.html`](./SafeSignal-Final-Project-Report.html) | Responsive source version of the report. |
| [`images/`](./images/) | Real screenshots from the running application. |
| [`diagrams/`](./diagrams/) | Architecture, workflow and department-access diagrams (SVG + PNG). |

## Report Contents

1. Executive Summary
2. Project Overview
3. The Problem
4. The Proposed Solution
5. Core Features
6. Departments & Access
7. Product Walkthrough
8. System Architecture
9. Data, Real-Time & Reliability
10. Security & Privacy
11. Quality & Verification
12. Limitations & Future Work
13. Conclusion
14. Appendix — Setup & Access Reference

## Department Setup

The complete role/department guide is in
[`docs/01-project-overview/departments-and-access-setup.md`](../../docs/01-project-overview/departments-and-access-setup.md).

SafeSignal has four role-based departments: Citizen, Dispatcher, Responder and Administrator.
Demo accounts use the password `Password123!` in the local seeded environment only.

## Rebuild the PDF

The report was rendered with the Playwright Chromium already used by the frontend E2E suite:

```bash
cd frontend
node -e "const { chromium } = require('playwright'); (async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.goto('file://' + require('path').resolve('../reports/final/SafeSignal-Final-Project-Report.html'), { waitUntil: 'networkidle' }); await p.pdf({ path: '../reports/final/SafeSignal-Final-Project-Report.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true }); await b.close(); })();"
```
