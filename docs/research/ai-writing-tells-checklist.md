# AI writing tells: checklist for a checker agent

Version: 2026-10-01 (Task #204). Machine-readable twin: `docs/research/ai-writing-tells.json` (same IDs, generated from the same source data). Evidence and citations: `docs/research/ai-writing-2026-10-01.md` and the claim ledger `docs/research/ai-writing/RESEARCH.md`.

Evidence grades used below: [PR] peer-reviewed, [PP] preprint/working paper, [OFF] official docs, [VEND] vendor research with a commercial interest, [JOUR] journalism, [PRAC] practitioner/community guide, [ANEC] anecdote, [INF] inference.

## What this checker is for

The checker is a **style linter for reader trust**. It is not an authorship detector. Its job is to find what makes a message read as generic or templated and to suggest a specific fix. Research shows typical readers detect AI at about chance (50-52%, Jakesch et al. 2023 [PR]). Frequent AI users detect it very well (Russell et al. 2025 [PR]). The trust penalty comes from *suspicion*, and it is largest for relational messages (Cardon & Coman 2025 [PR]; Hohenstein et al. [PR/PP]).

## Rules for the checker agent

1. **No single tell is proof.** Every tell below also appears in human writing. Report findings as "reads as templated" with the fix. Never say "this is AI-written".
2. **Score by density and spread across categories, not raw count.** Suggested scoring (unvalidated heuristic; calibrate on Jermaine's sent mail):
   - high = 3 points, med = 2, low = 1. Count each tell ID once per message, plus 1 extra point if the same tell fires 3+ times.
   - Under 150 words: 0-2 points = pass; 3-5 = suggest edits; 6+ = rewrite.
   - 150+ words: scale the thresholds by word count / 150.
   - Any **high** tell from `lex-06` (leaked chatbot artifacts) or `spec-03` (placeholders) = **block sending** regardless of score.
   - Tells from 3+ different categories = escalate one level.
3. **Channel matters.** Apply `chan-*` rules only to their channel. Markdown tells (`str-05`, `str-06`, `str-14`, `str-15`) are high in email/DM/SMS and low or ignored in documents.
4. **Relational messages** (`chan-04`: congratulations, thanks, condolences, apologies, feedback, recommendations): raise every severity one level and recommend that Jermaine write it himself, using AI only for typos.
5. **False-positive policy.**
   - Do not penalize non-native English patterns, regional or cultural politeness norms, or curly quotes alone (macOS converts quotes automatically).
   - Do not treat formal register as a tell in legal, academic, or grant writing. Flag only density there.
   - Do not run detectors (GPTZero, Turnitin, etc.) as part of this check. Their false-positive rates vary from 0% to 100% across tools on human text (2026 [PP]).
6. **Facts beat style.** `spec-05` is a verification trigger. Any statistic, link, quote, or named source must be checked before sending. A fabricated fact costs more trust than any style tell.
7. **Fix, don't just flag.** For each finding, return the matched text, the tell ID, the severity, and a rewritten sentence that adds a concrete detail (a number, date, name, or what someone said) or deletes the sentence.
8. **Word lists drift.** "Delve" faded in 2025, and ChatGPT stopped em dashes on request in Nov 2025. Re-check lexical lists every 6 months.

Regex notes: patterns use Python `re` syntax with inline flags (`(?i)`, `(?m)`). Some patterns (for example `str-02` triplets and `spec-05` numbers) deliberately over-match. Their heuristic says when a match counts. All 42 regex patterns are tested against positive and negative examples, and against their own before/after pairs.

## Quick reference

| ID | Tell | Category | Severity | Regex? |
|--|--|--|--|--|
| `lex-01` | Corpus-verified AI vocabulary | lexical | med | yes |
| `lex-02` | Corporate buzzword register | lexical | low | yes |
| `lex-03` | Significance and puffery phrases | lexical | med | yes |
| `lex-04` | Template 'hope' opener | lexical | low | yes |
| `lex-05` | Assistant-voice phrases | lexical | med | yes |
| `lex-06` | Leaked chatbot artifacts | lexical | high | yes |
| `lex-07` | Signposting and stacked transitions | lexical | low | yes |
| `lex-08` | Intensifier padding | lexical | low | yes |
| `str-01` | Negative parallelism ('It's not X, it's Y') | structural | med | yes |
| `str-02` | Rule of three / stacked triplets | structural | low | yes |
| `str-03` | Em-dash density | structural | low | yes |
| `str-04` | Uniform sentence length (low burstiness) | structural | low | heuristic |
| `str-05` | Headers in a short message | structural | high | yes |
| `str-06` | Bolded inline-header bullets | structural | high | yes |
| `str-07` | Symmetric bullets | structural | low | heuristic |
| `str-08` | Summary or restating closer | structural | med | yes |
| `str-09` | 'Despite challenges' / future-outlook ending | structural | med | yes |
| `str-10` | Trailing participle 'analysis' | structural | med | yes |
| `str-11` | Copula avoidance ('serves as', 'boasts') | structural | low | yes |
| `str-12` | Hook-and-reveal framing | structural | med | yes |
| `str-13` | Title Case headings | structural | low | yes |
| `str-14` | Emoji as bullets or headers | structural | med | yes |
| `str-15` | Horizontal rules between sections | structural | med | yes |
| `str-16` | Mixed curly and straight quotes | structural | low | heuristic |
| `str-17` | Nominalization density | structural | low | yes |
| `tone-01` | Sycophantic opener | tone | med | yes |
| `tone-02` | Unearned enthusiasm | tone | med | yes |
| `tone-03` | Over-politeness and apology stacking | tone | low | yes |
| `tone-04` | Generic empathy boilerplate | tone | med | yes |
| `tone-05` | Noncommittal balance | tone | med | yes |
| `tone-06` | Hedge stacking | tone | low | yes |
| `spec-01` | Empty personalization | content_specificity | high | yes |
| `spec-02` | No concrete details | content_specificity | high | heuristic |
| `spec-03` | Placeholder or merge-field residue | content_specificity | high | yes |
| `spec-04` | Padding sections | content_specificity | med | yes |
| `spec-05` | Unverified facts, stats, links, quotes | content_specificity | high | yes |
| `spec-06` | Restating the request | content_specificity | low | yes |
| `spec-07` | No clear ask or next step | content_specificity | med | heuristic |
| `spec-08` | Vague attribution | content_specificity | med | yes |
| `chan-01` | Pasted subject line in body | channel_email | high | yes |
| `chan-02` | Canned sign-off stack | channel_email | low | yes |
| `chan-03` | Reply length mismatch | channel_email | med | heuristic |
| `chan-04` | Relational message escalation | channel_email | high | yes |
| `chan-05` | Cold-DM template phrases | channel_linkedin | med | yes |
| `chan-06` | LinkedIn post 'broetry' format | channel_linkedin | med | yes |
| `chan-07` | Email register in a text | channel_sms | med | yes |
| `chan-08` | Smart-reply positivity | channel_sms | low | yes |
| `chan-09` | Cover-letter cliches | channel_cover_letter | high | yes |
| `chan-10` | No employer-specific content | channel_cover_letter | high | heuristic |

## 1. Lexical tells

### `lex-01` Corpus-verified AI vocabulary (severity: med)

- **What it is:** Words with measured post-ChatGPT overuse: delve, tapestry, testament, pivotal, underscore, showcase, intricate, meticulous, bolster, garner, interplay, vibrant, realm, multifaceted, camaraderie, palpable, amidst, embark.
- **Detection rule:** `(?i)\b(delv(?:e|es|ed|ing)|tapestr(?:y|ies)|testament|pivotal|underscor(?:e|es|ed|ing)|showcas(?:e|es|ed|ing)|intricate|intricacies|meticulous(?:ly)?|bolster(?:s|ed|ing)?|garner(?:s|ed|ing)?|interplay|vibrant|realm|multifaceted|camaraderie|palpable|amidst|embark(?:s|ed|ing)?)\b`
- **Heuristic:** Count distinct matches. 1 = note only. 2 distinct in under 150 words, or more than 1 per 75 words = flag. 3+ distinct = high. Words drift by model era (delve faded in 2025); refresh list every 6 months. False positives: academic and literary writers, non-native writers taught 'elevated' vocabulary.
- **Why it matters:** Kobak et al. 2025 [PR]: 'delves' 28x, 'underscores' 13.8x, 'showcasing' 10.7x expected frequency in 2024 PubMed. Reinhart et al. 2025 [PR]: GPT-4o uses tapestry/camaraderie/palpable/intricate >100x human rate; 'tapestry' in 23% of outputs. Wikipedia Signs of AI writing [PRAC] era lists. Heavy AI users cite 'AI vocabulary' first (Russell et al. 2025 [PR]).
- **False-positive risk:** Single uses are common in human writing; 'testament', 'realm', 'vibrant' have legitimate literal uses.
- **Fix:** Replace with the plain word or, better, the concrete fact the word was standing in for.

Before:
> This partnership underscores our pivotal role in a vibrant ecosystem.

After:
> This partnership means our software now runs in 14 of the district's schools.

### `lex-02` Corporate buzzword register (severity: low)

- **What it is:** leverage, seamless, robust, elevate, game-changer, cutting-edge, synergy, holistic, streamline, empower, unlock, unleash, transformative, revolutionize, best-in-class, 'navigate the complexities/challenges/landscape'.
- **Detection rule:** `(?i)\b(leverag(?:e|es|ed|ing)|seamless(?:ly)?|robust|elevat(?:e|es|ed|ing)|game[- ]chang(?:er|ers|ing)|cutting[- ]edge|synerg(?:y|ies)|holistic|streamlin(?:e|es|ed|ing)|empower(?:s|ed|ing)?|unlock(?:s|ed|ing)?|unleash(?:es|ed|ing)?|transformative|revolutioniz(?:e|es|ed|ing)|best[- ]in[- ]class|navigat(?:e|es|ed|ing) (?:the )?(?:complexit\w*|challenges?|landscape|uncertaint\w*))\b`
- **Heuristic:** Flag at 2+ distinct in a short message, or any co-occurrence with lex-01 or lex-03. False positives: technical senses ('robust statistics', 'unlock the door', 'elevate the patient's leg'); marketing copy where this register is expected.
- **Why it matters:** Wikipedia [PRAC] lists robust, enhance, fostering. The rest are practitioner-reported [PRAC/ANEC]; no corpus ratio retrieved. They hurt mainly because they are generic, which matches the 'regression to the mean' description in Wikipedia and the low-originality cue used by expert detectors (Russell et al. [PR]).
- **False-positive risk:** Human corporate writing used these long before LLMs.
- **Fix:** Use the plain verb (use, help, improve, handle) and say what actually changed.

Before:
> We leverage cutting-edge tools to deliver a seamless, robust experience.

After:
> We moved you to the new server, so pages load in about a second instead of four.

### `lex-03` Significance and puffery phrases (severity: med)

- **What it is:** 'plays a crucial/pivotal/vital role', 'is a testament to', 'underscores the importance', 'evolving landscape', 'in today's fast-paced world', 'indelible mark', 'deeply rooted', 'setting the stage for', 'marks a shift/turning point'.
- **Detection rule:** `(?i)\b(?:plays?|played|playing) an? (?:crucial|pivotal|vital|key|significant|critical|instrumental) role\b|\b(?:is|are|was|stands as|serves as) a (?:testament|reminder) to\b|\bunderscor(?:es|ing) the (?:importance|significance|need)\b|\b(?:ever[- ]evolving|evolving|rapidly changing|dynamic) landscape\b|\bin today['’]?s (?:fast[- ]paced|digital|ever[- ]changing|competitive|modern|rapidly evolving) (?:world|landscape|environment|era|age|market)\b|\bindelible mark\b|\bdeeply rooted\b|\bsetting the stage for\b|\bmarks? a (?:significant |pivotal |major )?(?:shift|turning point|milestone)\b`
- **Heuristic:** Any match = flag. 2+ = high. False positives: speeches, award citations, eulogies where significance language is the genre.
- **Why it matters:** Wikipedia 'Undue emphasis on significance, legacy, and broader trends' words-to-watch list [PRAC]. Reinhart et al. [PR] show instruction-tuned models favor dense, abstract noun phrases. Orwell's rule 1 (stale figures of speech) [primary].
- **False-positive risk:** Formal tributes and press releases.
- **Fix:** Delete the sentence, or replace it with the specific consequence.

Before:
> In today's fast-paced world, data plays a crucial role in student success.

After:
> Advisors who saw the dashboard flagged 40 at-risk students two weeks earlier than last year.

### `lex-04` Template 'hope' opener (severity: low)

- **What it is:** 'I hope this email finds you well', 'I hope you're doing well', 'Hope all is well' as the first line.
- **Detection rule:** `(?im)^[^\n]{0,40}\b(?:i\s+)?hope (?:this|the|my) (?:e-?mail|message|note) (?:finds|reaches) you\b|^[^\n]{0,40}\bi hope you(?:['’]re| are) (?:doing )?(?:well|great|good)\b|\bhope all is well\b`
- **Heuristic:** Note only when alone. Count toward the template score when 2+ other tells are present. False positives: very common human cliche.
- **Why it matters:** ZeroBounce [VEND]: 'Hope this email finds you well' in 0.10% of 1M+ real 2024-2025 emails; 'hope' trio 0.29%. Grammarly wrote about alternatives in 2017. It is a human template that AI reproduces (Reddit users complained in 2023 that ChatGPT inserts it [ANEC]).
- **False-positive risk:** High. Many people write this by habit.
- **Fix:** Open with the point or a real reference to the person.

Before:
> Hi Dana,
> I hope this email finds you well. I wanted to reach out regarding the invoice.

After:
> Hi Dana,
> Invoice 2207 went out Monday; it's the one with the corrected seat count.

### `lex-05` Assistant-voice phrases (severity: med)

- **What it is:** Chatbot service phrases: 'Certainly!', 'Absolutely!', 'Great question', 'I'd be happy to help', 'I hope this helps', 'Happy to help', 'Let me know if you have any other questions', 'Feel free to reach out'.
- **Detection rule:** `(?i)\b(?:certainly|absolutely|of course)!|\bgreat question\b|\bi(?:['’]d| would) be (?:happy|glad|delighted) to (?:help|assist)\b|\bi hope this helps\b|\bhappy to help\b|\blet me know if you (?:have any (?:other|further|more|additional) questions|need anything else|(?:would|['’]d) like me to)\b|\bfeel free to (?:reach out|let me know|ask)\b`
- **Heuristic:** 1 = note; 2+ = flag; in a reply to a peer or client = med. False positives: support-desk staff and polite humans use these.
- **Why it matters:** Wikipedia section 'Communication intended for the user / Collaborative communication' [PRAC]. OpenAI's GPT-5.1 guide recommends prompting against 'excessive acknowledgment phrases' [OFF], which implies the default leans that way [INF].
- **False-positive risk:** Moderate. 'Feel free to reach out' is ordinary in business email.
- **Fix:** Cut the phrase. End on the ask or the next step.

Before:
> Certainly! I've attached the deck. I hope this helps, and let me know if you have any other questions!

After:
> Deck attached. Slide 6 has the pricing you asked about.

### `lex-06` Leaked chatbot artifacts (severity: high)

- **What it is:** Text that only a chatbot produces: 'As an AI language model', knowledge-cutoff disclaimers, citation markup (oaicite, contentReference, turn0search0, attributableIndex, [span_1], DeepSeek dagger brackets), 'Here's a revised version of your email:', 'Subject line options:'.
- **Detection rule:** `(?i)\bas an ai(?: language model)?\b|\bas of my (?:last )?(?:knowledge|training) (?:update|cutoff)\b|oaicite|contentreference|oai_citation|turn\d+search\d+|attributableindex|\[span_\d+\]|【\d+†|\bhere(?:['’]s| is) (?:a|the|your) (?:revised|polished|draft|rewritten|updated|refined|more concise|shorter|more professional|professional) (?:version|draft|email|message|reply|response)\b|\bsubject line options\b|\bi can(?:not|['’]t) browse\b`
- **Heuristic:** Any match = high; block sending.
- **Why it matters:** Wikipedia 'Internal formatting and reference markup bugs' calls these 'an unambiguous indicator' [PRAC].
- **False-positive risk:** Very low (unless you are quoting or discussing AI).
- **Fix:** Delete the artifact and reread the whole message; leaked markup usually means nothing was reviewed.

Before:
> Here's a revised version of your email:
>
> Hi Tom, the contract renews on March 1 :contentReference[oaicite:0]{index=0}.

After:
> Hi Tom, the contract renews March 1.

### `lex-07` Signposting and stacked transitions (severity: low)

- **What it is:** 'It's important to note', 'It's worth noting/mentioning', and sentence-initial 'Additionally,', 'Furthermore,', 'Moreover,', 'Notably,', 'Importantly,'.
- **Detection rule:** `(?im)\bit(?:['’]s| is) (?:important|worth|crucial|essential) (?:to note|noting|mentioning|to remember|to highlight|to consider|to mention)\b|^\s*(?:additionally|furthermore|moreover|notably|importantly),`
- **Heuristic:** Flag at 2+ in a message under 200 words, or any in an SMS/DM. False positives: legal and academic writing.
- **Why it matters:** Wikipedia lists 'Additionally' (especially sentence-initial) as AI vocabulary [PRAC]. 'It's important to note' is practitioner-reported [PRAC]; no corpus ratio retrieved. Plain-language guidance: cut words that don't add value [OFF].
- **False-positive risk:** Moderate in formal writing.
- **Fix:** Delete the signpost; if the point matters, put it first.

Before:
> It's worth noting that the price changes in January. Additionally, setup takes two weeks.

After:
> The price changes in January, and setup takes two weeks.

### `lex-08` Intensifier padding (severity: low)

- **What it is:** truly, incredibly, genuinely, deeply, absolutely, immensely, tremendously used as emphasis.
- **Detection rule:** `(?i)\b(?:truly|incredibly|genuinely|deeply|absolutely|immensely|tremendously)\b`
- **Heuristic:** Flag at 3+ per 100 words, or 2+ in an SMS. False positives: 'deeply' and 'genuinely' are normal in sincere notes.
- **Why it matters:** Plain-language guidance: cut excess modifiers like absolutely, really, totally, very [OFF]. Reinhart et al. found some models overuse downtoners/intensifier-type features relative to humans [PR, indirect].
- **False-positive risk:** Moderate.
- **Fix:** Delete the intensifier and add a reason instead.

Before:
> I truly appreciate your incredibly thoughtful feedback.

After:
> Thanks for catching the pricing error on page 3.

## 2. Structural tells

### `str-01` Negative parallelism ('It's not X, it's Y') (severity: med)

- **What it is:** Contrast frames: 'It's not just X, it's Y', 'This isn't about X. It's about Y', 'Not only X but also Y', 'X? No. Y.'
- **Detection rule:** `(?i)\b(?:it|this|that)(?:['’]s| is| was)\s+not\s+(?:just\s+|only\s+|merely\s+|simply\s+|about\s+)?[^.!?\n]{1,60}?[,;:—–.-]\s*(?:it|this|that)(?:['’]s| is| was)\b|\bnot (?:just|only|merely) (?:about )?[^.!?\n]{1,60}?\bbut(?: also)?\b|\b(?:isn['’]t|aren['’]t|wasn['’]t) (?:just |only |merely )?(?:about )?[^.!?\n]{1,60}?[,;:—–.-]\s*(?:it['’]s|they['’]re|it was|it is)\b|\?\s*no[.!]\s`
- **Heuristic:** 1 = med; 2+ in a short message = high. Boggia's field heuristic: 3+ frames in a short passage is a strong indicator. False positives: genuine corrections ('It's not Tuesday, it's Wednesday').
- **Why it matters:** Wikipedia 'Negative parallelisms' [PRAC]. Antislop uses 'It's not X, it's Y' as its example regex for suppression [PP]. Boggia 2026 [PP]: models overshoot human rates in oratorical/promotional registers (about 2x), undershoot in informal Q&A.
- **False-positive risk:** Low-moderate; literal corrections are fine.
- **Fix:** State the positive claim directly, with evidence.

Before:
> It's not just a scheduling tool, it's a new way to run your advising office.

After:
> Advisors stopped double-booking. Missed appointments dropped from 11% to 4% in the pilot.

### `str-02` Rule of three / stacked triplets (severity: low)

- **What it is:** Three-item lists of adjectives or abstract nouns ('efficient, scalable, and secure'), especially several per message.
- **Detection rule:** `(?i)\b[\w'-]+(?: [\w'-]+)?, [\w'-]+(?: [\w'-]+)?,? (?:and|or) [\w'-]+\b`
- **Heuristic:** Pattern over-matches real lists. Flag only when 2+ triplets appear per 150 words, or a triplet consists of abstract adjectives/nouns with no concrete referent. False positives: real enumerations (dates, people, deliverables).
- **Why it matters:** Wikipedia 'Rule of three': used to make superficial analysis look comprehensive [PRAC]. Reinhart et al.: phrasal coordination about 1.9x human rate in GPT-4o [PR].
- **False-positive risk:** High. Lists of three real things are normal.
- **Fix:** Keep the one item that matters, or replace the triplet with a specific.

Before:
> Our platform is efficient, scalable, and secure.

After:
> It handled 3,000 registrations in the first hour without slowing down.

### `str-03` Em-dash density (severity: low)

- **What it is:** Frequent em dashes (U+2014), especially spaced ' — ', or double hyphens used as dashes.
- **Detection rule:** `—|\s--\s`
- **Heuristic:** Count per 100 words. Flag if more than 1 per 100 words, or 2+ in a message under 150 words, or any in an SMS. Human published-essay baseline about 0.3 per 100 words. False positives: professional writers and editors use em dashes legitimately.
- **Why it matters:** Czuma 2026 [PP]: medRxiv Discussions with an em dash rose 4.23% to 11.58% (20.3% in 2025). 'Last Fingerprint' 2026 [PP]: GPT-4.1 10.6, Claude Opus 4.6 9.1, Llama 0 per 1,000 words vs human 3.2. Wikipedia: useful only with other signs; ChatGPT now suppresses on request (Altman, Nov 2025 [JOUR]).
- **False-positive risk:** High. Many skilled human writers.
- **Fix:** Use a period, comma, colon, or parentheses. Keep at most one dash where it truly earns its place.

Before:
> The rollout — which we planned carefully — went well — mostly.

After:
> The rollout went mostly well. Two schools needed a second training session.

### `str-04` Uniform sentence length (low burstiness) (severity: low)

- **What it is:** Every sentence about the same length and shape; no short punchy sentence, no long one.
- **Detection rule:** None (heuristic only)
- **Heuristic:** Split sentences; if 5+ sentences and coefficient of variation of word counts < 0.35, flag. Threshold is an unvalidated heuristic: calibrate on Jermaine's sent mail. False positives: formal templates, very short messages.
- **Why it matters:** GPTZero's explanation of burstiness [VEND] (it no longer uses the metric itself). RAID [PR]: model text is more repetitive (Self-BLEU) than human text. Weak on its own.
- **False-positive risk:** Moderate.
- **Fix:** Merge two sentences, cut one to three words, or start one with the point.

Before:
> We reviewed your proposal carefully. We think it has strong potential. We would like to discuss next steps. We are available next week.

After:
> We like it. Can you do a 30-minute call Tuesday or Wednesday to talk budget and start date?

### `str-05` Headers in a short message (severity: high)

- **What it is:** Markdown headers (#, ##) or standalone bold lines used as section titles in an email, DM, or text.
- **Detection rule:** `(?m)^\s{0,3}#{1,6}\s+\S|^\s*\*\*[^*\n]{2,60}\*\*\s*:?\s*$`
- **Heuristic:** High in email/DM/SMS under 300 words. Med in longer emails. Ignore in documents and reports. False positives: newsletters, formal reports.
- **Why it matters:** Wikipedia: title headings, title case, headings only containing headings [PRAC]. 'Last Fingerprint' [PP] links markdown habits to training data and RLHF; Anthropic docs provide prompts to suppress markdown [OFF], confirming the default leans that way [INF].
- **False-positive risk:** Low in short messages.
- **Fix:** Write it as two or three short paragraphs. The first sentence carries the point.

Before:
> ## Project Update
> **Status**
> On track.
> **Next Steps**
> Review on Friday.

After:
> We're on track. Can you review the draft Friday?

### `str-06` Bolded inline-header bullets (severity: high)

- **What it is:** List items that start with a bold label and colon: '- **Timeline:** two weeks'.
- **Detection rule:** `(?m)^\s*(?:[-*•]|\d+[.)])\s+\*\*[^*\n]{1,60}\*\*\s*[:\-–—]?|^\s*\*\*[^*\n]{1,40}:\*\*|^\s*\*\*[^*\n]{1,40}\*\*:\s`
- **Heuristic:** Any match in email/DM/SMS = high; in docs = low. Plain-text variant (markers stripped): 3+ consecutive lines each starting 'Label:' in a short email = med.
- **Why it matters:** Wikipedia 'Inline-header vertical lists' and 'Overuse of boldface' [PRAC], which traces the habit to readmes, slide decks, and listicles.
- **False-positive risk:** Low in conversational messages.
- **Fix:** Turn the list into sentences, or use a plain list without bold labels.

Before:
> - **Timeline:** Two weeks
> - **Budget:** $8k
> - **Owner:** Me

After:
> It'll take two weeks and about $8k. I'll own it.

### `str-07` Symmetric bullets (severity: low)

- **What it is:** 3-5 bullets of near-identical length and grammar (each a gerund phrase, each about 8 words).
- **Detection rule:** None (heuristic only)
- **Heuristic:** If a list has 3+ items and the coefficient of variation of item word counts < 0.25 and items share the same first part of speech, flag. Unvalidated heuristic.
- **Why it matters:** Wikipedia notes mechanical list formatting [PRAC]; Reinhart [PR] shows models flatten genre variation. Practitioner-reported [PRAC].
- **False-positive risk:** Moderate; careful humans write parallel lists on purpose.
- **Fix:** Cut to the items that matter; let them be uneven.

Before:
> - Streamlining onboarding processes
> - Enhancing team collaboration
> - Driving measurable outcomes

After:
> Onboarding now takes one day instead of three. That's the main win.

### `str-08` Summary or restating closer (severity: med)

- **What it is:** A final paragraph starting 'In summary', 'In conclusion', 'Overall', 'Ultimately', 'To sum up', 'The bottom line'.
- **Detection rule:** `(?im)^\s*(?:in summary|in conclusion|to summarize|to sum up|in short|overall|ultimately|all in all|in essence|the bottom line(?: is)?)\b[,:]?`
- **Heuristic:** Med in any message under 300 words (nothing to summarize). Low in long reports.
- **Why it matters:** Wikipedia 'Outline-like conclusions' [PRAC]. Plain-language guidance: omit what the reader doesn't need [OFF].
- **False-positive risk:** Low in short messages; normal in long reports.
- **Fix:** Delete the closer. End on the ask, the date, or the decision.

Before:
> Overall, we believe this approach will drive meaningful results for your team.

After:
> If you approve by the 15th, we start the 22nd.

### `str-09` 'Despite challenges' / future-outlook ending (severity: med)

- **What it is:** 'Despite its success, X faces several challenges...', 'Despite these challenges...', closing 'future outlook' paragraph.
- **Detection rule:** `(?i)\bdespite (?:these|its|their|the|some|such) [^.!?\n]{0,40}?challenges\b|\bfaces? (?:several|many|numerous|significant|a number of) challenges\b|\b(?:looking ahead|future outlook|moving forward),`
- **Heuristic:** Any match = flag in emails and posts. False positives: genuine risk sections in reports.
- **Why it matters:** Wikipedia 'Outline-like conclusions about challenges and future prospects' [PRAC].
- **False-positive risk:** Moderate in formal reports.
- **Fix:** Name the actual risk and what you're doing about it, or cut.

Before:
> Despite these challenges, the future looks bright for the program.

After:
> The one risk is hiring a second advisor by January; we have two finalists.

### `str-10` Trailing participle 'analysis' (severity: med)

- **What it is:** A sentence that ends with ', highlighting/underscoring/ensuring/reflecting/fostering/showcasing/enhancing/paving the way...'.
- **Detection rule:** `(?i),\s+(?:thereby\s+)?(?:highlighting|underscoring|emphasizing|showcasing|ensuring|reflecting|symbolizing|fostering|cultivating|enhancing|reinforcing|paving the way|contributing to|demonstrating|solidifying|marking)\b`
- **Heuristic:** 1 = med; 2+ = high.
- **Why it matters:** Reinhart et al. 2025 [PR]: instruction-tuned models use present participial clauses at 2-5x human rate (GPT-4o 5.3x, d=1.38). Wikipedia 'Superficial analyses' words to watch [PRAC].
- **False-positive risk:** Low-moderate; humans use participles, but rarely as stacked value claims.
- **Fix:** Cut the tail, or make it its own sentence with a fact.

Before:
> We upgraded the servers, ensuring robust performance and enhancing user satisfaction.

After:
> We upgraded the servers. Page loads dropped from 4 seconds to 1.

### `str-11` Copula avoidance ('serves as', 'boasts') (severity: low)

- **What it is:** 'serves as a', 'stands as a', 'functions as the', 'boasts' meaning 'has'.
- **Detection rule:** `(?i)\b(?:serves|stands|functions|acts) as (?:a|an|the)\b|\bboasts?\b(?! about)`
- **Heuristic:** Flag at 2+; or 1 alongside other tells.
- **Why it matters:** Wikipedia 'Avoidance of basic copulatives' [PRAC]; Orwell's 'verbal false limbs' (serve the purpose of) [primary].
- **False-positive risk:** Moderate.
- **Fix:** Use 'is' or 'has'.

Before:
> The new office boasts a training room and serves as a hub for the region.

After:
> The new office has a training room. The regional team works there.

### `str-12` Hook-and-reveal framing (severity: med)

- **What it is:** 'The result?', 'Here's the thing:', 'Here's why:', 'Let that sink in', 'Read that again', 'Plot twist'.
- **Detection rule:** `(?i)\bthe (?:result|answer|catch|kicker|truth|secret|best part|twist|reality|lesson)\?|\bhere(?:['’]s| is) (?:the (?:thing|kicker|catch|truth|deal)|why|what (?:happened|i learned))\s*[:.]|\blet that sink in\b|\bread that again\b|\bplot twist\b`
- **Heuristic:** Med on LinkedIn posts; high in email. False positives: some human LinkedIn writers use this deliberately.
- **Why it matters:** Boggia 2026 lists 'X? No. Y' as an LLM-favored frame [PP]. LinkedIn 'slop' complaints and the new 'seems like AI slop' button (WSJ, Aug 2026 [JOUR]). Pattern itself practitioner-reported [PRAC/ANEC].
- **False-positive risk:** Moderate on LinkedIn.
- **Fix:** State the result in the first sentence.

Before:
> We tried something new. The result? Engagement skyrocketed.

After:
> Moving office hours to 4pm doubled attendance, from 6 to 13 students a week.

### `str-13` Title Case headings (severity: low)

- **What it is:** Lines of 3+ capitalized words used as headings ('Key Benefits For Your Team').
- **Detection rule:** `(?m)^(?:#{1,6}\s+)?(?:[A-Z][a-z]+\s+){2,6}[A-Z][a-z]+:?\s*$`
- **Heuristic:** Count only when the line is followed by body text and there are 2+ such lines. Ignore signatures and names.
- **Why it matters:** Wikipedia 'Title case': chatbots strongly tend to capitalize all main words in headings [PRAC].
- **False-positive risk:** Moderate (signatures, product names).
- **Fix:** Remove the heading; if needed, use sentence case.

Before:
> Key Benefits For Your Team
> You save time.

After:
> You'll save about two hours a week.

### `str-14` Emoji as bullets or headers (severity: med)

- **What it is:** Lines starting with an emoji used as a bullet or section marker (rocket, check mark, light bulb, pointing hand, sparkles).
- **Detection rule:** `(?m)^\s*(?:[✅✨⭐➡✔☑]|[\U0001F300-\U0001FAFF])\s*\S`
- **Heuristic:** Any in email = med; 3+ in a LinkedIn post = med; casual texts exempt.
- **Why it matters:** Wikipedia 'Emoji as formatting' [PRAC] (notes it is rarer in newer models). LinkedIn practitioner complaints [ANEC].
- **False-positive risk:** Moderate on LinkedIn; low in email.
- **Fix:** Remove the emoji bullets; write sentences.

Before:
> 🚀 Faster onboarding
> ✅ Fewer errors
> 💡 Smarter insights

After:
> Onboarding takes one day now, and data-entry errors are down by half.

### `str-15` Horizontal rules between sections (severity: med)

- **What it is:** Lines of '---', '***', or '___' separating parts of an email.
- **Detection rule:** `(?m)^\s*(?:-{3,}|\*{3,}|_{3,})\s*$`
- **Heuristic:** Any in email/DM = med.
- **Why it matters:** Wikipedia 'Thematic breaks between sections' (common in Markdown output) [PRAC].
- **False-positive risk:** Low (some forwarded-message separators: check context).
- **Fix:** Delete; use a paragraph break.

Before:
> Thanks for the call.
> ---
> Next steps below.

After:
> Thanks for the call. Next step: I'll send the contract tomorrow.

### `str-16` Mixed curly and straight quotes (severity: low)

- **What it is:** Both ' and ’ (or " and curly double quotes) used as apostrophes/quotes in the same message.
- **Detection rule:** None (heuristic only)
- **Heuristic:** Flag only if both straight and curly apostrophes occur in the same message (suggests pasted segments). Never flag curly quotes alone: macOS/iOS and Word convert automatically.
- **Why it matters:** Wikipedia 'Curly quotation marks' notes ChatGPT/DeepSeek use curly quotes, Claude/Gemini typically don't, and says curly quotes alone do not prove LLM use [PRAC].
- **False-positive risk:** High for curly quotes alone (Jermaine is on macOS).
- **Fix:** Normalize quotes; more importantly, reread the pasted section for other tells.

Before:
> We’re ready, but the client's team isn't.

After:
> We're ready, but the client's team isn't.

### `str-17` Nominalization density (severity: low)

- **What it is:** Verbs turned into nouns: 'the implementation of', 'the utilization of', 'facilitation of', 'optimization of'.
- **Detection rule:** `(?i)\b\w{4,}(?:tion|ment|ance|ence|ity|ization|isation)\s+of\b`
- **Heuristic:** Flag at more than 2 per 100 words in an email or DM. False positives: legal, academic, and technical writing.
- **Why it matters:** Reinhart et al. 2025 [PR]: nominalizations at 1.5-2.1x human rate; noun-heavy style persists even when asked to be informal. Orwell: noun constructions instead of verbs [primary].
- **False-positive risk:** Moderate in formal genres.
- **Fix:** Turn the noun back into a verb with a subject.

Before:
> The implementation of the new system will enable the optimization of scheduling.

After:
> Once we switch systems, scheduling takes half the time.

## 3. Tone tells

### `tone-01` Sycophantic opener (severity: med)

- **What it is:** 'Great question!', 'What a thoughtful point', 'You're absolutely right', 'Thank you so much for reaching out/sharing your thoughtful...', 'I love this'.
- **Detection rule:** `(?im)(?:^|[.!?]\s+)\s*(?:(?:what a |such a )?(?:great|excellent|fantastic|wonderful|insightful|thoughtful) (?:question|point|idea|observation|post|insight)s?\b|you(?:['’]re| are) (?:absolutely|totally|completely) right\b|thank you (?:so much )?for (?:reaching out|sharing|your (?:thoughtful|insightful|kind|detailed) (?:message|note|email|question))|i love (?:this|that you)\b|love this[.!])`
- **Heuristic:** Any match at the start of a reply = med; combined with tone-02 = high. False positives: sincere thanks for something specific (then it names the specific).
- **Why it matters:** Anthropic 2023 [PR]: five RLHF assistants consistently sycophantic; human raters sometimes prefer it. Hohenstein et al. [PR/PP]: AI replies raise positive emotional language; suspected AI use lowers evaluations.
- **False-positive risk:** Moderate.
- **Fix:** Start with the answer. If thanks are deserved, name exactly what you're thankful for.

Before:
> Great question! Thank you so much for reaching out.

After:
> Yes, the discount applies to renewals too.

### `tone-02` Unearned enthusiasm (severity: med)

- **What it is:** 'thrilled', 'delighted', 'so excited', 'absolutely love', 'truly honored', plus multiple exclamation marks in a business message.
- **Detection rule:** `(?i)\b(?:thrilled|delighted|beyond excited|so excited|super excited|absolutely love|truly (?:honored|grateful|excited)|over the moon)\b`
- **Heuristic:** Flag a match, or 2+ '!' in a business message under 120 words. False positives: genuine good news (hires, wins) where enthusiasm fits.
- **Why it matters:** Smart replies skew more positive than human text (Mieczkowski et al. 2021, as summarized in Diamond 2024 [PP]); Hohenstein et al. [PR/PP] found more positive emotional language with AI replies. Cardon & Coman [PR]: heavy AI in congratulatory notes cut perceived sincerity to 40-52%.
- **False-positive risk:** Moderate.
- **Fix:** Match the energy of the actual news; one specific reason beats three adjectives.

Before:
> I'm absolutely thrilled to share this incredible news!!

After:
> We signed Jefferson County. That's 22 schools starting in January.

### `tone-03` Over-politeness and apology stacking (severity: low)

- **What it is:** 'We sincerely apologize for any inconvenience this may have caused', 'at your earliest convenience', 'Please don't hesitate', 'Thank you for your patience and understanding'.
- **Detection rule:** `(?i)\b(?:sincerely |deeply )?apologi[sz]e for any (?:inconvenience|confusion)\b|\bat your earliest convenience\b|\bthank you (?:in advance )?for your (?:patience|understanding|time and consideration)\b|\bi (?:truly |really |greatly )?appreciate your (?:patience|understanding)\b|\bplease (?:do not|don['’]t) hesitate\b`
- **Heuristic:** Flag at 2+ in a message. False positives: cultural norms (high-context cultures use more politeness), formal customer service.
- **Why it matters:** Practitioner-reported [PRAC]. Cultural confound: Japanese writers use more politeness markers than Americans, and AI drafts shift writers toward the draft's politeness level (2026 preregistered study [PP]).
- **False-positive risk:** Moderate; respect the recipient's culture.
- **Fix:** One clear apology with what you did about it.

Before:
> We sincerely apologize for any inconvenience this may have caused and appreciate your patience and understanding.

After:
> Sorry about that. The double charge is refunded; you'll see it in 3-5 days.

### `tone-04` Generic empathy boilerplate (severity: med)

- **What it is:** 'I completely understand how frustrating this must be', 'That must be so difficult', 'Your concerns are valid'.
- **Detection rule:** `(?i)\bi (?:completely |totally |fully )?understand (?:how|your|that this|the) (?:frustrat\w*|concerns?|difficult\w*|challenging)\b|\bthat (?:must be|sounds) (?:so |really |incredibly )?(?:frustrating|difficult|challenging|tough)\b|\byour (?:feelings|concerns) (?:are|is) (?:completely )?(?:valid|understandable)\b`
- **Heuristic:** Med; high when the message is a complaint response or condolence (see chan-04).
- **Why it matters:** Cardon [PR, via USC interview]: penalty is harsher for emotional-labor messages. Hohenstein [PR/PP]: suspicion of AI lowers evaluations. Pattern practitioner-reported [PRAC].
- **False-positive risk:** Moderate; sincere humans say this too, usually followed by specifics.
- **Fix:** Acknowledge the specific problem and say what you will do.

Before:
> I completely understand how frustrating this must be.

After:
> Losing a morning of class to the login bug is on us. I've moved your section to the fixed server.

### `tone-05` Noncommittal balance (severity: med)

- **What it is:** 'Both approaches have their merits', 'Ultimately, the best choice depends on your specific needs', 'There's no one-size-fits-all', 'On one hand... on the other hand'.
- **Detection rule:** `(?i)\bboth (?:approaches|options|sides|paths) (?:have )?(?:their )?(?:own )?(?:merits|pros and cons|strengths)\b|\bthere(?:['’]s| is) no one[- ]size[- ]fits[- ]all\b|\bultimately,? (?:(?:it|that|this|the (?:best|right) (?:choice|approach|option|decision)) )?(?:all )?(?:depends on|comes down to)\b|\bon (?:the )?one hand\b[^.!?]*\bon the other(?: hand)?\b`
- **Heuristic:** Flag whenever the recipient asked for a recommendation.
- **Why it matters:** Wikipedia notes superficial, balanced-seeming analyses [PRAC]. Practitioner-reported [PRAC]. Inference: a client asking you for advice is paying for a decision [INF].
- **False-positive risk:** Low when advice was requested.
- **Fix:** Make the call and give the reason.

Before:
> Both options have their merits, and ultimately the best choice depends on your specific needs.

After:
> Go with the annual plan. You'll use it past month 8, which is where it gets cheaper.

### `tone-06` Hedge stacking (severity: low)

- **What it is:** 'may potentially', 'could possibly', 'it seems that', 'to some extent', 'generally speaking', 'arguably'.
- **Detection rule:** `(?i)\b(?:may|might|could) (?:potentially|possibly|perhaps)\b|\b(?:potentially|possibly) (?:could|may|might)\b|\bit (?:seems|appears) (?:that|as though|likely)\b|\bto (?:some|a certain) (?:extent|degree)\b|\bgenerally speaking\b|\barguably\b`
- **Heuristic:** Flag at 2+ per message, or any double hedge ('may potentially').
- **Why it matters:** Reinhart et al. include hedges among Biber features that differ between LLM and human text [PR, indirect]. Plain-language guidance [OFF]. Mostly practitioner-reported [PRAC].
- **False-positive risk:** Moderate; real uncertainty deserves one hedge.
- **Fix:** Use one hedge and say what it depends on.

Before:
> This may potentially help to some extent.

After:
> This should cut wait times, if the second advisor starts on time.

## 4. Content specificity tells

### `spec-01` Empty personalization (severity: high)

- **What it is:** Compliments or references with no detail: 'I came across your profile and was impressed by your journey', 'Your work really resonated with me'.
- **Detection rule:** `(?i)\b(?:i )?(?:came across|stumbled upon|noticed) your (?:profile|work|post|company|background|journey)\b|\b(?:was|am|really|truly) impressed (?:by|with) your\b|\byour (?:impressive|inspiring|remarkable|incredible) (?:background|journey|work|experience|achievements?)\b|\b(?:really |truly )?resonated with me\b|\bcaught my (?:eye|attention)\b`
- **Heuristic:** Flag when the same sentence has no specific (digit, quoted phrase, or proper noun other than the recipient's name/company). High in DMs and cold email.
- **Why it matters:** Galdin & Silbert [PP]: customization used to predict hiring; with one-click AI it no longer did, so readers discount generic personalization. Wikipedia: AI 'smooths specific facts into generic statements' [PRAC]. LinkedIn practitioners cite 'vague praise' and 'related but not relevant' personalization [ANEC].
- **False-positive risk:** Low when no specific follows.
- **Fix:** Reference one concrete thing they did or said, and tie it to your ask.

Before:
> I came across your profile and was truly impressed by your journey.

After:
> Your post on Tuesday about cutting advising wait times from 3 weeks to 4 days is the problem we work on.

### `spec-02` No concrete details (severity: high)

- **What it is:** A message of 80+ words with no numbers, dates, names, places, or quoted specifics.
- **Detection rule:** None (heuristic only)
- **Heuristic:** Count digits, dates, capitalized named entities (excluding greeting/signature), and quotes. If 80+ words and zero specifics, flag high; 1 specific in 150+ words, flag med.
- **Why it matters:** Wikipedia: 'regression to the mean... generic statements that could equally apply to many topics' [PRAC]. Russell et al. [PR]: experts cite low originality and vagueness. Galdin & Silbert [PP]: specificity was the signal of effort.
- **False-positive risk:** Low for messages that should contain facts.
- **Fix:** Add the one fact only you know: a number, a date, a name, what someone said.

Before:
> We've made great progress and are excited about the next phase of our partnership.

After:
> We finished the Spalding pilot: 212 students, 9 advisors, and two bugs left. Phase 2 starts October 14.

### `spec-03` Placeholder or merge-field residue (severity: high)

- **What it is:** '[Your Name]', '[Company]', '{first_name}', '<Name>', 'XYZ Corp', '[CHECK: ...]', '[insert date]'.
- **Detection rule:** `(?i)\[(?:your |recipient(?:['’]s)? |client(?:['’]s)? |company |first |last )?(?:name|company|title|date|role|position|link)\]|\[insert[^\]]*\]|\[check:[^\]]*\]|\{\{?\s*(?:first_?name|name|company|company_?name)\s*\}?\}|<(?:name|company|first ?name)>|\bxyz (?:company|corp)\b`
- **Heuristic:** Any match = high; block sending.
- **Why it matters:** Wikipedia 'Phrasal templates and placeholder text' [PRAC]. Template residue is the clearest sign nobody reviewed the message [INF].
- **False-positive risk:** Very low.
- **Fix:** Fill it in or delete it; reread the whole message.

Before:
> Best regards,
> [Your Name]

After:
> Jermaine

### `spec-04` Padding sections (severity: med)

- **What it is:** Unrequested sections such as 'Key takeaways', 'Next steps', 'Additional considerations', 'Why this matters', 'Final thoughts', 'TL;DR' in a short message.
- **Detection rule:** `(?im)^\s*(?:#+\s*|\*\*)?(?:key takeaways?|next steps|additional considerations|why (?:this|it) matters|the bottom line|final thoughts|tl;?dr)\s*(?:\*\*)?\s*:?\s*$`
- **Heuristic:** Med in messages under 300 words; ignore in documents.
- **Why it matters:** Wikipedia boldface section notes the 'key takeaways' habit [PRAC]; OpenAI/Anthropic docs both note default verbosity and give prompts to constrain it [OFF].
- **False-positive risk:** Low in short messages.
- **Fix:** Delete the section, or fold its one useful line into the body.

Before:
> Key Takeaways:
> - We're on track
> - Budget is fine

After:
> We're on track and on budget.

### `spec-05` Unverified facts, stats, links, quotes (severity: high)

- **What it is:** Percentages, statistics, URLs, 'according to', 'a recent study found'.
- **Detection rule:** `(?i)\b\d+(?:\.\d+)?\s?%|\bhttps?://\S+|\baccording to\b|\b(?:a|one) (?:recent )?(?:study|survey|report) (?:by|from|found|shows)\b`
- **Heuristic:** Not a tell by itself: a verification trigger. Every match must be checked against a source before sending; any unverifiable item = high.
- **Why it matters:** Wikipedia notes hallucinated citations, broken links, invalid DOIs as strong signs [PRAC]. A fabricated number damages trust more than any style tell [INF].
- **False-positive risk:** N/A (verification step).
- **Fix:** Check it, link the source, or remove it.

Before:
> According to a recent study, 73% of students prefer AI advisors.

After:
> In our spring survey of 118 students, 41 said they'd rather book through the app than email.

### `spec-06` Restating the request (severity: low)

- **What it is:** Opening by echoing the question: 'Thank you for your question about X', 'Regarding your inquiry about', 'You asked whether'.
- **Detection rule:** `(?im)^\s*(?:thank you for (?:your|the) (?:question|email|message|inquiry) (?:about|regarding)|regarding your (?:question|request|inquiry) (?:about|on|regarding)|you (?:asked|mentioned|inquired) (?:about|whether|if)|to answer your question)\b`
- **Heuristic:** Low alone; med with tone-01.
- **Why it matters:** Practitioner-reported [PRAC]. Plain-language guidance: lead with what the reader needs [OFF].
- **False-positive risk:** Moderate; useful in long threads to anchor context.
- **Fix:** Answer first.

Before:
> Thank you for your question about the deadline. Regarding the deadline, it is Friday.

After:
> Friday at 5.

### `spec-07` No clear ask or next step (severity: med)

- **What it is:** A request or follow-up email that never says what you want, from whom, by when.
- **Detection rule:** None (heuristic only)
- **Heuristic:** If the message is a request/follow-up and the last 2 sentences contain no question mark, date/time, or imperative verb directed at the reader, flag.
- **Why it matters:** Inference from plain-language guidance (write for the reader's task) [OFF] and the template feel of AI closers [PRAC].
- **False-positive risk:** Low.
- **Fix:** End with one specific ask and a date.

Before:
> Looking forward to continuing our conversation and exploring next steps together.

After:
> Can you send the signed SOW by Thursday so we can start Monday?

### `spec-08` Vague attribution (severity: med)

- **What it is:** 'Experts say', 'Studies show', 'Many believe', 'It is widely recognized' with no named source.
- **Detection rule:** `(?i)\b(?:experts|studies|research|reports|industry (?:leaders|experts|reports)|many (?:people|experts)|observers|critics) (?:say|suggest|show|agree|believe|note|have noted|indicate)\b|\bit is (?:widely|generally|often) (?:believed|recognized|acknowledged|accepted)\b|\bstudies have shown\b|\bmany believe\b`
- **Heuristic:** Flag when no named source or link appears in the same or next sentence.
- **Why it matters:** Wikipedia 'Vague attributions and overgeneralization of opinions' [PRAC]; newer chatbots may attach claims to named sources that don't support them [PRAC].
- **False-positive risk:** Low.
- **Fix:** Name the source, or say it's your view.

Before:
> Studies show that remote teams are more productive.

After:
> Our own support team closed 12% more tickets per person in the six months after going remote (our ticket data, 2024).

## 5a. Channel: email

### `chan-01` Pasted subject line in body (severity: high)

- **What it is:** A 'Subject:' line at the top of the body (copied from a chatbot draft).
- **Detection rule:** `(?im)^\s*\**subject(?: line)?\**\s*:\s*\S`
- **Heuristic:** Any match in an email body = high.
- **Why it matters:** Chatbot drafts commonly include a subject line; leaving it in shows the draft was pasted unreviewed [INF; related to Wikipedia 'Communication intended for the user' PRAC].
- **False-positive risk:** Very low (except when forwarding).
- **Fix:** Move it to the subject field and delete it from the body.

Before:
> Subject: Follow-Up on Our Discussion
>
> Hi Ken,

After:
> Hi Ken,

### `chan-02` Canned sign-off stack (severity: low)

- **What it is:** 'Looking forward to hearing from you' plus 'Best regards' plus 'Please don't hesitate...' at the end.
- **Detection rule:** `(?im)\blooking forward to (?:hearing from you|your (?:response|reply|thoughts|feedback))\b|^\s*(?:warm(?:est)? regards|best regards|kind regards|with gratitude)\b`
- **Heuristic:** Low alone; flag when 2+ closing formulas stack or when the closer doesn't match your usual sign-off.
- **Why it matters:** Human email convention that AI reproduces [INF]; ZeroBounce shows such formulas are common in human email [VEND].
- **False-positive risk:** High alone.
- **Fix:** Use your real sign-off; end on the ask.

Before:
> Looking forward to hearing from you!
>
> Warm regards,

After:
> Talk Thursday.
> Jermaine

### `chan-03` Reply length mismatch (severity: med)

- **What it is:** A reply far longer and more structured than the message it answers.
- **Detection rule:** None (heuristic only)
- **Heuristic:** If reply word count > 2.5x the incoming message and > 150 words, flag med; if it also has headers/bullets, high.
- **Why it matters:** Cardon & Coman [PR]: heavy AI assistance lowers perceived sincerity and professionalism. OpenAI and Anthropic docs both note default verbosity [OFF]. Threshold is an unvalidated heuristic [INF].
- **False-positive risk:** Low.
- **Fix:** Answer at the length of the question.

Before:
> (3-line question answered with 300 words and four headers)

After:
> (3-4 sentence answer)

### `chan-04` Relational message escalation (severity: high)

- **What it is:** Congratulations, thanks, condolences, apologies, performance feedback, recommendation letters, praise.
- **Detection rule:** `(?i)\b(?:congratulations|congrats|condolences|sorry for your loss|thank you for everything|i apologi[sz]e|performance review|letter of recommendation|recommendation letter)\b`
- **Heuristic:** If matched (or intent classifier says relational), raise every other tell's severity one level and recommend a human rewrite with AI limited to typo checks.
- **Why it matters:** Cardon & Coman 2025 [PR]: for a congratulatory message, sincerity 83% (low AI) vs 40-52% (high AI). Cardon: penalty is harsher for emotional-labor messages (sympathy, performance reviews, persuasion). Schilke & Reimann [PR]: being exposed is the worst case.
- **False-positive risk:** N/A (routing rule).
- **Fix:** Write it yourself, short and specific.

Before:
> Congratulations on this incredible milestone! Your dedication and hard work truly shine through.

After:
> Congrats on the promotion, Ana. The way you rebuilt the intake process last spring is why this happened.

## 5b. Channel: LinkedIn (DMs and posts)

### `chan-05` Cold-DM template phrases (severity: med)

- **What it is:** 'As a fellow...', 'I'd love to connect/pick your brain', 'quick 15-minute call', 'Would you be open to', 'explore potential synergies', 'I noticed you're...'.
- **Detection rule:** `(?i)\bas a fellow\b|\bi(?:['’]d| would) love to (?:connect|pick your brain|learn more about|explore)\b|\b(?:quick|brief|short) (?:\d+|five|ten|fifteen|twenty|thirty)[- ]?(?:min(?:ute)?s?)? (?:call|chat|meeting|conversation)\b|\bwould you be open to\b|\bexplore (?:potential |possible )?(?:synergies|collaboration|opportunities|ways we)\b|\bi noticed (?:that )?you(?:['’]re| are)\b`
- **Heuristic:** 1 = low; 2+ = med; 2+ with spec-01 = high. False positives: these are also classic human sales-template phrases.
- **Why it matters:** Practitioner and recipient complaints about templated outreach [PRAC/ANEC]; no peer-reviewed DM study found. Galdin & Silbert [PP] by analogy: cheap personalization stops signaling effort.
- **False-positive risk:** Moderate.
- **Fix:** Lead with the specific reason you're writing to this person; make the ask small and concrete.

Before:
> As a fellow EdTech leader, I'd love to connect and explore potential synergies. Would you be open to a quick 15-minute call?

After:
> Your registrar team is using the same transcript workflow we automated at two Kentucky schools. Want the 2-page summary of what changed?

### `chan-06` LinkedIn post 'broetry' format (severity: med)

- **What it is:** One-line hook, one-sentence paragraphs, emoji bullets, 'Agree?'/'Thoughts?' ending, hashtag block.
- **Detection rule:** `(?im)^\s*(?:agree\?|thoughts\?|what do you think\?|(?:drop|share) your thoughts|repost if|♻️?)|(?:#\w+\s*){3,}$`
- **Heuristic:** Med if pattern matches AND 60%+ of paragraphs are one sentence. False positives: many human LinkedIn writers use this format.
- **Why it matters:** LinkedIn's 'seems like AI slop' button (WSJ Aug 2026 [JOUR]). Originality.ai's detector labels 81.2% of sampled long posts 'Likely AI' [VEND, conflicted]. Format complaints are practitioner-reported [PRAC/ANEC].
- **False-positive risk:** High on LinkedIn.
- **Fix:** Open with a concrete event or number; write normal paragraphs; skip the engagement bait.

Before:
> AI is changing everything.
>
> Here's what I learned.
>
> Agree? 👇
> #AI #EdTech #Leadership

After:
> I let half my class use AI on one paper. Their drafts were cleaner and more alike. Here's what I'm changing.

## 5c. Channel: texts / SMS

### `chan-07` Email register in a text (severity: med)

- **What it is:** Formal greeting and sign-off, full formal sentences, 'regarding', 'I wanted to follow up', bullets, semicolons, or em dashes in an SMS/iMessage.
- **Detection rule:** `^\s*(?:[Hh]i|[Hh]ello|[Dd]ear) [A-Z][a-z]+,|\b(?:[Rr]egarding|[Ff]urthermore|[Aa]dditionally|I wanted to (?:follow up|reach out|confirm))\b|\n\s*(?:Best|Regards|Thanks|Sincerely),?\s*\n\s*[A-Z][a-z]+\s*$`
- **Heuristic:** Apply only to SMS channel. Also flag > 60 words, any bullet list, any em dash, or 2+ semicolons.
- **Why it matters:** Evidence is thin: one small preprint found no perception change when texts were labeled AI-assisted (n=26 [PP]). Hohenstein [PR/PP]: suspicion of AI lowers evaluations. Register mismatch is an inference [INF].
- **False-positive risk:** Moderate (some people text formally).
- **Fix:** Write like you text: short, lowercase is fine, no sign-off.

Before:
> Hi Jordan, I wanted to follow up regarding tomorrow's meeting. Please let me know if 2:00 PM still works.
> Best,
> Jermaine

After:
> still good for 2 tomorrow?

### `chan-08` Smart-reply positivity (severity: low)

- **What it is:** Generic upbeat replies: 'Sounds great!', 'That sounds wonderful!', 'Love that!'.
- **Detection rule:** `(?i)^\s*(?:sounds (?:great|wonderful|amazing|perfect)|that sounds (?:wonderful|amazing|great|perfect)|love (?:that|this))!+`
- **Heuristic:** Low; flag only if the whole reply is this phrase and the incoming message asked a real question.
- **Why it matters:** Mieczkowski et al. 2021 (as summarized in Diamond 2024 [PP]): AI smart replies skew more positive than human text. Hohenstein [PR/PP].
- **False-positive risk:** High; humans text this constantly.
- **Fix:** Answer the actual question.

Before:
> Sounds great!

After:
> yes to thursday, no to the 7am slot

## 5d. Channel: cover letters and application or recommendation letters

### `chan-09` Cover-letter cliches (severity: high)

- **What it is:** 'I am writing to express my keen interest', 'perfect fit', 'passionate about', 'proven track record', 'unique blend of skills', 'make a meaningful impact', 'results-driven', 'hit the ground running', 'thrive in a fast-paced environment'.
- **Detection rule:** `(?i)\bi am writing to (?:express|apply)\b|\b(?:keen|strong|great) interest in\b|\bperfect (?:fit|match)\b|\bpassionate about\b|\bproven track record\b|\bunique (?:blend|combination|mix) of\b|\bmake a (?:meaningful|lasting|significant|real) (?:impact|difference)\b|\bresults[- ]driven\b|\bdynamic (?:team|environment)\b|\bhit the ground running\b|\bthrive in (?:a )?fast[- ]paced\b`
- **Heuristic:** 2+ = med; 3+ = high. Also applies to recommendation letters Jermaine writes or reviews.
- **Why it matters:** Galdin & Silbert [PP]: AI-written proposals lost signal value. TopResume survey via US Chamber [VEND]: about 20% of 600 hiring managers would reject AI-generated resumes/cover letters; 52% accept AI for proofreading/support.
- **False-positive risk:** Moderate; these were human cliches first.
- **Fix:** Replace each cliche with one verifiable accomplishment tied to this employer.

Before:
> I am writing to express my keen interest in the role. With a proven track record and a unique blend of skills, I am a perfect fit.

After:
> At my last company I built the claims-data pipeline our insurance customers used for pricing; your job post says that's the gap on your team.

### `chan-10` No employer-specific content (severity: high)

- **What it is:** The company name appears only in the first or last line; nothing about their product, people, or recent events.
- **Detection rule:** None (heuristic only)
- **Heuristic:** If the employer's name or products appear only in the first/last paragraph and no paragraph contains an employer-specific noun, flag high.
- **Why it matters:** Galdin & Silbert [PP]: customization to the job post was the signal employers paid for before LLMs. Russell et al. [PR]: originality is an expert detection cue.
- **False-positive risk:** Low.
- **Fix:** Add one paragraph that could only be sent to this employer.

Before:
> I admire [Company]'s commitment to innovation and excellence.

After:
> Your switch to usage-based pricing in March is the same move my last team made; here's what we learned about churn.

## Full-message example (run through the checklist)

Before (client email drafted by AI):

> Subject: Re: Project Timeline
>
> Hi Sarah,
>
> I hope this email finds you well! Thank you so much for reaching out regarding the timeline. I completely understand your concerns.
>
> **Current Status:** We've made significant progress on the integration, ensuring robust performance across all environments.
> **Next Steps:** Our team will continue to leverage best practices to finalize the remaining components.
>
> It's not just about meeting deadlines, it's about delivering lasting value. Please don't hesitate to reach out!
>
> Best regards,
> [Your Name]

Findings:
- Block sending: `spec-03` ([Your Name]).
- High: `chan-01` (pasted subject line), `str-06` (bolded inline labels).
- Med: `tone-01` ("Thank you so much for reaching out"), `tone-04` (empathy boilerplate), `str-10` (", ensuring robust..."), `str-01` ("It's not just..., it's...").
- Low: `lex-04` (hope opener), `lex-02` (robust, leverage), `tone-03` ("Please don't hesitate"), `chan-02`.
- Score far above 6, so rewrite.

After:

> Hi Sarah,
>
> Short answer: we'll have the integration in your staging environment by Thursday the 9th, two days later than planned. The delay is the SSO piece. Your IT team's certificate came through Monday, and we need two days to test it.
>
> Everything else is done. If Thursday doesn't work for your board demo, tell me today and I'll put a second engineer on it.
>
> Jermaine

(The specifics in the "after" examples throughout this file are invented to show the kind of detail that helps. Real messages must use true details.)
