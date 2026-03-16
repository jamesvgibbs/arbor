---
name: feedback_review_carefully
description: User expects me to review changes in the browser before declaring done, and to be precise about what annotations in screenshots mean
type: feedback
---

When the user provides annotated screenshots, be very precise about interpreting what each annotation refers to. Don't over-scope changes — only change exactly what's annotated.

**Why:** User was frustrated when I misidentified which UI elements the annotations pointed to and changed things that shouldn't have been changed (removed PR header bar, removed ChatHeader, removed file path header, made wrong thing collapsible).

**How to apply:** Always use browser automation to verify changes visually before declaring work done. When in doubt about what an annotation means, ask for clarification rather than guessing wrong.
