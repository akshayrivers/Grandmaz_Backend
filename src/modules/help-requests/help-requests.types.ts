export type HelpRequestType = "general" | "sos" | "medical" | "tech_support";

export interface HelpRequestRecord {
  id: string;
  deviceId: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateHelpRequestInput {
  title: string;
  description?: string | undefined;
  type: HelpRequestType;
}

export interface ResolveHelpRequestInput {
  status: "resolved" | "in_progress" | "cancelled" | "pending";
  resolvedBy?: string | undefined;
}
