# How people spot AI writing, and how to write with AI so it still sounds like you

Prepared for: Jermaine Watkins (OwlThat; UofL)
Date: 2026-10-01 (Task #204)
Companion files:
- Checklist for a checker agent: `docs/research/ai-writing-tells-checklist.md`
- Machine-readable tells: `docs/research/ai-writing-tells.json`
- Claim ledger (source, date, conditions, confidence, disproving test): `docs/research/ai-writing/RESEARCH.md`
- Raw search results and provenance log: `docs/research/ai-writing/research/`

## Evidence labels used in this report

- **[PR]** peer-reviewed journal or conference paper
- **[PP]** preprint or working paper (not yet peer-reviewed)
- **[OFF]** official documentation (vendor docs, government guidance)
- **[VEND]** research published by a company that sells detection or related tools (commercial interest)
- **[JOUR]** journalism
- **[PRAC]** practitioner or community guide (e.g., Wikipedia project pages, NN/g, blogs)
- **[ANEC]** anecdote or social posts
- **[INF]** my inference, not directly stated by a source

All sources were retrieved on 2026-10-01. Several 2026 items are recent preprints; treat them as provisional.

---

## Executive summary

1. **Untrained readers detect AI text at about coin-flip accuracy.** Cornell/Stanford experiments (N=4,600) found 50-52% accuracy, and readers leaned on misleading cues: first-person pronouns, contractions, and family topics read as "human" [PR]. AI poems were judged *more* human than real poets' poems (46.6% accuracy) [PR].
2. **Heavy AI users are the exception.** People who often use LLMs for writing caught AI-written articles almost perfectly (majority vote missed 1 of 300), using "AI vocabulary" plus formality, originality, and clarity [PR]. Your most AI-literate contacts (founders, students, recruiters) are the ones most likely to notice.
3. **Suspicion costs more than detection.** Recipients who suspect AI rate the sender worse [PR]. When managers were known to use heavy AI help, only 40-52% of employees saw them as sincere, vs 83% for light help [PR]. Disclosing AI use lowers trust, and getting found out by someone else lowers it most [PR]. But when AI use isn't mentioned, recipients mostly don't wonder [PP].
4. **The penalty depends on the message type.** Routine, informational messages carry little penalty. Congratulations, condolences, feedback, apologies, and persuasion carry the biggest one [PR]. Write relational messages yourself.
5. **The best lexical evidence is corpus data, and the word list keeps changing.** In PubMed, "delves" rose 28x, "underscores" 14x, and "showcasing" 11x after ChatGPT, and at least 13.5% of 2024 abstracts went through an LLM [PR]. GPT-4o used "tapestry" in 23% of outputs [PR]. "Delve" fell off sharply in 2025 [PRAC]. Any fixed list ages fast.
6. **Structural tells last longer than word tells.** Instruction-tuned models use present-participle clauses at 2-5x the human rate (", highlighting...", ", ensuring...") and nominalizations at 1.5-2x [PR]. Other common tells: "not X, but Y" framing, triplets, markdown headers and bolded lead-ins in short messages, and summary closers [PRAC, PP]. One popular belief is wrong: GPT-4o uses the agentless passive *less* than people do [PR].
7. **Em dashes are a weak signal now.** They rose across the literature after ChatGPT [PP]. Measured rates vary by model (GPT-4.1 about 10.6 and Claude Opus 4.6 about 9.1 per 1,000 words, vs 3.2 for published human essays) [PP]. ChatGPT has followed "no em dash" instructions since Nov 2025 [JOUR]. Plenty of good writers use them. Flag only high density.
8. **Don't use AI detectors as judges.** OpenAI pulled its own classifier (26% caught, 9% false positives) [OFF]. Detectors that look strong can fail on a new model or decoding setting [PR]. Paraphrasing defeats most of them, watermarks included [PR]. False positives against non-native writers were severe in 2023 [PR], are smaller with 2025-era tools [PP], and still vary from 0% to 100% across detectors [PP]. One commercial tool (Pangram) did very well in an NBER audit [PP], but that doesn't make a score proof.
9. **To sound like yourself, write the substance and let AI polish it.** Few-shot voice samples work fairly well for email but drift toward an average voice in informal writing [PP]. AI drafts pull writers toward the draft's style, by 10-16x more when the draft clashes with the writer's norms [PP]. Practical rule: you supply the facts, the ask, and one detail only you would know. The model handles grammar and trimming. A tells checker runs last.
10. **Disclosure depends on context, and the law reaches less than people assume.** The EU AI Act's text-labeling duty covers published, public-interest text with no human editorial review, not private business email [OFF]. For one-to-one messages, use NN/g's PACED factors (Policy, Audience, Context, Expectations, Degree) [PRAC]. Disclose when you're asked, when a policy or platform requires it, and when the recipient would reasonably assume you wrote it personally and it matters to them.

---

## Part A. How people tell writing is AI-generated

### A1. Human perception research

**Accuracy is near chance for typical readers.**
- Jakesch, Hancock & Naaman, *Human heuristics for AI-generated language are flawed*, PNAS 2023 (Cornell, Stanford) [PR]. Across six experiments (N=4,600) with professional, hospitality (Airbnb), and dating self-descriptions, accuracy was 50-52%. Readers agreed with each other more than chance (Fleiss kappa 0.067), so they shared heuristics, but the heuristics didn't work: first-person pronouns, contractions, and family topics read as "human". The authors then generated text that exploited these cues and got AI text rated "more human than human". https://arxiv.org/abs/2206.07271
  - Version caveat: the experiments used GPT-2/GPT-3-era models. The point about flawed heuristics still holds; the exact accuracy numbers are dated.
- Porter & Machery, Scientific Reports 2024 [PR]. Non-experts identified AI poems at 46.6% (16,340 judgments) and rated AI poems higher on rhythm and beauty. Being told a poem was AI lowered quality ratings (d ≈ -0.5). https://www.nature.com/articles/s41598-024-76900-1
- Jones & Bergen 2025 [PP]. In a three-party Turing test, GPT-4.5 with a humanlike persona prompt was picked as the human 73% of the time, more often than the real humans. https://arxiv.org/abs/2503.23674

**Some people are very good at it: heavy users of AI writing tools.**
- Russell, Karpinska & Iyyer, ACL 2025 [PR]. Annotators who frequently use LLMs for writing labeled 300 non-fiction articles. A majority vote of five such "experts" got 299 of 300 right, beating most commercial and open-source detectors even after paraphrasing and "humanizer" tools. Their written explanations cited AI vocabulary first, then formality, originality, and clarity. https://arxiv.org/abs/2501.15654
  - Conditions: long articles, not two-line emails. Shorter text gives readers less to go on [INF].
- Dugan et al. (Penn), *Real or Fake Text?*, AAAI 2023 [PR]. Annotators had trouble finding where human text turned into machine text, skill varied a lot between people, and annotators improved over time with incentives. https://arxiv.org/abs/2212.12672

**What makes a message lose trust.**
- Hohenstein et al. (Cornell), smart replies, two experiments, n=1,036 [PR/PP]. Using AI replies made conversations more efficient and more positive. But people *suspected* of using AI replies were rated more negatively. https://arxiv.org/abs/2102.05756
- Cardon (USC) & Coman (Florida), *Professionalism and Trustworthiness in AI-Assisted Workplace Writing*, Int. J. of Business Communication 2025, about 1,100 professionals [PR]. Participants were told how much AI the manager used on a congratulatory message.
  - Sincerity: 83% (low AI) vs 40-52% (high AI).
  - Professionalism: 95% vs 69-73%.
  - Light editing carried "almost no penalty". Respondents judged their own AI use leniently and their bosses' harshly.
  - Cardon's broader work finds the penalty is larger for emotionally loaded messages (performance reviews, sympathy, persuasion) than for informational ones.
  - Sources: https://news.ufl.edu/2025/08/writing-ai-work/ ; https://www.marshall.usc.edu/news/ai-assisted-emails-may-put-trustworthiness-at-risk-in-workplace-communications ; https://journals.sagepub.com/doi/10.1177/23294884251350599
- Schilke & Reimann, *The transparency dilemma*, OBHDP 2025, 13 experiments, >5,000 participants [PR]. Disclosing AI use lowered trust, including among tech-savvy evaluators. Being exposed by a third party lowered trust the most. https://news.arizona.edu/employee-news/being-honest-about-using-ai-work-makes-people-trust-you-less-research-finds
- *Blissful (A)Ignorance*, N=647 [PP]. Disclosed AI authorship sharply lowered impressions of the sender (d=1.69). With no information, impressions were the same as for human-written messages, even though 46% of participants had themselves used AI for messages in the previous two weeks. https://arxiv.org/pdf/2501.15678
- Galdin & Silbert, *Making Talk Cheap* (Dartmouth/Princeton), working paper [PP]. On Freelancer.com, customized proposals used to predict hiring and job success. After the platform added a one-click AI writing tool, employers' willingness to pay for a well-written proposal dropped sharply and it stopped predicting job completion. Polished writing no longer signals effort. https://arxiv.org/html/2511.08785v1

**What this means for you [INF].** Most recipients won't consciously ask "is this AI?" The risk comes from three directions:
- Readers who use AI heavily themselves.
- Messages where sincerity is the whole point.
- Text so generic that it trips a reader's "template" sense, whether or not they think "AI".

The tells checklist exists mainly to remove the generic-template feel. Catching AI authorship is a side effect.

**Scale of AI-mediated writing** (useful for context). Liang et al. (Stanford) estimate that by late 2024, about 18% of financial consumer complaint text, up to 24% of corporate press-release text, just under 10% of small-firm job postings, and about 14% of UN press-release text were LLM-assisted [PP]. https://arxiv.org/abs/2502.09747

### A2. Lexical tells

**Corpus evidence (strongest).**
- Kobak et al., *Delving into LLM-assisted writing in biomedical publications through excess vocabulary*, Science Advances 2025 [PR]. The study covered 15M+ PubMed abstracts from 2010-2024.
  - Rarer words with big jumps: "delves" (28.0x expected), "underscores" (13.8x), "showcasing" (10.7x).
  - Common words with big jumps: "potential", "findings", "crucial".
  - Covid's excess words were content nouns. The 2024 excess words were style words: 66% verbs and 14% adjectives.
  - Lower bound: 13.5% of 2024 abstracts LLM-processed, up to 40% in some subcorpora.
  - Source: https://arxiv.org/html/2406.07016v5
- Follow-up preprint (Aug 2026, Kobak corresponding author) [PP]: about 89% of PubMed Central full papers showed excess LLM vocabulary by Dec 2025. https://arxiv.org/pdf/2608.10715
- Reinhart et al., PNAS 2025 [PR]. GPT-4o and 4o-mini use "camaraderie", "palpable", "tapestry", and "intricate" at more than 100x the human rate. "Tapestry" appeared in 23% of GPT-4o outputs and "amidst" in 27%. https://arxiv.org/html/2410.16107v2
- Antislop preprint 2025 [PP]: some phrase patterns appear more than 1,000x more often in LLM output than in human text, mostly in creative writing. https://arxiv.org/pdf/2510.15061v2
- Juzek & Ward, *Why does ChatGPT "delve" so much?* (arXiv 2412.11385) [PP] looks at where this overuse comes from. I found the paper but did not extract its findings.

**Curated lists.** Wikipedia's *Signs of AI writing* field guide [PRAC] is the most thorough public list, and it groups words by model era:
- **2023 to mid-2024 (GPT-4):** Additionally, boasts, bolstered, crucial, delve, emphasizing, enduring, garner, intricate, interplay, key, landscape, meticulous, pivotal, underscore, tapestry, testament, valuable, vibrant.
- **Mid-2024 to mid-2025 (GPT-4o):** align with, bolstered, crucial, emphasizing, enhance, enduring, fostering, highlighting, pivotal, showcasing, underscore, vibrant.
- **Significance padding:** "stands/serves as", "is a testament to", "plays a crucial/pivotal role", "underscores its importance", "reflects broader", "setting the stage for", "evolving landscape", "indelible mark", "deeply rooted".
- The guide says plainly that the list is descriptive, that the words drift over time, and that the signs are not proof. https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing

**The phrases in your brief: what the evidence actually shows.**
- *Measured overuse:* delve, tapestry, testament, pivotal, underscore, showcase, intricate, meticulous, crucial, vibrant, robust, enhance, fostering, landscape [PR + PRAC].
- *Practitioner-reported, with no corpus ratio retrieved this session:* leverage, seamless, game-changer, elevate, navigate (as in "navigate challenges"), "in today's fast-paced world", "it's important to note" [PRAC/ANEC]. These read as AI mostly because they're generic, and the fix is the same either way.
- *Human clichés that AI copies:* "I hope this email finds you well" was in 0.10% of 1M+ real emails from 2024-2025, and "reaching out" in 0.61% [VEND]. Grammarly was offering alternatives to the first one in 2017, well before ChatGPT. On its own it's a template signal, not an AI signal. Combined with other tells, it adds to the template feel.

**False-positive warning.** Kobak found that LLM style words also climbed in human writing, and some non-native writers were taught exactly this "elevated" vocabulary. Wikipedia notes, for example, that Italian schools teach students to avoid repeating words. Never treat one word as proof [INF from PR/PRAC].

### A3. Structural tells

| Tell | Evidence | Strength |
|--|--|--|
| Trailing participle "analysis" (", highlighting the importance of...", ", ensuring...", ", fostering...") | Reinhart: participial clauses at 2-5x human rate (GPT-4o 5.3x, d=1.38); Wikipedia "superficial analyses" | PR + PRAC: strong |
| Noun-heavy, nominalized prose ("the implementation of", "the utilization of") | Reinhart: nominalizations 1.5-2.1x; style persists even when the model is asked to sound informal | PR: strong |
| Negative parallelism ("It's not X, it's Y"; "not just X, but Y"; "X? No. Y.") | Wikipedia; Antislop uses it as its example regex; Boggia 2026: 3+ frames in a short passage is a strong indicator, results mixed by register | PRAC + PP: moderate |
| Rule of three (adjective triplets, three-part lists) | Wikipedia: used to make shallow analysis look thorough; Reinhart: phrasal coordination about 1.9x | PRAC + PR (indirect): moderate |
| Em-dash density, especially spaced " — " | medRxiv rise 4.2% to 11.6% of Discussions; per-model rates vs human baseline; Wikipedia says use it only alongside other signs | PP + PRAC: weak to moderate, model-dependent |
| Markdown in short messages: headers, bolded inline labels ("**Timeline:** ..."), horizontal rules, Title Case headings, emoji bullets | Wikipedia; "Last Fingerprint" preprint links this to markdown-heavy training plus RLHF; Anthropic docs give instructions for suppressing markdown | PRAC + PP + OFF: strong in email/DM/SMS |
| Summary or restating closer ("In summary", "Overall", "Ultimately") and "despite challenges / future outlook" endings | Wikipedia "outline-like conclusions" | PRAC: moderate |
| Uniform sentence length and rhythm (low "burstiness") | GPTZero's explanation (vendor; it no longer uses the metric); RAID: models are more repetitive (Self-BLEU) | VEND + PR (indirect): weak alone |
| Sycophantic openers and unearned enthusiasm | Anthropic: RLHF assistants are consistently sycophantic, and human raters sometimes reward it [PR]; smart replies skew more positive than human text (Mieczkowski, cited in the Diamond preprint) and raise positive emotional language (Hohenstein) | PR: moderate |
| Perfectly balanced pros/cons, noncommittal endings ("it depends on your needs") | Wikipedia; practitioner reports | PRAC: moderate |
| Copula avoidance ("serves as", "stands as", "boasts" meaning "has") | Wikipedia | PRAC: moderate |
| Over-politeness and apology stacking | Cultural confound: Japanese writers use more politeness markers than Americans; AI drafts move writers toward the draft's level [PP] | PP: weak as a tell, real as a style drift |
| Generic specifics: compliments or claims with no names, numbers, or dates | Wikipedia: "regression to the mean... generic statements that could equally apply to many topics"; Russell: experts flag low originality; Galdin & Silbert: customization was the old signal | PR + PRAC: strong |
| "AI writes in passive voice" (common belief) | **Contradicted:** GPT-4o uses agentless passive at about half the human rate (Reinhart) | PR: myth |

**Em dashes, in detail.**
- Czuma's pre-registered medRxiv study found Discussion sections with at least one em dash rose from 4.23% to 11.58% after ChatGPT, reaching 20.3% in 2025 [PP]. https://arxiv.org/abs/2606.29540v1
- The "Last Fingerprint" preprint measured per-model rates: GPT-4.1 10.62, Claude Opus 4.6 9.09, DeepSeek V3 6.95, Llama 0, against 3.23 per 1,000 words in published human essays. An instruction to write plain prose removed markdown in every model but left em dashes in most [PP]. https://arxiv.org/html/2603.27006v1
- Wikipedia cites a July 2026 study finding that, of current models, only Claude used em dashes more than professional writers and ChatGPT used them less. I saw this only as Wikipedia's summary and did not retrieve the study.
- OpenAI says ChatGPT has followed "no em dash" custom instructions since Nov 2025 [JOUR]. https://www.businessinsider.com/chatgpt-em-dash-fix-openai-sam-altman-2025-11
- What it means [INF]: the em dash is now more a sign of Claude-drafted text, or of careful human writers, than of AI in general. Use density thresholds, not presence. For Jermaine, who drafts with Claude, it is worth stripping.

### A4. How AI detectors work, how accurate they are, and what follows

**Methods.**
1. *Perplexity and burstiness.* Score how predictable each token is to a language model (perplexity), and how much that predictability varies from sentence to sentence (burstiness). GPTZero's support page says it stopped using these in autumn 2023 and switched to a deep-learning model, although its FAQ still describes them [VEND, observed inconsistency]. https://support.gptzero.me/articles/9585228410-how-do-i-interpret-burstiness-or-perplexity
2. *Trained classifiers.* Models such as RoBERTa or proprietary systems trained on labeled human and AI text. Examples: Turnitin, GPTZero, Originality, Pangram.
3. *Zero-shot likelihood methods.* DetectGPT, Fast-DetectGPT, Binoculars. Binoculars held up especially well at low false-positive rates in RAID [PR].
4. *Watermarking.* The generating model nudges its token choices in a pattern that can be checked statistically later. Two examples: Kirchenbauer et al.'s green/red token lists (ICML 2023) [PR], and Google's SynthID-Text, which runs in Gemini and showed no quality difference across about 20M responses [PR]. Watermarks only cover text from a model that applies them, and paraphrasing weakens them [PR]. https://www.nature.com/articles/s41586-024-08025-4

**Accuracy.**
- OpenAI's own classifier caught 26% of AI text and flagged 9% of human text. OpenAI withdrew it in July 2023 [OFF]. https://openai.com/index/new-ai-classifier-for-indicating-ai-written-text/
- RAID (Penn, ACL 2024) [PR]: top detectors "can deteriorate from perfect accuracy to complete failure" just from changing the generator, the decoding strategy, or adding a repetition penalty (95%+ error). Accuracy figures mean nothing unless the false-positive rate is fixed. https://arxiv.org/html/2405.07940v1
- Sadasivan et al., TMLR [PR]: recursive paraphrasing sharply lowers detection rates across detector types, watermarks included, and watermarks can be spoofed. https://arxiv.org/abs/2303.11156
- Jabarian & Imas, NBER WP 34223 (2025) [PP]: tested 1,992 passages across six genres with GPT-4.1, Claude Opus 4/Sonnet 4, and Gemini 2.0 Flash. Pangram had near-zero false-positive and false-negative rates, held up on short passages and against a humanizer tool, and was the only detector to meet a false-positive cap of 0.5% or less. Open-source RoBERTa misclassified up to 78% of human text. https://www.nber.org/papers/w34223
- Turnitin (vendor claim): under 1% document-level false positives when 20% or more of a document is AI-written, about 4% at the sentence level, and it puts an asterisk on scores under 20% because they're less reliable [VEND]. https://guides.turnitin.com/hc/en-us/articles/28477544839821-Turnitin-s-AI-writing-detection-capabilities-FAQs

**False positives and non-native writers.**
- Liang et al. (Stanford), Patterns 2023 [PR]: 2023-era detectors routinely flagged TOEFL essays by non-native writers as AI. A follow-up study puts the mean false-positive rate at 61.3%. https://arxiv.org/abs/2304.02819
- Al Ali et al. 2026 [PP] re-ran the test with 2025-era detectors: no systematic bias in Czech, and on Liang's English data the false-positive gap shrank to 23.1%. https://arxiv.org/html/2602.05769v1
- *Style as a Confound* (Aug 2026) [PP]: across 13 detectors, false-positive rates on human academic text ranged from 0% to 100%. Professional editing pushed some detectors toward "AI" and others toward "human". https://arxiv.org/html/2608.26710v1

**What this implies [INF].**
- Treat a detector score as weak evidence. Never use it alone to accuse anyone. This matters for your UofL teaching, where it fits Turnitin's own guidance.
- The aim for Jermaine's own writing is *reader trust*, not *passing detectors*. "Humanizer" tools trade quality for evasion, and Russell's experts still caught humanized text.
- A tells checker is a style linter. It should explain what reads as generic and why, not output a probability of AI authorship.

### A5. Channel-specific patterns

**Email.**
- The highest-risk email is a relational one written with heavy AI: congratulations, thanks, condolences, feedback, apologies (Cardon & Coman) [PR].
- Signs readers notice [PRAC/INF]:
  - A pasted "Subject:" line in the body.
  - Headers or bold labels in a five-sentence email.
  - A canned opener plus a canned closer ("Please don't hesitate to reach out").
  - A reply far longer than the email it answers.
  - Empathy boilerplate ("I completely understand your frustration").
  - Leftover placeholders ("[Client Name]").
- The "hope" openers are human clichés [VEND], so they're low severity alone.

**LinkedIn.**
- LinkedIn added a "seems like AI slop" button in July 2026 for posts and comments [JOUR]. Originality.ai's own detector labeled 81.2% of 5,000 long-form public posts "Likely AI" [VEND; detector vendor, treat with caution].
- Post patterns [PRAC/ANEC]: a one-line hook, one-sentence paragraphs, "Here's the thing:", "The result?", emoji bullets, "Agree?" or "Thoughts?" at the end, a block of hashtags.
- DM and recruiter/sales patterns [PRAC/ANEC; no peer-reviewed DM study found]:
  - "I came across your profile and was impressed by..." with no specifics.
  - "As a fellow [X] leader."
  - "Would you be open to a quick 15-minute call?"
  - Personalization that is "related but not relevant" (your school or city, with no tie to the ask).
  - Merge-field residue ("Hi {first_name}").
- Galdin & Silbert's evidence on collapsed signal value carries over by analogy [INF]: generic personalization is now free, so readers discount it.

**Texts/SMS.**
- Evidence is thin. One small preprint (n=26) found labeling texts as AI-assisted made no significant difference [PP, weak]. Hohenstein's smart-reply work shows suspicion hurts [PR].
- Tells come from mismatched register, not vocabulary [INF]:
  - Full formal sentences, a greeting plus sign-off ("Hi Sarah, ... Best, J").
  - Bullets, semicolons, or em dashes in a text.
  - "Regarding" or "I wanted to follow up on".
  - Messages longer than about 60 words.
  - Uniformly upbeat replies ("That sounds wonderful! I'd love to!").

**Cover letters and applications.**
- Signal value has collapsed for AI-written proposals [PP].
- About 20% of surveyed hiring managers say they would reject an AI-generated resume or cover letter, and 52% accept AI for proofreading or support [VEND survey, 600 managers]. https://www.uschamber.com/co/run/human-resources/hiring-ai-job-applications
- Tells [PRAC]: "I am writing to express my keen interest", "perfect fit", "passionate about", "proven track record", "unique blend of skills", "make a meaningful impact", with nothing company-specific between the opening and the sign-off.
- Relevant to Jermaine when you write or review recommendation letters and student materials.

---

## Part B. Writing well with AI so it sounds like you

### B1. What the research says about voice

- **Few-shot voice matching works partly.** Across 400+ real authors, LLMs given a few samples matched style reasonably well in structured formats (news, email) but struggled with informal blogs and forums. The output tended to drift toward an average voice, and adding more examples hit limits [PP]. https://arxiv.org/pdf/2509.14543
- **AI drafts reshape your style.** AI suggestions moved Indian writers toward Western styles (CHI 2025) [PR]. AI email drafts moved Japanese and American writers toward the draft's directness level, and writers kept more than 93% of the draft text. Misaligned drafts caused 10-16x bigger shifts [PP]. In practice [INF]: if the model writes first, you end up editing toward its voice. If you write first, you keep yours.
- **Telling the model to avoid words works only partly.** The Antislop authors report that prompting a model to avoid banned words "has limited efficacy and may induce a backfire effect" [PP]. Anthropic's docs also say to state what you want rather than what you don't [OFF]. So [INF]: describe the target voice positively in the prompt, and catch banned patterns afterward with a checker. Don't rely on a long "never say" list in the prompt.

### B2. Official prompting guidance on style

- **Anthropic** (Claude prompting best practices) [OFF]: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
  - Examples are "one of the most reliable ways to steer Claude's output format, tone, and structure". Make them relevant, varied, and wrapped in `<example>` tags.
  - Say what to do instead of what not to do: "Your response should be composed of smoothly flowing prose paragraphs" rather than "Do not use markdown".
  - Match the prompt's style to the output you want. Removing markdown from the prompt reduces markdown in the response.
  - Give context and reasons, as you would to "a brilliant but new employee".
- **OpenAI** (GPT-5.1 prompting guide) [OFF]: https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide
  - Use the `verbosity` parameter plus concrete length rules ("at most 2 concise sentences"). The model follows concrete length guidance well.
  - Define a persona and avoid "excessive acknowledgment phrases like 'got it' or 'thank you'".
- **Claude Styles are becoming Skills** [OFF]: custom styles are moving to Skills, or you can put the same voice guidance in your account instructions. https://support.claude.com/en/articles/10181068-configure-and-use-styles

### B3. Style rules, updated for AI

**Orwell's six rules** (primary text) [OFF], each with how it applies to AI output [INF]:
1. "Never use a metaphor, simile or other figure of speech which you are used to seeing in print." For AI text: cut "tapestry", "navigate the landscape", "a testament to", "game-changer".
2. "Never use a long word where a short one will do." Change "utilize" to "use", "facilitate" to "help", "leverage" to "use".
3. "If it is possible to cut a word out, always cut it out." Delete the AI opener and closer sentences first.
4. "Never use the passive where you can use the active." Still good advice, but the AI problem is the opposite: nominalizations and participle tails, not passives.
5. "Never use a foreign phrase, a scientific word or a jargon word if you can think of an everyday English equivalent."
6. "Break any of these rules sooner than say anything outright barbarous."

Orwell's description of prose "gumming together long strips of words which have already been set in order by someone else" is close to a literal description of LLM output. Source: https://www.orwellfoundation.com/the-orwell-foundation/orwell/essays-and-other-works/politics-and-the-english-language/

**Plain language** (digital.gov) [OFF]: cut extra modifiers (really, very, totally), cut doublets ("cease and desist" becomes "stop"), keep terms consistent instead of swapping synonyms for variety, and use active voice and "you". https://digital.gov/guides/plain-language/principles/short-simple

### B4. Recommended workflow for Jermaine [INF, built from B1-B3]

1. **Write the bones yourself (1-3 minutes).** As bullets or a voice memo transcript: who it's for, what happened, what you want, by when, and one detail only you know (the client's actual number, what the student said in office hours, the name of the thing). This is where most of the "sounds like you" comes from, and it protects against style drift.
2. **Give the model your voice.** Paste 3-5 real sent messages of the same type (client reply, LinkedIn DM, text) inside `<example>` tags, plus a short positive voice description. Example: "Short sentences. Starts with the point. Uses first names. Contractions. No headers or bullets in emails under 150 words. Signs off with just 'J' or 'Jermaine'."
3. **Constrain the output in positive terms.** Set a length cap, plain words, at least one concrete detail from the bones, no preamble, end on the ask. For texts: under 40 words, lowercase is fine.
4. **Human pass (60 seconds).** Delete the first and last sentences and see if anything is lost. Read it aloud. Swap any phrase you wouldn't say out loud. Check every fact, name, link, and number.
5. **Run the tells checker** (`ai-writing-tells.json`) and fix anything high-severity. Fix medium tells when two or more cluster.
6. **Relational messages** (congratulations, condolences, apologies, feedback, thanks to someone who went out of their way): write them yourself and use AI only for typos.

