import { spawn } from "child_process";
import type {
  ClassifiableItem,
  ClassificationResult,
  ClassificationResponse,
  ItemType,
} from "./types.js";

function buildClassificationPrompt(items: ClassifiableItem[]): string {
  const itemList = items
    .map((item, i) => {
      let desc = `${i + 1}. [${item.type.toUpperCase()}] ID: ${item.id}`;
      if (item.from) desc += `\n   From: ${item.from}`;
      if (item.to) desc += `\n   To: ${item.to}`;
      if (item.subject) desc += `\n   Subject: ${item.subject}`;
      desc += `\n   Content: ${item.content.replace(/[\x00-\x08\x0E-\x1F]/g, "").substring(0, 400)}`;
      desc += `\n   Date: ${item.date}`;
      return desc;
    })
    .join("\n\n");

  return `You are a personal productivity assistant. Classify each item to help prioritize and organize.

Categories:
- urgent: Requires immediate attention (deadlines, emergencies, time-sensitive)
- work: Professional/business communications and tasks
- personal: Family, friends, personal matters
- newsletter: Subscriptions, digests, marketing content
- finance: Banking, payments, invoices, receipts
- health: Medical, appointments, wellness
- admin: Account updates, passwords, confirmations, logistics
- idea: Creative thoughts, suggestions, brainstorms
- waiting-on: Blocked on someone else's response
- reference: Information to keep but no action needed

Priority levels:
- P0: Critical, needs action within hours
- P1: High, needs action today
- P2: Medium, needs action this week
- P3: Low, handle when convenient

Items to classify:

${itemList}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "classifications": [
    {
      "id": "item_id",
      "type": "email|message|note|calendar",
      "category": "category_name",
      "priority": "P0|P1|P2|P3",
      "confidence": 0.0-1.0,
      "reason": "Brief explanation",
      "suggested_next_action": "Specific action to take"
    }
  ]
}`;
}

async function invokeClaudeClassifier(
  prompt: string
): Promise<ClassificationResponse> {
  return new Promise((resolve, reject) => {
    // Strip null bytes — iMessage attributedBody can contain binary data
    const sanitizedPrompt = prompt.replace(/\0/g, "");
    const args = ["-p", sanitizedPrompt, "--output-format", "json", "--model", "sonnet"];

    // Strip CLAUDECODE env var to allow spawning from within a Claude Code session
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const claude = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });

    let stdout = "";
    let stderr = "";

    claude.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    claude.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    claude.on("close", (code) => {
      if (code !== 0) {
        console.error("Claude CLI stderr:", stderr);
        reject(new Error(`Claude CLI exited with code ${code}`));
        return;
      }

      try {
        const response = JSON.parse(stdout);

        // Handle different response formats from Claude CLI
        let content: string;
        if (response.result) {
          content = response.result;
        } else if (response.content) {
          content = response.content;
        } else if (typeof response === "string") {
          content = response;
        } else {
          content = stdout;
        }

        // Extract JSON from potential markdown code blocks
        let jsonStr = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }

        // Find JSON object in response
        const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonStr = objectMatch[0];
        }

        resolve(JSON.parse(jsonStr));
      } catch (err) {
        console.error("Failed to parse Claude response:", stdout);
        reject(new Error("Failed to parse Claude CLI response as JSON"));
      }
    });

    claude.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}

/**
 * Classify a single item
 */
export async function classifyItem(
  item: ClassifiableItem
): Promise<ClassificationResult> {
  const response = await classifyItems([item]);
  return response[0];
}

/**
 * Classify multiple items in a batch
 */
export async function classifyItems(
  items: ClassifiableItem[]
): Promise<ClassificationResult[]> {
  if (items.length === 0) {
    return [];
  }

  const prompt = buildClassificationPrompt(items);
  const response = await invokeClaudeClassifier(prompt);

  // Ensure all items have a classification (fallback for missing)
  return items.map((item) => {
    const found = response.classifications.find((c) => c.id === item.id);
    if (found) {
      return found;
    }

    // Fallback classification
    return {
      id: item.id,
      type: item.type,
      category: "reference" as const,
      priority: "P3" as const,
      confidence: 0.3,
      reason: "Could not classify",
      suggested_next_action: "Review manually",
    };
  });
}

// Re-export types and adapters
export * from "./types.js";
export * from "./adapters.js";
