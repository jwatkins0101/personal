// Negative fixture for gate:eod-handoff: an EOD that never writes its hand-off file.
export async function runEod() { return { record: null, path: "/nonexistent" }; }