Reusable prompt skeleton:

```
You are drafting a message that Jermaine will send under his own name.

<voice>
Direct and warm. Leads with the point in the first sentence. Short sentences mixed with
an occasional longer one. Contractions. Plain words. Uses the recipient's first name once.
No headers, bold, bullets, or em dashes in messages under 150 words. Ends with a clear ask
or next step, then "Jermaine".
</voice>

<examples>
<example>[paste a real sent message of this type]</example>
<example>[another]</example>
<example>[another]</example>
</examples>

<bones>
[Jermaine's bullets: facts, ask, deadline, the one specific detail]
</bones>

Write the message in flowing prose using only facts in <bones>. Keep it under [N] words.
If a needed fact is missing, put [CHECK: ...] instead of inventing it.
```

### B5. Before/after examples

These are illustrative and written for this report. The "before" texts are typical AI drafts. Every specific in the "after" texts (names, dates, numbers, the UofL and OwlThat details) is invented to show the *kind* of detail that helps. In real messages those details come from your bones and must be true.

**1. Client reply (OwlThat)**

Before:
> Subject: Re: Project Timeline
>
> Hi Sarah,
>
> I hope this email finds you well! Thank you so much for reaching out regarding the timeline. I completely understand your concerns, and I want to assure you that we're committed to delivering a seamless experience.
>
> **Current Status:** We've made significant progress on the integration, ensuring robust performance across all environments.
> **Next Steps:** Our team will continue to leverage best practices to finalize the remaining components.
>
> It's not just about meeting deadlines, it's about delivering lasting value. Please don't hesitate to reach out if you have any further questions!
>
> Best regards,
> [Your Name]

