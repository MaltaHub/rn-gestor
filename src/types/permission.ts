// Types related to the permission system
import { Database } from "@/integrations/supabase/types";

// App areas that can have different permission levels
export type AppArea = 'inventory' 
| 'vehicle_details' 
| 'add_vehicle' 
| 'sales' 
| 'edit_vehicle'
| 'advertisements'
| 'pendings';

// Interface for the permission context
export interface PermissionContextType {
  userRole: string | null;
  checkPermission: (area: AppArea, requiredLevel: number) => boolean;
  permissionLevels: Record<AppArea, number>;
  isLoading: boolean;
  createUserProfile: (userId: string, name: string, birthdate?: string) => Promise<void>;
  completeUserProfile: (name: string, birthdate: string) => Promise<boolean>;
  profileExists: boolean;
  roleLevel: number | null;
}

// Enum for user roles (mirrors the Database enum)
export type UserRole = Database['public']['Enums']['user_role'];
