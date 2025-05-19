
// Definição dos tipos para gerenciamento de permissões

// Áreas da aplicação que possuem permissões específicas
export type AppArea = 'inventory' | 'vehicle_details' | 'add_vehicle';

// Roles disponíveis na aplicação
export type UserRoleType = 'Usuário' | 'Vendedor' | 'Gerente' | 'Administrador';

// Contexto de permissões
export interface PermissionContextType {
  // Papel do usuário (Usuário, Vendedor, Gerente, Administrador)
  userRole: string | null;
  
  // Níveis de permissão por área da aplicação
  permissionLevels: Record<AppArea, number>;
  
  // Estado de carregamento das permissões
  isLoading: boolean;
  
  // Indica se o perfil do usuário existe e está completo
  profileExists: boolean;
  
  // Função para verificar se usuário tem permissão para uma área específica
  checkPermission: (area: AppArea, requiredLevel: number) => boolean;
  
  // Função para criar perfil de usuário
  createUserProfile: (userId: string, name: string, birthdate?: string) => Promise<void>;
  
  // Função para completar perfil do usuário
  completeUserProfile: (
    name: string, 
    birthdate: string, 
    bio: string, 
    avatarUrl: string | null, 
    joinDate: string
  ) => Promise<boolean>;
}
