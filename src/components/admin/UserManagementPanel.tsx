
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Edit3, Save, X, Users, Hash } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { usePermission } from "@/contexts/PermissionContext";
import { useRoleManagement } from "@/hooks/useRoleManagement";

type UserRole = "Consultor" | "Gestor" | "Gerente" | "Administrador" | "Usuario";

interface EditingUser {
  id: string;
  role: UserRole;
  roleLevel: number;
}

export const UserManagementPanel: React.FC = () => {
  const { users, isLoading, updateUserRole, updateUserRoleLevel } = useRoleManagement();
  const { userRole } = usePermission();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);

  const isAdmin = userRole === "Administrador";

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

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleEditStart = (user: any) => {
    setEditingUser({
      id: user.id,
      role: user.role,
      roleLevel: user.role_level || getRoleLevelByRole(user.role)
    });
  };

  const handleEditCancel = () => {
    setEditingUser(null);
  };

  const handleEditSave = async () => {
    if (!editingUser) return;

    const success = await updateUserRole(editingUser.id, editingUser.role);
    if (success) {
      setEditingUser(null);
    }
  };

  const handleRoleLevelSave = async () => {
    if (!editingUser) return;

    const success = await updateUserRoleLevel(editingUser.id, editingUser.roleLevel);
    if (success) {
      setEditingUser(null);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Administrador': return 'bg-red-100 text-red-800';
      case 'Gerente': return 'bg-blue-100 text-blue-800';
      case 'Gestor': return 'bg-purple-100 text-purple-800';
      case 'Consultor': return 'bg-green-100 text-green-800';
      case 'Usuario': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
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
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Gestão de Usuários ({filteredUsers.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Roles</SelectItem>
              <SelectItem value="Administrador">Administrador</SelectItem>
              <SelectItem value="Gerente">Gerente</SelectItem>
              <SelectItem value="Gestor">Gestor</SelectItem>
              <SelectItem value="Consultor">Consultor</SelectItem>
              <SelectItem value="Usuario">Usuario</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Role Atual</TableHead>
                <TableHead className="text-center">Nível</TableHead>
                <TableHead>Data de Ingresso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="flex items-center gap-3">
                    <UserAvatar
                      src={user.avatar_url}
                      alt={user.name}
                      className="h-8 w-8"
                    />
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {user.birthdate ? new Date(user.birthdate).toLocaleDateString('pt-BR') : 'Data não informada'}
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {editingUser?.id === user.id ? (
                      <Select
                        value={editingUser.role}
                        onValueChange={(value: UserRole) => 
                          setEditingUser({
                            ...editingUser,
                            role: value,
                            roleLevel: getRoleLevelByRole(value)
                          })
                        }
                      >
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
                      <Badge className={getRoleBadgeColor(user.role)}>
                        {user.role}
                      </Badge>
                    )}
                  </TableCell>
                  
                  <TableCell className="text-center">
                    {editingUser?.id === user.id ? (
                      <div className="flex items-center gap-2 justify-center">
                        <Hash className="h-3 w-3 text-muted-foreground" />
                        <Input
                          type="number"
                          min="0"
                          max="9"
                          value={editingUser.roleLevel}
                          onChange={(e) => setEditingUser({
                            ...editingUser,
                            roleLevel: parseInt(e.target.value) || 0
                          })}
                          className="w-16 h-6 text-center text-xs"
                        />
                      </div>
                    ) : (
                      <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                        {user.role_level || getRoleLevelByRole(user.role)}
                      </span>
                    )}
                  </TableCell>
                  
                  <TableCell>
                    {user.join_date ? new Date(user.join_date).toLocaleDateString('pt-BR') : 'N/A'}
                  </TableCell>
                  
                  <TableCell className="text-right">
                    {editingUser?.id === user.id ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={handleEditSave}>
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleEditCancel}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditStart(user)}
                        disabled={!isAdmin}
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p>Nenhum usuário encontrado com os filtros aplicados.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
