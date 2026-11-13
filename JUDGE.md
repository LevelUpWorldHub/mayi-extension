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

## Round 3 — robustness

### Scores

Technical 8, Design 8, Impact 9, Idea 9. **Total 34.**

### Top 5 gaps

1. The Files cell dumps every bot rule into one line. A judge cannot see the decisive signal.
2. A quoted clause is whatever sentence the matcher returned, with no length bound, so a glued paragraph can land in the card.
3. `shouldRetryInCloud` is only covered through the Sable fixture, not as a decision table (short doc, missing quote, quote outside the excerpt).
4. Page fetches have no deadline. A hung policy request leaves the panel on "Fetching…" until the browser gives up.
5. Opening a heading does not force a line break, so a page that omits a closing tag can glue the title onto the clause.

### Re-score

| Criterion | Score | What changed |
| --- | ---: | --- |
| Technical execution | 9 | The cloud decision has a table of tests. Quotes are capped at one short sentence. Fetches die after 12 seconds. Headings break lines even when the closing tag is missing. The live model still needs Firebase keys, and that is setup, not a hole in the path. |
| Design | 8 | The Files cell is now the decisive lines, with the bot list deferred to Signals. The sample chips are still tall, and there is no moment of delight beyond the stamp. |
| Impact | 9 | Unchanged. |
| Idea / originality | 9 | Unchanged. |

**Total: 35 / 40.** Up 1. Design is the remaining short score. No high-severity technical gap left.

## Round 4 — core correctness

Mark raised the bar to 9.5 on every criterion, with a 12-round cap. Scores from here use half points. This round only changes whether a quote is a real span.

### Scores

Technical 9, Design 8, Impact 9, Idea 9. **Total 35.**

### Top 5 gaps

1. A model quote was searched across the whole policy, so a fuzzy hit could cite a sentence the model never saw.
2. A bag-of-words fuzzy match accepted a shuffled sentence. The words were present. The clause was not.
3. When the matcher missed, the extractive path still printed its own sentence as the quote.
4. An HTML comment or an unclosed `<script>` could leak into the text MayI reads.
5. A robots-shaped `ai.txt` with `Allow: /` was treated as permission to train.

### Re-score

| Criterion | Score | What changed |
| --- | ---: | --- |
| Technical execution | 9.5 | Model quotes have to be an exact or normalized span inside the excerpt that was sent, then again in the source page. Shuffled words do not match. A missed citation is not shown. Scripts and comments never become clauses. `Allow: /` in a robots-shaped ai.txt is not a training grant. |
| Design | 8 | Unchanged. |
| Impact | 9 | Unchanged. |
| Idea / originality | 9 | Unchanged. |

**Total: 35.5 / 40.** Up 0.5. Design is still the short score. No high-severity correctness gap left in citation.

## Round 5 — Firebase AI Logic hybrid depth

### Scores

Technical 9.5, Design 8, Impact 9, Idea 9. **Total 35.5.**

### Top 5 gaps

1. The call used `PREFER_ON_DEVICE` and `ONLY_IN_CLOUD` only. `ONLY_ON_DEVICE` and `PREFER_IN_CLOUD` were never selected.
2. `countTokens` was unused, so the on-device budget was a character guess.
3. On-device calls had no `responseConstraint`, no system prompt, and no language expectation. Cloud calls had no safety settings, no system instruction, and no thinking level.
4. A bad JSON reply was thrown away. `startChat` could have asked once for the object.
5. The answer did not keep `usageMetadata` or the mode that actually ran.

### Re-score

| Criterion | Score | What changed |
| --- | ---: | --- |
| Technical execution | 9.5 | Held. The path now calls `countTokens`, `initializeDeviceModel`, `generateContentStream` (with `generateContent` if the stream fails), `startChat` plus one repair turn and `getHistory`, and all four `InferenceMode` values. On-device params carry a JSON response constraint and a system prompt. Cloud params carry the same instruction, `BLOCK_ONLY_HIGH` safety settings, and `ThinkingLevel.MINIMAL`. Token counts land on the answer. |
| Design | 8 | Unchanged. |
| Impact | 9 | Unchanged. The token counts are stored and not yet the story on the card. |
| Idea / originality | 9.5 | The hybrid decision is now a real fork: Nano only when it is ready and the prompt fits, cloud only when the excerpt missed the clause or the token count does not fit, cloud-preferred after Nano fails. That is the hackathon idea, expressed as code rather than a badge. |

**Total: 36 / 40.** Up 0.5. Design is still short of 9.5.

## Round 6 — design and UX polish

### Scores

Technical 9.5, Design 8, Impact 9, Idea 9.5. **Total 36.**

### Top 5 gaps

1. The three beats were a raw uppercase line, easy to miss and easy to mistake for a status dump.
2. Severity said "tension" and "aligned" in the engine's words.
3. Sample chips repeated every mark, so the row wrapped into a second control bar.
4. Show this clause and Copy clause had no focus ring.
5. The shortcut hint disappeared the moment a clause was highlighted.

### Re-score

| Criterion | Score | What changed |
| --- | ---: | --- |
| Technical execution | 9.5 | Unchanged. |
| Design | 9 | The beats are a numbered stepper. Severity uses plain labels. The selected sample keeps its mark; the others stay one line and scroll. Clause actions take a focus ring. The / hint stays put when the highlight confirms. |
| Impact | 9 | Unchanged. |
| Idea / originality | 9.5 | Unchanged. |

**Total: 36.5 / 40.** Up 0.5. Design is not at 9.5 yet. Contrast, motion, and the demo path are still open.

## Round 4 — delight and demo moments

### Scores

Technical 9, Design 8, Impact 9, Idea 9. **Total 35.**

### Top 5 gaps

1. Nothing marks the three beats a judge should hit: banner, answer, clause. The demo is a pile of controls.
2. The clause cannot be copied. Showing it on the page is the proof; handing someone the sentence is the other half.
3. The question field has no keyboard way in. A side panel should focus on `/`.
4. Show this clause gives no confirmation, so a click that worked looks the same as a click that didn't.
5. Sample chips are two lines tall, so the five sites compete with the banner.
