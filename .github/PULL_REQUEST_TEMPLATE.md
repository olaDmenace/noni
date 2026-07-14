## What
<!-- One paragraph: what changes? -->

## Why
<!-- Link the PRD requirement (F-xxx, S-xxx, NF-xxx) or ADR. -->

## How
<!-- Brief description of the implementation approach. -->

## Safety / privacy checklist
- [ ] No session content (text or voice) persisted
- [ ] PII (phone, email) only stored hashed
- [ ] Crisis paths still trigger correctly
- [ ] No new env vars without `.env.example` update

## Test plan
- [ ] Unit tests added/updated
- [ ] Manual verification steps:
