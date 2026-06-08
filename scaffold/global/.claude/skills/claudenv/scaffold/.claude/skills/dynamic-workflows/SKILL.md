---
name: dynamic-workflows
description: |
  Trigger when a task naturally decomposes into many independent sub-tasks
  that benefit from deterministic multi-agent orchestration: reviewing or
  migrating across many files, research over many sources, multi-dimension
  audits, generate-N-then-judge, or "find all X" with verification. Use the
  Workflow tool (agent()/parallel()/pipeline()). Also triggers on the word
  "workflow"/"workflows" or an explicit ask to fan out / orchestrate
  subagents. Do NOT trigger for single-file edits, strictly sequential work,
  or anything one or two Agent calls already cover.
---

# Dynamic workflows

Deterministic multi-agent orchestration via the built-in **Workflow** tool —
a JavaScript script that fans work out across subagents (`agent()`),
pipelines it (`pipeline()`), or barriers on it (`parallel()`). This skill
decides *when* orchestration earns its cost and gives the minimal scaffold to
launch one. The Workflow tool's own description carries the full API — lean on
it; don't reproduce it here.

## Mode detection (FIRST step every time)

Check the system prompt for the marker `Dynamic-workflows mode (loop)`.

- **Marker present** → LOOP mode. You are inside `claudenv loop`. Orchestrate
  without pausing, but only for plan items that genuinely split into
  independent sub-tasks, and keep fan-out narrow (see Cost discipline). The
  goal is law — never pause to ask "запустить workflow?".
- **Marker absent** → INTERACTIVE mode. Propose a one-line orchestration plan
  (how many agents, what each does, pipeline vs parallel) and wait for the
  user before launching.

## When to orchestrate (triggers)

Reach for a workflow when the work is *wide* — many items, each handled the
same way, with little cross-talk:

- **Review / audit** a diff across several dimensions (bugs, perf, security,
  style), then adversarially verify each finding.
- **Migrate / edit a pattern** across many files (worktree isolation per
  agent when they mutate in parallel).
- **Research** a question over many sources, then synthesize.
- **Generate N independent attempts** (different angles), judge, synthesize
  from the winner.
- **"Find all X"** with a verification pass and loop-until-dry.

## When NOT to orchestrate (anti-triggers)

Stay single-threaded — a workflow is pure overhead here:

- A single file, or a change that must happen in strict sequence.
- Trivial edits, renames, formatting.
- Anything one or two plain `Agent` calls already cover — prefer those.

**Cost discipline.** Multi-agent fan-out costs roughly an order of magnitude
more tokens than single-threaded work (~15×; see `claudenv-update-plan.md`).
Single-threaded is the default. Orchestrate only when the width is real, and
cap the number of concurrent agents to what the task needs.

## How to launch (minimal scaffold)

Every script starts with a pure-literal `meta`, then uses `pipeline()` as the
default and `parallel()` only as a barrier when you genuinely need all
prior-stage results at once. Pattern — review each dimension, verify each
finding as soon as it lands:

```js
export const meta = {
  name: 'review-diff',
  description: 'Review the diff across dimensions and verify each finding',
  phases: [{ title: 'Review' }, { title: 'Verify' }],
}
const DIMENSIONS = [
  { key: 'bugs', prompt: 'Find correctness bugs in the diff…' },
  { key: 'perf', prompt: 'Find performance regressions in the diff…' },
]
const results = await pipeline(
  DIMENSIONS,
  d => agent(d.prompt, { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS }),
  review => parallel(review.findings.map(f => () =>
    agent(`Adversarially verify, default to refuted if unsure: ${f.title}`,
      { label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT })
      .then(v => ({ ...f, verdict: v }))))
)
const confirmed = results.flat().filter(Boolean).filter(f => f.verdict?.isReal)
return { confirmed }
```

Useful patterns (compose as the task needs): **adversarial-verify** (N
skeptics per finding, kill on majority-refute), **loop-until-dry** (keep
finding until K empty rounds), **judge panel** (N attempts → score →
synthesize). Scale the agent count to the ask — a few for "quick check",
more for "thorough audit".

## Notes

- `agent(prompt, { schema })` returns the validated object; without a schema
  it returns the agent's final text.
- Use `isolation: 'worktree'` only when agents mutate files in parallel and
  would otherwise conflict — it is expensive.
- In LOOP mode, if the Workflow tool's background completion does not resolve
  under headless `claude -p`, fall back to plain parallel `Agent` calls for
  the same fan-out — same spirit, no dependency on the background runtime.
