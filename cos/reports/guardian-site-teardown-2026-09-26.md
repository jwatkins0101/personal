# Guardian Owl discovery site: teardown plan (2026-09-26)

Ask (Jermaine): "we can delete this and remove this from the internet". This covers the basic-auth discovery site and its plaintext credential.
Status: PREPARED ONLY. No AWS changes, no file edits, no commits were made. The credential is never quoted here; it is called "the credential".

## 1. Verified facts (read-only checks, 2026-09-26)

### AWS (account 441955302496, profile `jermaine`, us-east-1)
| Resource | ID | Verified state |
|---|---|---|
| CloudFront distribution | `E1EM8NK73WJG3V` (den2q1izcmo8b.cloudfront.net) | Enabled, Deployed. No aliases. Logging off. No WAF. Default CloudFront cert (no ACM). No Lambda@Edge. No extra cache behaviors. Not staging, no continuous-deployment policy. Last modified 2026-05-15. `curl https://den2q1izcmo8b.cloudfront.net/` returns **401** |
| CloudFront Function | `guardianowl-basic-auth` | Has both a LIVE and a DEVELOPMENT stage. The code is byte-identical to local `hosting/cf-function-basic-auth.js` (same sha256), so the **credential (base64) is inside the live function code** |
| Origin Access Control | `E3ENDEI93ZK8PI` (`guardianowl-discovery-oac`) | Used only by E1EM8NK73WJG3V |
| S3 bucket | `guardianowl-discovery-private` | Region us-east-1. Public access block is fully on. The bucket policy allows only CloudFront with SourceArn = E1EM8NK73WJG3V. Versioning has never been enabled (27 versions, 0 delete markers). No access logging, lifecycle, replication, tags, website, CORS, notifications or object lock |
| Route 53 | none | No record matching den2q1izcmo8b/guardianowl in any of the 3 zones in 441955302496 or in the owlthat.com zone (756493389453). guardianowldigital.com uses Google Cloud DNS (not checked), but the distribution has no alias, so no custom hostname can route to it |
| ACM / WAF / KVS / real-time logs / CW alarms | none | Nothing tied to this site |

The other 6 distributions in the account (wethejury ×4, wrightpaints, jermainewatkins.com) do **not** reference this function or OAC, and none of them is affected.

### Bucket contents vs local copy
The 27 S3 objects (834,798 bytes, uploaded 2026-05-15 to 2026-05-22) match `deliverables/site/` exactly: same 27 keys, same sizes, and every S3 ETag equals the local MD5. Deleting the bucket loses nothing.
- Caveat: `deliverables/site/` is gitignored (in the uncommitted `.gitignore` change), so after the bucket goes, the only copy is the local one. It can be rebuilt with `python3 tools/build_static.py` from the .md sources.

