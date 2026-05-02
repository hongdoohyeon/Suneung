# Missing Gradecuts Fill Implementation Plan

> **For Hermes:** Use Claude Code as a second reviewer/research assistant before committing each batch.

**Goal:** Fill missing KICE/education-office gradecut data in `data/gradecuts.json`, prioritizing records that affect site display (`rawCuts`).

**Architecture:** Keep raw source files under `data/raw/<source>/`, normalize them into compact JSON records, then integrate via `scripts/build-gradecuts.mjs` with strict guards: no blind overwrites, standard-cut compatibility checks, monotonic rawCuts checks, and canonical fullScore normalization.

**Tech Stack:** Node.js build scripts, JSON raw data files, `npm run build-gradecuts`, `npm run validate`, Claude Code print-mode review.

---

## Priority Order

1. **Batch 1 — high impact recent rawCuts**
   - 2022 9월 모의평가: 국어 언어와매체/화법과작문, 수학 기하/미적분/확률과통계
   - 2022 3월 학력평가: 국어 언어와매체/화법과작문, 수학 기하/미적분/확률과통계

2. **Batch 2 — older CSAT 탐구 rawCuts**
   - 2014~2016 수능 records where standard/percentile data exists but `rawCuts` is missing.
   - Prefer official KICE PDFs/HWP/HWPX if available; otherwise use archived high-trust provider tables with source URLs.

3. **Batch 3 — no-gradecut records**
   - 2017~2023 평가원 탐구 partial gaps.
   - 2015~2016 교육청 학평 large gaps.
   - Treat as research-heavy; only ingest if a traceable source is found.

---

## Task 1: Confirm current missing set

**Objective:** Re-run the missing-gradecut audit before changing data.

**Files:**
- Read: `data/exams.json`
- Read: `data/gradecuts.json`

**Command:**

```bash
node scripts/audit-missing-gradecuts.mjs # create if worth keeping, otherwise use temporary node snippet
```

**Expected:** Batch 1 has exactly 10 no-raw records.

---

## Task 2: Source Batch 1 rawCuts

**Objective:** Find traceable sources for 2022 9모 and 2022 3학평 Korean/Math elective rawCuts.

**Likely sources:**
- `https://suneungcalc.com/js/data.js` Crux calculator coefficients
- Orbi Crux Table posts linked from `data/raw/crux/suneungcalc-csat-rawcuts.json` style
- EBSi/education office pages if they publish raw by elective

**Rules:**
- Store source URL and source key for each record.
- If using calculator coefficients, compute `rawCuts` as minimum total raw score whose calculated standard score reaches each standard cut.
- Verify against existing `standardCuts` before applying.

---

## Task 3: Ingest Batch 1

**Objective:** Add a raw source JSON and integrate it into build.

**Files:**
- Create/modify: `data/raw/crux/suneungcalc-mock-rawcuts.json` or similar
- Modify: `scripts/build-gradecuts.mjs`
- Generated: `data/gradecuts.json`

**Implementation rules:**
- Do not overwrite existing non-megastudy/non-empty `rawCuts`.
- Require compatible `standardCuts`.
- Skip non-monotonic rawCuts.
- Keep source label explicit, e.g. `+crux-mock-raw`.

---

## Task 4: Verify Batch 1

**Objective:** Confirm 10 target records are filled and safe.

**Commands:**

```bash
npm run build-gradecuts
npm run validate
git diff --check
```

**Additional checks:**
- 10 target records have 8 finite rawCuts.
- rawCuts are monotonic descending.
- 국어/수학 fullScore remains 100.

---

## Task 5: Claude Code review

**Objective:** Ask Claude Code to review the diff for data integrity blockers.

**Command pattern:**

```bash
git diff | claude -p "Review this gradecut data ingestion diff for data integrity blockers only..." --max-turns 10
```

**Expected:** No blockers, or fix all blockers and rerun.

---

## Task 6: Commit and push

**Objective:** Commit verified batch with source files and generated output.

**Commands:**

```bash
git add data/raw scripts/build-gradecuts.mjs data/gradecuts.json docs/plans/2026-05-02-fill-missing-gradecuts.md
git commit -m "Add missing recent mock raw grade cuts"
git push
```

---

## Task 7: Continue Batches 2 and 3

**Objective:** Repeat source→ingest→verify→review→commit cycle per source family.

**Do not mix uncertain sources into the same commit as verified recent data.**
