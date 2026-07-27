export interface TaskRecord {
  id: string;
  deviceId: string;
  createdBy: string | null;
  title: string;
  description: string | null;
  command: string;
  payload: any;
  status: string;
  result: any;
  scheduledAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  deviceId: string;
  title: string;
  command: string;
  description?: string | undefined;
  payload?: any;
  createdBy?: string | undefined;
  scheduledAt?: Date | undefined;
}

export interface UpdateTaskStatusInput {
  status: string;
  result?: any;
}
