#!/usr/bin/env node
// Count inbox-unread matches for each candidate second-pass query. Creds on stdin. Read-only.
import fs from "node:fs";
const creds = JSON.parse(fs.readFileSync(0, "utf8"));
const tok = await (async () => {
  const body = new URLSearchParams({ client_id: creds.client_id, client_secret: creds.client_secret,
    refresh_token: creds.refresh_token, grant_type: "refresh_token" });
  return (await (await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body })).json()).access_token;
})();
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const H = { Authorization: `Bearer ${tok}` };
async function count(q) {
  let n = 0, pt = "";
  do { const u = new URL(`${API}/messages`); u.searchParams.set("q", q); u.searchParams.set("maxResults", "500");
    if (pt) u.searchParams.set("pageToken", pt);
    const j = await (await fetch(u, { headers: H })).json();
    n += (j.messages || []).length; pt = j.nextPageToken || ""; } while (pt);
  return n;
}
const BASE = "in:inbox is:unread";
const Q = {
  "Blackboard daily notifications": `${BASE} from:blackboard.com`,
  "Ring": `${BASE} from:rs.ring.com`,
  "ecobee": `${BASE} from:ecobee.com`,
  "EA / PlayStation": `${BASE} (from:ea.com OR from:playstation.com)`,
  "TomoCredit promo": `${BASE} from:tomocredit.com`,
  "yourguidetoassistance": `${BASE} from:yourguidetoassistance.com`,
  "FastInsurance/insurance promo": `${BASE} (from:fastinsurance OR subject:"insurance rates")`,
  "--- KEEP: SmartCall": `${BASE} from:smartcalltimesolutions.com`,
  "--- KEEP: VERY Health": `${BASE} from:very.health`,
  "--- KEEP: louisville.edu (humans+bb)": `${BASE} from:louisville.edu`,
};
for (const [name, q] of Object.entries(Q)) console.log(`  ${String(await count(q)).padStart(4)}  ${name}`);
console.log(`  ${String(await count(BASE)).padStart(4)}  TOTAL inbox unread`);
