import { spawn } from "child_process";
import type { EmailMessage, EmailClassification } from "../gmail/types.js";
import { CATEGORY_LABELS, ARCHIVE_CATEGORIES } from "../config.js";

function buildPrompt(emails: EmailMessage[]): string {
  const emailList = emails
    .map(
      (e, i) =>
        `${i + 1}. ID: ${e.id}
   From: ${e.from}
   Subject: ${e.subject}
   Snippet: ${e.snippet.substring(0, 200)}...
   Date: ${e.date}`
    )
    .join("\n\n");

  return `You are an email classifier. Analyze each email and categorize it.

Categories:
- newsletter: Newsletters, digests, marketing emails, promotional content
- receipt: Order confirmations, receipts, shipping notifications, invoices
- social: Social media notifications (LinkedIn, Twitter, Facebook, etc.)
- work: Work-related emails, important communications from colleagues/clients
- important: Personal important emails, appointments, account security
- spam: Unwanted emails, obvious spam, phishing attempts
- uncategorized: Emails that don't fit other categories clearly

For each email, provide:
1. The category that best fits
2. A brief reason for the classification

Emails to classify:

${emailList}

Respond with ONLY a valid JSON object in this exact format (no markdown, no code blocks):
{
  "classifications": [
    {"id": "email_id", "category": "category_name", "reason": "brief reason"}
  ]
}`;
}

export async function invokeClaudeForClassification(
  emails: EmailMessage[]
): Promise<EmailClassification[]> {
  const prompt = buildPrompt(emails);

  return new Promise((resolve, reject) => {
    const args = [
      "-p", // Print mode (non-interactive)
      prompt,
      "--output-format",
      "json",
      "--model",
      "sonnet", // Use faster model for classification
    ];

    const claude = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"], // Don't need stdin
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
        // Parse the JSON output from Claude
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

        // Extract JSON from the content (might be wrapped in markdown code blocks)
        let jsonStr = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }

        // Try to find JSON object in the response
        const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonStr = objectMatch[0];
        }

        const parsed = JSON.parse(jsonStr);
        const classifications: EmailClassification[] =
          parsed.classifications.map(
            (c: { id: string; category: string; reason?: string }) => ({
              id: c.id,
              category: c.category,
              action: ARCHIVE_CATEGORIES.includes(c.category)
                ? "archive"
                : "keep",
              label:
                CATEGORY_LABELS[c.category] ||
                CATEGORY_LABELS["uncategorized"],
              reason: c.reason,
            })
          );

        resolve(classifications);
      } catch (err) {
        console.error("Failed to parse Claude response:", stdout);
        console.error("Parse error:", err);
        reject(new Error("Failed to parse Claude CLI response as JSON"));
      }
    });

    claude.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}
