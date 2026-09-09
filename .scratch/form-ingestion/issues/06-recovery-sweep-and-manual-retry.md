# 06: Startup recovery, automatic sweeps, and manual retry

**What to build:** On process startup, anything left in an in-progress state from a prior crash is picked back up rather than stuck forever. An interval sweep (safety net alongside the event-triggered consumer from ticket 04) covers due transient failures and pending email obligations, claiming each row before processing it so two overlapping sweep passes can never process the same row twice. `POST /retry` (bulk) and `POST /retry/:sessionId` (targeted) let a human manually trigger reprocessing — most importantly for `failed_validation` ingests, which are never touched by the automatic sweep and only move forward after a code fix ships. Manual retry reruns current code against the preserved raw ingest, and — per ticket 04/05's per-stage design — resumes from whatever stage the form actually needs: a full reprocess if it never transformed, an email-only resend if it already did. It can never produce a duplicate form.

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] On startup, any ingest left in an in-progress state from a prior crash is picked back up automatically
- [ ] An interval sweep automatically retries `failed_transient` ingests without any manual call
- [ ] An interval sweep automatically retries pending email obligations without any manual call
- [ ] `failed_validation` ingests are never touched by the automatic sweep
- [ ] Two overlapping sweep passes cannot both process the same row (a claim mechanism verified by a test)
- [ ] `POST /retry/:sessionId` reprocesses one specific form
- [ ] `POST /retry` reprocesses all currently-failed forms
- [ ] Manually retrying a `failed_validation` ingest resumes the full pipeline (validate → transform → geocode → persist)
- [ ] Manually retrying a form that already transformed but has a pending email obligation resends only the email — verified no re-geocode, no second form record
- [ ] No retry path, automatic or manual, can ever result in two forms for the same ingest
