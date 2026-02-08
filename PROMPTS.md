# Cursor Prompt Templates
# Usage:
# 1. Select code or file (or use @file / @selection / @project)
# 2. Cmd/Ctrl + K
# 3. Paste a template below
# 4. Add a one-line tweak if needed

---
## EXPLAIN — Onboarding & Clarity

ROLE:
Senior engineer onboarding a new teammate

TASK:
Explain the selected code

CONSTRAINTS:
- Assume basic programming knowledge
- Avoid unnecessary jargon
- Call out hidden assumptions
- Explain why decisions were made

OUTPUT FORMAT:
- What it does
- How it works
- Why it was built this way
- Risks / edge cases

---
## REFACTOR — Minimal Diff (Safe Mode)

ROLE:
Staff engineer

TASK:
Refactor the selected code for clarity and maintainability

CONSTRAINTS:
- Do not change behavior
- Minimal diff only
- Preserve naming, structure, and public APIs
- Follow existing patterns in this repo

OUTPUT FORMAT:
- Code diff only

---
## REFACTOR — Performance Focus

ROLE:
Senior performance engineer

TASK:
Refactor the selected code to improve performance

CONSTRAINTS:
- Preserve behavior
- Call out tradeoffs
- Do not prematurely optimize
- Respect existing abstractions

OUTPUT FORMAT:
- Summary of bottlenecks
- Suggested changes
- Code diff

---
## TESTS — Edge Case Coverage

ROLE:
Test engineer

TASK:
Generate unit tests for the selected code

CONSTRAINTS:
- Focus on edge cases and failure paths
- Follow existing test conventions
- Do not test implementation details
- Prefer readability over cleverness

OUTPUT FORMAT:
- Test file only

---
## REVIEW — Bugs & Risk Assessment

ROLE:
Senior code reviewer

TASK:
Review the selected code for potential issues

CONSTRAINTS:
- Look for bugs, race conditions, and bad assumptions
- Consider scale, concurrency, and future changes
- Be critical but constructive

OUTPUT FORMAT:
- Issues
- Severity (low / medium / high)
- Suggested fixes

---
## DOCS — Developer Documentation

ROLE:
Staff engineer writing internal documentation

TASK:
Write documentation for the selected code

CONSTRAINTS:
- Assume reader is a future maintainer
- Explain intent, not just mechanics
- Keep it concise and skimmable

OUTPUT FORMAT:
- Overview
- Key concepts
- Usage examples
- Gotchas

---
## PR — Pull Request Description

ROLE:
Tech lead

TASK:
Write a pull request description for the selected changes

CONSTRAINTS:
- Explain why, not just what
- Be concise and professional
- Call out risks explicitly

OUTPUT FORMAT:
- Summary
- Changes
- Testing
- Risks / rollout notes

---
## PRODUCT — Feature Impact Translation

ROLE:
Product owner and analyst

TASK:
Explain what the selected code enables from a product perspective

CONSTRAINTS:
- Avoid implementation details
- Focus on user impact and behavior
- Consider metrics and observability

OUTPUT FORMAT:
- Feature behavior
- User value
- Metrics impacted
- Risks / limitations

---
## ANALYTICS — SQL Review & Validation

ROLE:
Analytics engineer

TASK:
Review the selected SQL for correctness and performance

CONSTRAINTS:
- Validate joins, filters, and aggregations
- Call out assumptions and data gaps
- Consider scale and cost

OUTPUT FORMAT:
- Issues
- Performance concerns
- Suggested improvements

---
## METRICS — Definition & Gaps

ROLE:
Product analytics lead

TASK:
Identify key metrics supported or required by the selected code

CONSTRAINTS:
- Focus on business-relevant metrics
- Call out missing instrumentation
- Avoid vanity metrics

OUTPUT FORMAT:
- Primary metrics
- Supporting metrics
- Gaps / recommendations

---
## ARCHITECTURE — System-Level View

ROLE:
Principal engineer

TASK:
Explain how the selected code fits into the overall system

CONSTRAINTS:
- Focus on boundaries and responsibilities
- Call out dependencies
- Identify future risks

OUTPUT FORMAT:
- Component responsibility
- Inputs / outputs
- Dependencies
- Risks / scaling concerns

---
## SAFETY — Change Impact Check

ROLE:
Senior engineer responsible for production stability

TASK:
Assess the impact of the selected change

CONSTRAINTS:
- Assume production traffic
- Look for blast radius and rollback concerns
- Be pessimistic

OUTPUT FORMAT:
- Impacted systems
- Failure modes
- Rollback strategy

---
## CLEANUP — Dead Code & Simplification

ROLE:
Staff engineer

TASK:
Identify dead code, duplication, or unnecessary complexity

CONSTRAINTS:
- Do not remove anything without justification
- Prefer simplification over cleverness

OUTPUT FORMAT:
- Findings
- Safe removals
- Suggested simplifications

---
## PARAMETERIZED — Custom Task Template

ROLE:
{your role here}

TASK:
{your task here}

CONSTRAINTS:
- Preserve behavior unless stated otherwise
- Follow existing repo conventions
- Keep changes minimal and intentional

OUTPUT FORMAT:
{your desired output}