After:
> Hi Sarah,
>
> Short answer: we'll have the integration in your staging environment by Thursday the 9th, two days later than planned. The delay is the SSO piece. Your IT team's certificate came through Monday, and we need two days to test it.
>
> Everything else is done. If Thursday doesn't work for your board demo, tell me today and I'll put a second engineer on it.
>
> Jermaine

Removed: a pasted subject line, a hope opener, a thank-you opener, empathy boilerplate, "seamless/robust/leverage", bolded inline labels, a participle tail (", ensuring..."), "not just X, it's Y", a canned closer, and a placeholder. Added: a date, the cause, a real option. (The specifics are invented for the example. In real use they come from your bones.)

**2. LinkedIn cold DM**

Before:
> Hi Marcus, I came across your profile and was truly impressed by your impressive journey in the EdTech space! As a fellow innovator passionate about transforming education, I'd love to connect and explore potential synergies. Would you be open to a quick 15-minute call? 🚀

After:
> Marcus, your post last week about advisors spending 6 hours a week on transcript checks matched what we heard from three registrars at UofL. We built something at OwlThat that cuts that step. Worth a 15-minute look next Tuesday or Wednesday? If it's not a fit, no follow-up from me.

**3. Text message**

Before:
> Hi Jordan! Just wanted to follow up regarding tomorrow's meeting. I wanted to confirm that 2:00 PM still works for you. Please let me know if you need to reschedule. Looking forward to it! Best, Jermaine