### NEW finding: the credential is published *on the site itself*
`tools/build_static.py` rglobs every `*.md` in the repo. `SKIP_DIR_PARTS` does not include `hosting`, so `hosting/README.md` was rendered to **`hosting/README.html`, which is in the S3 bucket and served by the site** (behind the same basic auth). It is not linked from index.html. Any future rebuild and sync would publish it again, along with other new top-level .md files (METHODOLOGY.md, harness-import/*.md).

### Where the credential exists on disk (plaintext or base64; paths only)
Searched `guardianowldigital/`, `owlthat-hq/` (excluding node_modules/.next/.git), `~/Code`, `~/.claude/projects/*/memory`, all `~/.claude/projects/**/*.jsonl`, and the rest of `~/.claude`.
1. `…/Sites/guardianowldigital/hosting/credentials.txt` (intended home; gitignored)
2. `…/Sites/guardianowldigital/hosting/README.md` (plaintext)
3. `…/Sites/guardianowldigital/hosting/cf-function-basic-auth.js` (base64 user:pass)
4. `…/Sites/guardianowldigital/deliverables/site/hosting/README.html` (plaintext; also in S3 as `hosting/README.html`)
5. `~/.claude/projects/-Users-jermainewatkins-Library-Application-Support-assistance-agent/abef3d53-69b5-45cf-b72d-fc8087c8185e.jsonl` (session transcript)
6. `~/.claude/projects/-Users-jermainewatkins-Documents-Documents---Jermaine-s-MacBook-Pro-Sites/c1d6209c-be56-41ec-81a3-0f5d39d25ac8/subagents/agent-aaff79d4389f7d528.jsonl` (a subagent in *this* CoS session read the file; re-scan after the session ends)
7. `~/.claude/scripts/notify-end.log` (50 MB hook log)
8. AWS: the LIVE and DEVELOPMENT code of CloudFront Function `guardianowl-basic-auth`
9. Off-disk: the email to Dan Murphy's personal Gmail on 2026-05-15 (this was in the brief; I did not verify it, and it cannot be recalled)

None in owlthat-hq, `~/Code`, or any memory folder. (`…/Sites` = `/Users/jermainewatkins/Documents/Documents - Jermaine’s MacBook Pro/Sites`; `~/Documents/Sites` is a symlink to it.)

Git: **none of these are tracked or pushed.** `git ls-files hosting/` is empty, `git log --all -- hosting/` is empty, `git log --all -p` has 0 matches for the credential, and `deliverables/site/` is ignored. `git ls-remote origin` shows only `main` = `f6c9370` = local HEAD. OwlThat/guardianowldigital is PRIVATE on GitHub.

### References to the site still in use
- Only `hosting/*` (README, JSON create responses, bucket-policy.json) and the CoS card `~/Code/assistance/cos/projects/cards/guardianowldigital.md` (Paths, Stack, Accounts, Gaps sections).
- There are no references in INDEX.md, other .md in guardianowldigital, owlthat-hq, any memory folder, or other Sites projects. The site's own index.html does not link hosting/README.html.

### Repo state (guardianowldigital)
On `main`, level with origin (`f6c9370`, 2026-05-13). Modified but uncommitted: `.gitignore`, `INDEX.md`, the briefing PDF, maps 01-09. Untracked: `METHODOLOGY.md`, `deliverables/ux-audit-2026-09-19/`, `discovery/12-*.md`, `discovery/13-*.md`, `harness-import/`, `hosting/`, `tools/build_static.py`, `.DS_Store` ×2. `.gitignore` currently ignores `hosting/credentials.txt` and `deliverables/site/` only. Stage A must **not** commit anything, and must not sweep this WIP into a commit.

## 2. Stage A: reversible (an agent may run this after Jermaine says yes)

### A1. Disable the distribution (takes the site off the internet)
```bash
export AWS_PROFILE=jermaine AWS_PAGER=""
D=E1EM8NK73WJG3V
W=$(mktemp -d)
aws cloudfront get-distribution-config --id "$D" --output json > "$W/get.json"
ETAG=$(jq -r '.ETag' "$W/get.json")
jq '.DistributionConfig | .Enabled = false' "$W/get.json" > "$W/cfg.json"
jq '.Enabled' "$W/cfg.json"          # must print false
aws cloudfront update-distribution --id "$D" --if-match "$ETAG" \
  --distribution-config "file://$W/cfg.json" --query 'Distribution.{S:Status,E:DistributionConfig.Enabled}'
aws cloudfront wait distribution-deployed --id "$D"     # ~5-15 min
aws cloudfront get-distribution --id "$D" --query 'Distribution.{S:Status,E:DistributionConfig.Enabled}'   # expect Deployed / false
curl -s -o /dev/null -w '%{http_code}\n' https://den2q1izcmo8b.cloudfront.net/   # was 401; record the new code (should no longer be 401)
rm -rf "$W"
```
The bucket is private and allows CloudFront only (PAB on), so once the distribution is disabled nothing in S3, including `hosting/README.html`, can be reached.

### A2. Remove the credential from the working files (credentials.txt stays as the single local copy)
- `hosting/README.md`: replace the Password line with `- Password: see hosting/credentials.txt (gitignored)`, and add a line at the top: "Site disabled 2026-09-26; see cos/reports/guardian-site-teardown-2026-09-26.md".
- `hosting/cf-function-basic-auth.js`: replace the base64 string with the placeholder `REPLACE_WITH_BASE64_OF_user:pass`. You could delete the file instead, but it is small and useful as a template.
- `deliverables/site/hosting/README.html`: delete this local build output. It is gitignored and regenerable, and the bucket copy is handled in B1.
- `tools/build_static.py`: add `"hosting"` to `SKIP_DIR_PARTS` so a rebuild can never republish it.
- `.gitignore`: add `hosting/`, which covers credentials.txt and the create-response JSONs.
- Verify with `grep -rlF -f <needle-file> <paths>`. Only `hosting/credentials.txt` should remain in guardianowldigital. Delete the needle file afterwards.

### A3. Scrub the other copies (in-place redaction; no backup, since a backup would be another copy)
- `~/.claude/projects/-Users-jermainewatkins-Library-Application-Support-assistance-agent/abef3d53-69b5-45cf-b72d-fc8087c8185e.jsonl`
- `~/.claude/projects/-Users-jermainewatkins-Documents-Documents---Jermaine-s-MacBook-Pro-Sites/c1d6209c-be56-41ec-81a3-0f5d39d25ac8/subagents/agent-aaff79d4389f7d528.jsonl` (after this session ends, then re-scan all `~/.claude/projects/**/*.jsonl`, because other agents in this session also read hosting/)
- `~/.claude/scripts/notify-end.log` (or truncate it; it is a 50 MB hook log)
- Method: a Python replace of both the plaintext and the base64 string with `[REDACTED]`, reading the values from credentials.txt so they never go on a command line. Then re-grep and expect 0 files.
- Do not commit. Nothing in git needs scrubbing (verified above).
- Update the CoS card: in `cards/guardianowldigital.md`, mark the discovery site as disabled and close the Gap line.

### Rollback for Stage A
- Re-enable: run the same A1 flow with `.Enabled = true` (fresh `get-distribution-config` and ETag), wait for `distribution-deployed`, then curl should return 401 again. The function, OAC and bucket are untouched, so the site returns as it was.
- Credential in files: restore from `hosting/credentials.txt`. In README, put the password back on the Password line. In the JS, `printf '%s' "user:pass" | base64` goes back into `expected`. The live function code is not changed in Stage A.
- `deliverables/site/`: `python3 tools/build_static.py` regenerates it. With the A2 skip in place it will no longer contain hosting/.
- `.gitignore` / `build_static.py`: remove the added entries. All of these are uncommitted working-tree edits.
- Scrubbed transcripts/logs: not reversible, and not needed (they are history only).

## 3. Stage B: permanent (Jermaine runs these himself; the CoS charter forbids permanent deletes)
Precondition: A1 is done and `get-distribution` shows `Status=Deployed, Enabled=false`.
```bash
export AWS_PROFILE=jermaine AWS_PAGER=""
D=E1EM8NK73WJG3V; B=guardianowl-discovery-private; F=guardianowl-basic-auth; O=E3ENDEI93ZK8PI

# B1. Empty the bucket (versioning was never enabled, so plain rm removes everything)
aws s3 rm "s3://$B/" --recursive
aws s3api list-object-versions --bucket "$B" --query '{V:length(Versions||`[]`),DM:length(DeleteMarkers||`[]`)}'   # expect 0 / 0

# B2. Delete the distribution (must be Disabled + Deployed)
aws cloudfront get-distribution --id "$D" --query 'Distribution.{S:Status,E:DistributionConfig.Enabled}'   # Deployed / false
ETAG=$(aws cloudfront get-distribution --id "$D" --query ETag --output text)
aws cloudfront delete-distribution --id "$D" --if-match "$ETAG"
aws cloudfront get-distribution --id "$D" 2>&1 | grep -q NoSuchDistribution && echo "dist gone"   # repeat until gone

# B3. Delete the function (only possible once no distribution references it)
ETAG=$(aws cloudfront describe-function --name "$F" --query ETag --output text)   # DEVELOPMENT-stage ETag
aws cloudfront delete-function --name "$F" --if-match "$ETAG"
aws cloudfront list-functions --stage LIVE --query "FunctionList.Items[?Name=='$F'].Name"   # expect []

# B4. Delete the OAC
ETAG=$(aws cloudfront get-origin-access-control --id "$O" --query ETag --output text)
aws cloudfront delete-origin-access-control --id "$O" --if-match "$ETAG"

# B5. Delete the bucket (its policy goes with it)
aws s3api delete-bucket --bucket "$B" --region us-east-1
aws s3api head-bucket --bucket "$B" 2>&1   # expect 404 / Not Found

# B6. Verify
curl -s -o /dev/null -w '%{http_code}\n' https://den2q1izcmo8b.cloudfront.net/   # hostname should no longer serve
```
- Route 53 / ACM / WAF / logging bucket: **nothing to clean up** (verified none exist).
- Optional local cleanup, at Jermaine's call: delete `hosting/` (including credentials.txt) and `deliverables/site/` once the site is gone. Keep `hosting/README.md` only if he wants the record.
- Cost: none after B5.

## 4. Is rotation still needed?
**Not if the site is gone.** The credential only guards this one CloudFront Function. I found no reuse: it is not on disk outside the paths above, not in any memory, owlthat-hq or ~/Code file, and not in the only other basic-auth function in the account (`wethejury-wiki-basic-auth-prod`, checked in both plaintext and decoded base64).
Limits of that check: I could not look at password managers, Guardian/OwlThat SaaS accounts or other AWS accounts. If Jermaine has ever used this password anywhere else, rotate it there, because it went to a personal Gmail on 2026-05-15. Between now and A1, the 401 gate stays up with the same credential. If he wants zero exposure before A1, A1 itself is the fastest fix.

## 5. Things that change the plan vs. the brief
1. The credential is also **served by the site** (`hosting/README.html` in S3 and in local `deliverables/site/`), because build_static.py doesn't skip `hosting/`. A2 now adds the skip and deletes the local file.
2. The credential sits in **2 Claude transcripts plus `~/.claude/scripts/notify-end.log`**. One transcript is from this session, so re-scan after it ends.
3. There is nothing in git or on GitHub, so no history rewrite is needed.
4. There is no Route 53, ACM, WAF or logging to clean up. The teardown is 4 resources: distribution, function, OAC, bucket.
5. The existing teardown block in `hosting/README.md` has a bug: it saves to `/tmp/cf.json` but reads `/tmp/cf-config.json`, and it doesn't strip the ETag wrapper. Use the commands above instead.
