import { Client } from "@microsoft/microsoft-graph-client";
import { getAccessToken } from "./auth.js";
import type { EmailMessage } from "../gmail/types.js";
import type {
  OutlookMessage,
  OutlookMessagesResponse,
  OutlookFolder,
  OutlookFoldersResponse,
  OutlookCategory,
  OutlookCategoriesResponse,
} from "./types.js";
import type { IEmailProvider } from "../providers/types.js";
import { MAX_EMAILS_PER_RUN, LABEL_PREFIX } from "../config.js";

let graphClient: Client | null = null;
let categoryCache: Map<string, string> = new Map();
let archiveFolderId: string | null = null;

async function getGraphClient(): Promise<Client> {
  if (!graphClient) {
    const accessToken = await getAccessToken();
    graphClient = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });
  }
  return graphClient;
}

// Reset the client (useful for token refresh)
export function resetClient(): void {
  graphClient = null;
}

export async function fetchUnreadEmails(): Promise<EmailMessage[]> {
  const client = await getGraphClient();

  try {
    const response: OutlookMessagesResponse = await client
      .api("/me/messages")
      .filter("isRead eq false")
      .top(MAX_EMAILS_PER_RUN)
      .select(
        "id,conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime,isRead,categories,parentFolderId"
      )
      .orderby("receivedDateTime desc")
      .get();

    const messages = response.value || [];

    return messages.map((msg: OutlookMessage) => ({
      id: msg.id,
      threadId: msg.conversationId,
      from: msg.from?.emailAddress?.address || "",
      to: msg.toRecipients?.[0]?.emailAddress?.address || "",
      subject: msg.subject || "(No subject)",
      snippet: msg.bodyPreview || "",
      date: msg.receivedDateTime,
      labels: msg.categories || [],
    }));
  } catch (err) {
    // If token expired, reset client and retry once
    if (
      err instanceof Error &&
      (err.message.includes("401") || err.message.includes("InvalidAuthenticationToken"))
    ) {
      console.log("Token may have expired, refreshing...");
      resetClient();
      const client = await getGraphClient();
      const response: OutlookMessagesResponse = await client
        .api("/me/messages")
        .filter("isRead eq false")
        .top(MAX_EMAILS_PER_RUN)
        .select(
          "id,conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime,isRead,categories,parentFolderId"
        )
        .orderby("receivedDateTime desc")
        .get();

      const messages = response.value || [];

      return messages.map((msg: OutlookMessage) => ({
        id: msg.id,
        threadId: msg.conversationId,
        from: msg.from?.emailAddress?.address || "",
        to: msg.toRecipients?.[0]?.emailAddress?.address || "",
        subject: msg.subject || "(No subject)",
        snippet: msg.bodyPreview || "",
        date: msg.receivedDateTime,
        labels: msg.categories || [],
      }));
    }
    throw err;
  }
}

export async function loadLabels(): Promise<void> {
  const client = await getGraphClient();

  // Load categories (Outlook's version of labels)
  const categoriesResponse: OutlookCategoriesResponse = await client
    .api("/me/outlook/masterCategories")
    .get();

  categoryCache.clear();
  for (const category of categoriesResponse.value || []) {
    categoryCache.set(category.displayName, category.id);
  }

  // Find the Archive folder
  const foldersResponse: OutlookFoldersResponse = await client
    .api("/me/mailFolders")
    .get();

  const archiveFolder = foldersResponse.value.find(
    (f: OutlookFolder) => f.displayName === "Archive"
  );
  archiveFolderId = archiveFolder?.id || null;

  console.log(
    `Loaded ${categoryCache.size} Outlook categories, Archive folder: ${archiveFolderId ? "found" : "not found"}`
  );
}

async function ensureCategoryExists(categoryName: string): Promise<string> {
  // Check cache first
  if (categoryCache.has(categoryName)) {
    return categoryCache.get(categoryName)!;
  }

  const client = await getGraphClient();

  // Try to create the category
  try {
    const response: OutlookCategory = await client
      .api("/me/outlook/masterCategories")
      .post({
        displayName: categoryName,
        color: "preset0", // Blue by default
      });

    categoryCache.set(categoryName, response.id);
    console.log(`Created Outlook category: ${categoryName}`);
    return response.id;
  } catch (err) {
    // Category might already exist (race condition or cache miss)
    if (err instanceof Error && err.message.includes("already exists")) {
      // Reload categories and try again
      await loadLabels();
      if (categoryCache.has(categoryName)) {
        return categoryCache.get(categoryName)!;
      }
    }
    throw err;
  }
}

// Convert Gmail-style label to Outlook category name
function labelToCategoryName(label: string): string {
  // Convert "auto/newsletters" to "Auto - Newsletters"
  return label
    .split("/")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" - ");
}

export async function applyCategory(
  messageId: string,
  labelName: string
): Promise<void> {
  const client = await getGraphClient();
  const categoryName = labelToCategoryName(labelName);

  // Ensure the category exists
  await ensureCategoryExists(categoryName);

  // Get current categories
  const message: OutlookMessage = await client
    .api(`/me/messages/${messageId}`)
    .select("categories")
    .get();

  const currentCategories = message.categories || [];

  // Add new category if not already present
  if (!currentCategories.includes(categoryName)) {
    await client.api(`/me/messages/${messageId}`).patch({
      categories: [...currentCategories, categoryName],
    });
  }
}

export async function archiveMessage(messageId: string): Promise<void> {
  const client = await getGraphClient();

  if (!archiveFolderId) {
    // Try to find or create archive folder
    const foldersResponse: OutlookFoldersResponse = await client
      .api("/me/mailFolders")
      .get();

    const archiveFolder = foldersResponse.value.find(
      (f: OutlookFolder) => f.displayName === "Archive"
    );

    if (archiveFolder) {
      archiveFolderId = archiveFolder.id;
    } else {
      // Create Archive folder if it doesn't exist
      const newFolder: OutlookFolder = await client
        .api("/me/mailFolders")
        .post({ displayName: "Archive" });
      archiveFolderId = newFolder.id;
      console.log("Created Archive folder in Outlook");
    }
  }

  // Move message to Archive
  await client.api(`/me/messages/${messageId}/move`).post({
    destinationId: archiveFolderId,
  });
}

export async function processEmailAction(
  messageId: string,
  labelName: string,
  shouldArchive: boolean
): Promise<void> {
  // Apply category
  await applyCategory(messageId, labelName);

  // Archive if needed
  if (shouldArchive) {
    await archiveMessage(messageId);
  }
}

export async function markAsRead(messageId: string): Promise<void> {
  const client = await getGraphClient();

  await client.api(`/me/messages/${messageId}`).patch({
    isRead: true,
  });
}

// Export as IEmailProvider implementation
export const outlookProvider: IEmailProvider = {
  name: "outlook",
  fetchUnreadEmails,
  processEmailAction,
  markAsRead,
  loadLabels,
};