After:
> still good for 2 tomorrow? can push to 3 if that's easier

**4. Student email (UofL)**

Before:
> Dear Student, Thank you for your thoughtful question! It's important to note that the assignment requirements are designed to foster critical thinking and showcase your understanding of key concepts. In summary, I encourage you to review the rubric carefully.

After:
> Hi Priya, yes, you can use the case from your internship, as long as you anonymize the company. The rubric's "analysis" row is where most people lose points, so spend your words there rather than on background. Happy to look at an outline Thursday in office hours.

**5. LinkedIn post opening**

Before:
> AI isn't just changing education. It's revolutionizing it. 🚀
>
> Here's the thing: in today's fast-paced world, institutions must navigate an evolving landscape.
>
> The result? A game-changing opportunity.
>
> Agree? 👇

After:
> Last semester I let my UofL students use AI on one assignment and banned it on another. The AI-allowed papers were cleaner and more alike. Four of 31 used the same three-part structure, down to the headings. Here's what I'm changing this fall.

### B6. Ethics and disclosure in business communication

**What the evidence says.**
- Disclosure lowers trust, but being exposed by someone else lowers it more [PR, Schilke & Reimann].
- Undisclosed AI use mostly goes unquestioned [PP].
- The penalty scales with how much AI wrote the message and with how relational it is [PR, Cardon & Coman].
- NN/g's review found disclosure effects are inconsistent across studies, and transactional messages carry little penalty [PRAC].

