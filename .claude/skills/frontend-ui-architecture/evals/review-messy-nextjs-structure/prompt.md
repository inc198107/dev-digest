---
tags: [frontend-ui-architecture]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Here is the structure of our Next.js 15 App Router app (TypeScript, TanStack Query). Review it and tell me what to change and where things should move. No code edits, just the review.

    src/
      app/dashboard/page.tsx      'use client', 420 lines: fetches /api/projects in useEffect, filters, sorts, renders a table and two charts
      app/settings/page.tsx
      components/                 64 files in one flat folder: Button.tsx, Modal.tsx, ProjectTable.tsx, BillingForm.tsx, InvoiceRow.tsx, ...
      utils/helpers.ts            40 functions: formatCurrency, calcInvoiceTotal, isTrialExpired, parseDate, buildProjectQuery, cn, ...
      utils/constants.ts          API_URL, STRIPE_SECRET_KEY, a ROLES enum, page titles, brand colours
      features/billing/BillingForm.tsx
                                  imports usePickerState from features/projects/components/ProjectPicker/internal/usePickerState
