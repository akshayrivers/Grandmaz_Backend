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
  deviceId: string;
  title: string;
  description?: string | undefined;
  type?: string | undefined;
}

export interface ResolveHelpRequestInput {
  status: "resolved" | "in_progress" | "cancelled" | "pending";
  resolvedBy?: string | undefined;
}