**Law.** EU AI Act Article 50(4) requires *deployers* to label AI-generated text that is *published* to *inform the public on matters of public interest*, unless it went through human review or editorial control. Personal, non-professional use is excluded [OFF]. NN/g reports the transparency obligations began in August 2026 [PRAC]. Private client emails, DMs, and texts are outside 50(4). Public posts on policy, health, or finance topics could be in scope if published without human review [INF; not legal advice]. https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act

**Practical rules for Jermaine [INF, built on PACED + the studies above].**
1. **Policy first.** Follow client contracts, platform rules, journal or conference rules, and UofL policy. I did not research UofL's policy, so check it before applying this to coursework, grading feedback, or recommendation letters.
2. **No disclosure needed** for grammar, tone, or concision edits of your own draft, or for routine logistics. Recipients treat this like spell-check, and Cardon found almost no penalty for light editing.
3. **Disclose, or don't use AI,** when the recipient is paying for your personal judgment or expertise (advisory deliverables, reference letters), when the message is meant to show personal care, or when someone asks directly. Never deny AI use when asked. The exposure penalty is the worst outcome in the data.
4. **For customer-facing OwlThat automation** (bots, auto-replies), say plainly that it's automated. This is also the direction of Art. 50(1) for AI systems that interact with people.
5. **In teaching,** model the norm you ask of students. A short line like "Drafted with AI assistance, reviewed and edited by me" on course materials costs little and shows the behavior you want [INF].

