import type { EmailMessage, EmailClassification } from "../gmail/types.js";

export interface IEmailProvider {
  name: string;
  fetchUnreadEmails(): Promise<EmailMessage[]>;
  processEmailAction(
    id: string,
    label: string,
    archive: boolean
  ): Promise<void>;
  markAsRead(id: string): Promise<void>;
  loadLabels(): Promise<void>;
}

// Re-export types that are shared across providers
export type { EmailMessage, EmailClassification };
