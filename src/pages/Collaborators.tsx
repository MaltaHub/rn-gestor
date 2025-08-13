import React, { useState } from "react";
// Componentes de UI (Front)
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// Ícones para UI (Front)
import { Loader2, Users, Edit3, Check, X } from "lucide-react";
// Componente visual para avatar (Front)
import { UserAvatar } from "@/components/ui/user-avatar";
// Hook customizado para buscar e gerenciar colaboradores (Front/Back - integrações)
import { useCollaborators } from "@/hooks/useCollaborators";
// Hook para checagem de permissões do usuário logado (Front/Back)
import { usePermission } from "@/contexts/PermissionContext";
// Componente visual para etiquetas coloridas (Front)
import { Badge } from "@/components/ui/badge";

// Tipagem para os cargos permitidos (Front - definição de tipos)
type UserRole = "Consultor" | "Gestor" | "Gerente" | "Administrador" | "Usuario";

const Collaborators: React.FC = () => {
  // Obtém lista de colaboradores, estado de carregamento e função para atualizar cargos (Front/Back)
  const { collaborators, isLoading, updateRole } = useCollaborators();

  // Função para checar permissões (Front/Back)
  const { checkPermission } = usePermission();

  // Estado local para controlar qual colaborador está sendo editado (Front)
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  // Estado local para armazenar o novo cargo selecionado (Front)
  const [newRole, setNewRole] = useState<UserRole>("Consultor");
  
  // Define se o usuário logado pode editar cargos (Front/Back - baseado em permissão)
  const canEditRoles = checkPermission('inventory', 10); // nível 10 = admin

  // Ativa modo de edição para um colaborador específico (Front)
  const handleEditClick = (userId: string, currentRole: UserRole) => {
    setEditingUserId(userId);
    setNewRole(currentRole);
  };

  // Salva alteração de cargo no backend e reseta estados (Front/Back)
  const handleSaveRole = async () => {
    if (!editingUserId) return;
    
    const success = await updateRole(editingUserId, newRole); // chamada para backend
    if (success) {
      setEditingUserId(null);
      setNewRole("Consultor");
    }
  };

  // Cancela a edição de cargo e restaura valores padrão (Front)
  const handleCancelEdit = () => {
    setEditingUserId(null);
    setNewRole("Consultor");
  };

  // Retorna classes CSS diferentes para cada cargo (Front - estilização dinâmica)
  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Administrador':
        return 'bg-red-100 text-red-800';
      case 'Gerente':
        return 'bg-blue-100 text-blue-800';
      case 'Gestor':
        return 'bg-purple-100 text-purple-800';
      case 'Consultor':
        return 'bg-green-100 text-green-800';
      case 'Usuario':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Formata datas para exibição no padrão brasileiro (Front)
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Não informado";
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  // Se estiver carregando dados, mostra spinner (UI/Front)
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  // Renderização principal da página (UI/Front)
  return (
    <div className="content-container py-6">
      {/* Cabeçalho da seção */}
      <div className="flex items-center space-x-3 mb-6">
        <Users className="h-8 w-8 text-vehicleApp-red" />
        <h1 className="text-3xl font-bold">Colaboradores</h1>
      </div>

      {/* Lista de cartões de colaboradores */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {collaborators.map((collaborator) => (
          <Card key={collaborator.id} className="hover:shadow-lg transition-shadow">
            {/* Cabeçalho do cartão com avatar e nome */}
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <UserAvatar
                  src={collaborator.avatar_url}
                  alt={collaborator.name}
                  className="h-20 w-20"
                />
              </div>
              <CardTitle className="text-lg">{collaborator.name}</CardTitle>
            </CardHeader>

            {/* Corpo do cartão */}
            <CardContent className="space-y-4">
              {/* Campo de cargo */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Cargo:</span>
                {editingUserId === collaborator.id ? (
                  // Modo edição de cargo (UI/Front + atualização no Back)
                  <div className="flex items-center space-x-2">
                    <Select value={newRole} onValueChange={(value: UserRole) => setNewRole(value)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Consultor">Consultor</SelectItem>
                        <SelectItem value="Gestor">Gestor</SelectItem>
                        <SelectItem value="Gerente">Gerente</SelectItem>
                        <SelectItem value="Administrador">Administrador</SelectItem>
                        <SelectItem value="Usuario">Usuario</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={handleSaveRole}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  // Modo visualização do cargo (UI/Front)
                  <div className="flex items-center space-x-2">
                    <Badge className={getRoleBadgeColor(collaborator.role)}>
                      {collaborator.role}
                    </Badge>
                    {canEditRoles && (
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => handleEditClick(collaborator.id, collaborator.role)}
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              
              {/* Datas do colaborador */}
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Data de Nascimento:</span>
                  <span>{formatDate(collaborator.birthdate)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Data de Ingresso:</span>
                  <span>{formatDate(collaborator.join_date)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Caso não haja colaboradores */}
      {collaborators.length === 0 && (
        <div className="text-center py-8">
          <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Nenhum colaborador encontrado</p>
        </div>
      )}
    </div>
  );
};

export default Collaborators;
