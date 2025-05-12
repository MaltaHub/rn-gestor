
export interface Task {
  id: string;
  vehicle_id: string;
  title: string;
  description: string;
  assigned_role: string;
  is_completed: boolean;
  created_at: string;
  completed_at: string | null;
  related_field: string | null;
  field_value: string | null;
  vehicles?: {
    model: string;
    plate: string;
  };
}