---

## Open questions and limits

- No peer-reviewed study of tells specific to LinkedIn DMs or SMS was found.
- Corpus ratios for "leverage", "seamless", "game-changer", "elevate", "navigate", and "it's important to note" were not retrieved. Their place in the checklist rests on practitioner reports and their generic quality.
- Several 2026 sources are single-author or very recent preprints (epanorthosis, em-dash studies, the 89% PMC estimate, the detector-bias revisit). Their findings may change after review.
- Tells drift as models change (for example, "delve" fading and ChatGPT dropping em dashes). Re-check the lists every 6 months.
- The burstiness threshold and density thresholds in the checklist are heuristics I made up. They have not been validated. Calibrate them on Jermaine's sent mail before relying on them.

## Source list with evidence grades

| Source | Grade |
|--|--|
| Jakesch, Hancock, Naaman, PNAS 2023. https://arxiv.org/abs/2206.07271 | PR |
| Porter & Machery, Sci Rep 2024. https://www.nature.com/articles/s41598-024-76900-1 | PR |
| Jones & Bergen 2025. https://arxiv.org/abs/2503.23674 | PP |
| Russell, Karpinska, Iyyer, ACL 2025. https://arxiv.org/abs/2501.15654 | PR |
| Dugan et al., AAAI 2023. https://arxiv.org/abs/2212.12672 | PR |
| Hohenstein et al. https://arxiv.org/abs/2102.05756 | PP (journal version reported) |
| Cardon & Coman, IJBC 2025. https://journals.sagepub.com/doi/10.1177/23294884251350599 | PR |
| Schilke & Reimann, OBHDP 2025. https://econpapers.repec.org/article/eeejobhdp/v_3a188_3ay_3a2025_3ai_3ac_3as0749597825000172.htm | PR |
| Blissful (A)Ignorance. https://arxiv.org/pdf/2501.15678 | PP |
| Diamond, AI-mediated text messages. https://arxiv.org/html/2402.01726v1 | PP (n=26) |
| Galdin & Silbert, Making Talk Cheap. https://arxiv.org/html/2511.08785v1 | PP |
| Liang et al., LLM writing across society. https://arxiv.org/abs/2502.09747 | PP |
| Kobak et al., Science Advances 2025. https://arxiv.org/abs/2406.07016 | PR |
| Kobak et al. follow-up 2026. https://arxiv.org/pdf/2608.10715 | PP |
| Reinhart et al., PNAS 2025. https://arxiv.org/html/2410.16107v2 | PR |
| Wikipedia: Signs of AI writing. https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing | PRAC |
| Wikipedia: Signs of AI-generated comments. https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI-generated_comments | PRAC |
| Boggia, Artificial Epanorthosis 2026. https://arxiv.org/pdf/2607.21498v2 | PP |
| Antislop 2025. https://arxiv.org/pdf/2510.15061v2 | PP |
| Juzek & Ward. https://arxiv.org/abs/2412.11385 | PP (found, not extracted) |
| Czuma, em-dash in medRxiv 2026. https://arxiv.org/abs/2606.29540v1 | PP |
| The Last Fingerprint 2026. https://arxiv.org/html/2603.27006v1 | PP |
| Business Insider on ChatGPT em dashes. https://www.businessinsider.com/chatgpt-em-dash-fix-openai-sam-altman-2025-11 | JOUR |
| Anthropic, sycophancy. https://www.anthropic.com/research/towards-understanding-sycophancy-in-language-models | PR |
| OpenAI AI classifier. https://openai.com/index/new-ai-classifier-for-indicating-ai-written-text/ | OFF |
| GPTZero support and vocabulary pages. https://support.gptzero.me/articles/9585228410-how-do-i-interpret-burstiness-or-perplexity | VEND |
| Turnitin FAQ and FPR blog. https://guides.turnitin.com/hc/en-us/articles/28477544839821-Turnitin-s-AI-writing-detection-capabilities-FAQs | VEND |
| RAID, ACL 2024. https://arxiv.org/html/2405.07940v1 | PR |
| Jabarian & Imas, NBER 2025. https://www.nber.org/papers/w34223 | PP |
| Liang et al., Patterns 2023. https://arxiv.org/abs/2304.02819 | PR |
| Al Ali et al. 2026. https://arxiv.org/html/2602.05769v1 | PP |
| Style as a Confound 2026. https://arxiv.org/html/2608.26710v1 | PP |
| Sadasivan et al., TMLR. https://arxiv.org/abs/2303.11156 | PR |
| Kirchenbauer et al., ICML 2023. https://arxiv.org/abs/2301.10226 | PR |
| SynthID-Text, Nature 2024. https://www.nature.com/articles/s41586-024-08025-4 | PR |
| Wang et al., LLMs struggle to imitate implicit styles. https://arxiv.org/pdf/2509.14543 | PP |
| Agarwal et al., CHI 2025. https://arxiv.org/abs/2409.11360 | PR |
| AI email drafts shift cultural styles 2026. https://arxiv.org/html/2609.26403v1 | PP |
| Anthropic prompting best practices. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices | OFF |
| OpenAI GPT-5.1 prompting guide. https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide | OFF |
| Claude Styles to Skills. https://support.claude.com/en/articles/10181068-configure-and-use-styles | OFF |
| Orwell, Politics and the English Language. https://www.orwellfoundation.com/the-orwell-foundation/orwell/essays-and-other-works/politics-and-the-english-language/ | Primary text |
| digital.gov plain language. https://digital.gov/guides/plain-language/principles/short-simple | OFF |
| EU Commission Art. 50 FAQ. https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act | OFF |
| NN/g PACED. https://www.nngroup.com/articles/disclose-ai-paced/ | PRAC |
| WSJ on LinkedIn slop button. https://www.wsj.com/cmo-today/linkedin-wants-users-to-lean-less-on-ai-maybe-a-lot-less-8e03b2aa | JOUR |
| Originality.ai LinkedIn study. https://originality.ai/blog/ai-content-published-linkedin | VEND |
| ZeroBounce email buzzwords. https://www.zerobounce.net/email-buzzwords | VEND |
| US Chamber / TopResume survey. https://www.uschamber.com/co/run/human-resources/hiring-ai-job-applications | VEND |
| LinkedIn "top content" on toning down AI email. https://www.linkedin.com/top-content/writing/email-writing-best-practices/when-to-tone-down-ai-generated-email-content/ | ANEC |
