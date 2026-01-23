// Types for People Graph

export type IdentityType = "email" | "phone" | "linkedin_url" | "name_company";

export type IdentitySource =
  | "linkedin_import"
  | "email_ingest"
  | "messages_ingest"
  | "manual_fix";

export type MatchCandidateStatus = "pending" | "approved" | "rejected";

export interface Person {
  id: string;
  display_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  linkedin_profile_url: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  notes: string | null;
  starred: boolean;
  created_at: string;
  updated_at: string;
}

export interface PersonRow {
  id: string;
  display_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  linkedin_profile_url: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  notes: string | null;
  starred: number;
  created_at: string;
  updated_at: string;
}

export interface PersonIdentity {
  id?: number;
  person_id: string;
  identity_type: IdentityType;
  identity_value: string;
  confidence: number;
  source: IdentitySource;
  created_at: string;
}

export interface PersonIdentityRow {
  id: number;
  person_id: string;
  identity_type: string;
  identity_value: string;
  confidence: number;
  source: string;
  created_at: string;
}

export interface ItemPersonMap {
  item_id: string;
  person_id: string;
  match_confidence: number;
  match_reason: string;
  created_at: string;
}

export interface LinkedInConnection {
  id: string;
  person_id: string;
  connected_on: string | null;
  import_batch_id: string;
  raw_data_json: string | null;
  created_at: string;
}

export interface LinkedInMessage {
  id: string;
  conversation_id: string;
  from_person_id: string | null;
  to_person_id: string | null;
  from_name: string | null;
  to_name: string | null;
  from_profile_url: string | null;
  to_profile_url: string | null;
  message_date: string;
  subject: string | null;
  content: string | null;
  folder: string | null;
  import_batch_id: string;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  source: string;
  file_path: string | null;
  file_hash: string | null;
  started_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed";
  stats_json: string | null;
  error_message: string | null;
}

export interface MatchCandidate {
  id?: number;
  person_id: string;
  candidate_person_id: string;
  match_type: string;
  match_value: string;
  confidence: number;
  status: MatchCandidateStatus;
  resolved_at: string | null;
  resolution: string | null;
  created_at: string;
}

// Input types for creating people
export interface NewPerson {
  display_name: string;
  primary_email?: string | null;
  primary_phone?: string | null;
  linkedin_profile_url?: string | null;
  company?: string | null;
  title?: string | null;
  location?: string | null;
}

// Person with relationship context
export interface PersonWithContext extends Person {
  last_interaction_date?: string;
  interaction_count?: number;
  is_linkedin_connection?: boolean;
  connection_date?: string;
}

// For nudge queries
export interface PersonNudge {
  person: Person;
  days_since_interaction: number;
  last_interaction_type: string | null;
  connection_date: string | null;
  reason: string;
}

// Match confidence thresholds
export const MATCH_CONFIDENCE = {
  EXACT_EMAIL: 0.95,
  EXACT_LINKEDIN_URL: 0.95,
  EXACT_PHONE: 0.95,
  NAME_COMPANY_HIGH: 0.75,
  NAME_COMPANY_LOW: 0.60,
  AUTO_MERGE_THRESHOLD: 0.85,
  REVIEW_THRESHOLD: 0.60,
};
