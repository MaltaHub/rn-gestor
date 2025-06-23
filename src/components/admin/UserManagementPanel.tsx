import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Edit3, Save, X, Users, Hash, Shield, Eye } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { usePermission } from "@/contexts/PermissionContext";
import { useRoleManagement } from "@/hooks/useRoleManagement";
import { toast } from "@/components/ui/sonner";

type UserRole = "Consultor" | "Gestor" | "Gerente" | "Administrador" | "Usuario";

interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  role_level: number;
  birthdate?: string;
  join_date?: string;
  avatar_url?: string;
}

interface EditingUser {
  id: string;
  role: UserRole;
  roleLevel: number;
  originalRole: UserRole;
  originalRoleLevel: number;
}

export const UserManagementPanel: React.FC = () => {
  const { users, isLoading, updateUserRole, updateUserRoleLevel } = useRoleManagement();
  const { userRole, canEditPermissions, isSuperAdmin } = usePermission();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);

  const getRoleLevelByRole = (role: UserRole): number => {
    switch (role) {
      case "Administrador": return 9;
      case "Gerente": return 8;
      case "Gestor": return 6;
      case "Consultor": return 3;
      case "Usuario": return 1;
      default: return 0;
    }
  };

  const getRoleColor = (role: UserRole): string => {
    switch (role) {
      case "Administrador": return "bg-red-100 text-red-700";
      case "Gerente": return "bg-purple-100 text-purple-700";
      case "Gestor": return "bg-blue-100 text-blue-700";
      case "Consultor": return "bg-green-100 text-green-700";
      case "Usuario": return "bg-gray-100 text-gray-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleEditStart = (user: UserProfile) => {
    if (!canEditPermissions()) {
      toast.error("Apenas Super Administradores podem editar roles de usuários");
      return;
    }

    const currentRoleLevel = user.role_level || getRoleLevelByRole(user.role);
    setEditingUser({
      id: user.id,
      role: user.role,
      roleLevel: currentRoleLevel,
      originalRole: user.role,
      originalRoleLevel: currentRoleLevel
    });
  };

  const handleEditCancel = () => {
    setEditingUser(null);
  };

  const handleEditSave = async () => {
    if (!editingUser || !canEditPermissions()) {
      toast.error("Apenas Super Administradores podem salvar alterações");
      return;
    }

    try {
      const success = await updateUserRole(editingUser.id, editingUser.role);
      if (success) {
        await updateUserRoleLevel(editingUser.id, editingUser.roleLevel);
        setEditingUser(null);
        toast.success("Usuário atualizado com sucesso!");
      }
    } catch (error) {
      console.error("Error updating user:", error);
      toast.error("Erro ao atualizar usuário");
    }
  };

  const handleRoleChange = (newRole: UserRole) => {
    if (!editingUser) return;
    
    const newRoleLevel = getRoleLevelByRole(newRole);
    setEditingUser({
      ...editingUser,
      role: newRole,
      roleLevel: newRoleLevel
    });
  };

  const handleRoleLevelChange = (newLevel: number) => {
    if (!editingUser) return;
    
    setEditingUser({
      ...editingUser,
      roleLevel: newLevel
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Carregando usuários...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <CardTitle>Gestão de Usuários</CardTitle>
            {!canEditPermissions() && (
              <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                <Eye className="h-3 w-3 mr-1" />
                Modo Visualização
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* Alert para usuários que não podem editar */}
          {!canEditPermissions() && (
            <Alert className="border-orange-200 bg-orange-50">
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>Modo Visualização:</strong> Apenas Super Administradores (nível 9) podem editar roles de usuários. 
                Seu nível atual: <strong>{userRole}</strong> (nível {isSuperAdmin() ? "9+" : "inferior"})
              </AlertDescription>
            </Alert>
          )}

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Buscar por nome ou role..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filtrar por role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os roles</SelectItem>
                <SelectItem value="Administrador">Administrador</SelectItem>
                <SelectItem value="Gerente">Gerente</SelectItem>
                <SelectItem value="Gestor">Gestor</SelectItem>
                <SelectItem value="Consultor">Consultor</SelectItem>
                <SelectItem value="Usuario">Usuario</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tabela de usuários */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Nível</TableHead>
                  <TableHead>Data de Criação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar 
                          src={user.avatar_url} 
                          alt={user.name}
                          className="h-8 w-8"
                        />
                        <div>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm text-gray-500">ID: {user.id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      {editingUser?.id === user.id ? (
                        <Select value={editingUser.role} onValueChange={handleRoleChange}>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Usuario">Usuario</SelectItem>
                            <SelectItem value="Consultor">Consultor</SelectItem>
                            <SelectItem value="Gestor">Gestor</SelectItem>
                            <SelectItem value="Gerente">Gerente</SelectItem>
                            <SelectItem value="Administrador">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={getRoleColor(user.role)}>
                          {user.role}
                        </Badge>
                      )}
                    </TableCell>
                    
                    <TableCell>
                      {editingUser?.id === user.id ? (
                        <Input
                          type="number"
                          min="1"
                          max="9"
                          value={editingUser.roleLevel}
                          onChange={(e) => handleRoleLevelChange(parseInt(e.target.value) || 1)}
                          className="w-16"
                        />
                      ) : (
                        <Badge variant="outline">
                          <Hash className="h-3 w-3 mr-1" />
                          {user.role_level || getRoleLevelByRole(user.role)}
                        </Badge>
                      )}
                    </TableCell>
                    
                    <TableCell className="text-sm text-gray-500">
                      {user.join_date ? new Date(user.join_date).toLocaleDateString('pt-BR') : 'N/A'}
                    </TableCell>
                    
                    <TableCell className="text-right">
                      {editingUser?.id === user.id ? (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" onClick={handleEditSave}>
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleEditCancel}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleEditStart(user)}
                          disabled={!canEditPermissions()}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Estatísticas */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{users.filter(u => u.role === 'Administrador').length}</div>
              <div className="text-sm text-gray-500">Administradores</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{users.filter(u => u.role === 'Gerente').length}</div>
              <div className="text-sm text-gray-500">Gerentes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{users.filter(u => u.role === 'Gestor').length}</div>
              <div className="text-sm text-gray-500">Gestores</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{users.filter(u => u.role === 'Consultor').length}</div>
              <div className="text-sm text-gray-500">Consultores</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{users.filter(u => u.role === 'Usuario').length}</div>
              <div className="text-sm text-gray-500">Usuários</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
