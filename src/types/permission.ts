
export type AppArea = 'inventory' | 'vehicle_details' | 'add_vehicle';

export interface PermissionContextType {
  userRole: string | null;
  permissionLevels: Record<AppArea, number>;
  checkPermission: (area: AppArea, requiredLevel: number) => boolean;
  isLoading: boolean;
  createUserProfile: (userId: string, name: string, birthdate?: string) => Promise<void>;
  completeUserProfile: (name: string, birthdate: string) => Promise<boolean>;
  profileExists: boolean;
}
