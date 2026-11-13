# Judge notes

Strict #BuildHybridAI scoring. Each criterion is 1–10 and weighted equally. Nothing here was posted.

## Round 1

### Scores

| Criterion | Score | Why |
| --- | ---: | --- |
| Technical execution | 7 | Firebase AI Logic is called for real (`InferenceMode.PREFER_ON_DEVICE`, `inferenceSource`, chunking, quote grounding, App Check offscreen bridge, CI). The cloud retry is unreachable in the demo: no policy is past 12,000 characters, and `selectChunks` caps every call at four excerpts, so the 18,000-character cloud budget never sends more text than Nano. |
| Design | 7 | The paper-and-stamp UI is coherent, and empty, loading, and error states exist. The differentiator is a single sentence. First run does not say who the tool is for or what to do first. Verdict stamps are `aria-hidden`. Tabs are not wired to tab panels. A failed Ask disappears. |
| Impact | 7 | Builders and people about to accept a renewal are the right audience, and the permission card is something you can hand someone. The screen never says that, and the privacy promise (Cloud is labeled, and only for a long document) cannot be seen. |
| Idea / originality | 8 | Files-versus-contract, with the clause highlighted, is distinct from Machine Readiness, CrawlPact, and ToS;DR. The hybrid “where did this answer run” story is the hackathon’s point, and the corpus does not show it. |

**Total: 29 / 40**

### Top 5 gaps

1. No sample is long enough to exercise the cloud fallback, and the excerpt cap makes the larger cloud budget a no-op. There is no unit test of that route.
2. The conflict banner hides the two sides. Files and the quoted contract clause should sit next to each other, with a way to open the clause.
3. First run is one sentence. It does not name the reader (someone about to train, scrape, or accept arbitration) or the order of operations: banner, then question, then the highlighted clause.
4. Ask failures are swallowed by `finally` with no message, and the control you pressed does not show that it is working.
5. Accessibility: the stamp is removed from the accessibility tree, tabs do not reference their panels, and a new conflict is not announced.

### Re-score

| Criterion | Score | What changed |
| --- | ---: | --- |
| Technical execution | 8 | Sable Ferry is past 12,000 characters. `planHybridRoute` proves the on-device excerpt misses the training ban and the cloud excerpt contains it. `selectChunks` scales with the budget, and `shouldRetryInCloud` is what the Firebase call uses. The live cloud model still needs Mark's keys, so this is not a 9. |
| Design | 8 | The banner is now Files and Contract, with the clause and Show this clause. Empty state has steps. Ask failures render. Tabs move with the arrow keys and point at a tab panel. The helper text still says "open Sable Ferry" while you are already there. |
| Impact | 8 | The empty state names builders and people facing a renewal or an arbitration clause. The banner quote is the thing you would forward. It still does not say what to do about a conflict. |
| Idea / originality | 9 | The disagreement is now visible as two columns, and Sable exists specifically so the hybrid fallback has a reason: the sentence Nano would not see. |

**Total: 33 / 40.** Up from 29. Not every criterion is 9.

## Round 2

### Scores

Carried forward from the round 1 re-score: Technical 8, Design 8, Impact 8, Idea 9. **Total 33.**

### Top 5 gaps

1. On Sable the helper still says "open Sable Ferry", and nothing invites the one click that reveals the Cloud route. The long-document note only says MayI ranks clauses.
2. A conflict has no "for you" line. The reader sees a disagreement and is not told to hold off on training or scraping.
3. A new answer is not announced and is not scrolled into view, so on a laptop the proof sits under the fold.
4. The five samples look the same. The panel does not say which beat this site is for.
5. The architecture diagram still describes the cloud hop as "model missing or doc too long" rather than "the on-device excerpt missed the clause."

### Re-score

| Criterion | Score | What changed |
| --- | ---: | --- |
| Technical execution | 8 | No change to the engine. The cloud route is now a button on top of the round 1 planner. |
| Design | 8 | Samples are labeled (Files vs terms, Past Nano, and the rest). Sable leads with Show the cloud route. A new answer scrolls into view and is in a live region. The Files cell is still every signal jammed into one line. |
| Impact | 9 | The banner now says what to do: do not train, the files are not permission. |
| Idea / originality | 9 | Unchanged. The two-column disagreement plus the late clause is the idea, and it is on screen. |

**Total: 34 / 40.** Up 1. Technical and design are still short of 9. The Files cell is the high-severity design gap.
