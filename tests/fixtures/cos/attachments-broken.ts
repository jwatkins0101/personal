// Negative fixture for gate:agent-attachments: "extracts" by dumping raw bytes.
export * from "../../../src/cos/attachments.ts";
export function extractText(name: string, data: Buffer) { return { name, text: data.toString("latin1").slice(0, 200) }; }
