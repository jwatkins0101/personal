// Microsoft Graph API response types

export interface OutlookMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  receivedDateTime: string;
  isRead: boolean;
  categories: string[];
  parentFolderId: string;
}

export interface OutlookMessagesResponse {
  "@odata.context": string;
  "@odata.nextLink"?: string;
  value: OutlookMessage[];
}

export interface OutlookFolder {
  id: string;
  displayName: string;
  parentFolderId: string;
  childFolderCount: number;
  unreadItemCount: number;
  totalItemCount: number;
}

export interface OutlookFoldersResponse {
  "@odata.context": string;
  value: OutlookFolder[];
}

export interface OutlookCategory {
  id: string;
  displayName: string;
  color: string;
}

export interface OutlookCategoriesResponse {
  "@odata.context": string;
  value: OutlookCategory[];
}

export interface OutlookTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresOn: number;
  account?: {
    homeAccountId: string;
    environment: string;
    username: string;
  };
}
