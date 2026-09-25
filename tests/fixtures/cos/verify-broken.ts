// Negative fixture for gate:verify-source: trusts every proposal.
import type { Proposal, Fetcher, Verified } from "../../../src/cos/verify.ts";
export async function verifyProposals(p: Proposal[], _f: Fetcher): Promise<Verified> { return { ok: p, escalations: [] }; }
