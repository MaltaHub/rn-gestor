
import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCollaborator } from "@/hooks/useCollaborator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ArrowLeft, User, Clock, Calendar, Briefcase, FileText } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { CollaboratorHistory } from "@/components/collaborator/CollaboratorHistory";
import { usePermission } from "@/contexts/PermissionContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";
import { UserRoleType } from "@/types/permission";

const CollaboratorDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { collaborator, isLoading } = useCollaborator(id || "");
  const navigate = useNavigate();
  const { userRole } = usePermission();
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  
  // Check if the current user is a manager (Gerente or Administrador)
  const isManager = userRole === 'Gerente' || userRole === 'Administrador';
  const isAdmin = userRole === 'Administrador';
  
  const handleRoleChange = async (newRole: UserRoleType) => {
    if (!id || !isManager) return;
    
    try {
      setIsUpdatingRole(true);
      
      // Administradores não podem ser alterados por ninguém
      if (collaborator?.role === 'Administrador') {
        toast.error("Não é possível alterar o cargo de um Administrador");
        return;
      }
      
      // Gerentes só podem ser alterados por Administradores
      if (collaborator?.role === 'Gerente' && userRole !== 'Administrador') {
        toast.error("Apenas Administradores podem alterar o cargo de um Gerente");
        return;
      }
      
      // Gerente não pode promover alguém para Administrador
      if (newRole === 'Administrador' && userRole !== 'Administrador') {
        toast.error("Apenas Administradores podem definir o cargo de Administrador");
        return;
      }
      
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', id);
      
      if (error) {
        console.error("Erro ao atualizar cargo:", error);
        toast.error("Erro ao atualizar cargo do colaborador");
        return;
      }
      
      toast.success(`Cargo atualizado para ${newRole}`);
      
      // Reload page to refresh data
      window.location.reload();
    } catch (err) {
      console.error("Erro ao atualizar cargo:", err);
      toast.error("Erro ao atualizar cargo do colaborador");
    } finally {
      setIsUpdatingRole(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="content-container py-6">
        <Card>
          <CardContent className="py-8">
            <div className="flex justify-center">
              <div className="animate-pulse h-20 w-20 rounded-full bg-vehicleApp-lightGray"></div>
            </div>
            <div className="mt-4 flex justify-center">
              <div className="animate-pulse h-8 w-40 rounded bg-vehicleApp-lightGray"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!collaborator) {
    return (
      <div className="content-container py-6">
        <Card>
          <CardContent className="py-8 text-center">
            <h2 className="text-xl font-bold">Colaborador não encontrado</h2>
            <p className="text-vehicleApp-mediumGray mt-2">
              O colaborador solicitado não foi encontrado ou não existe.
            </p>
            <Button 
              variant="link" 
              onClick={() => navigate('/collaborators')}
              className="mt-4"
            >
              Voltar para Lista de Colaboradores
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Generate avatar fallback from name
  const getInitials = (name: string) => {
    return name.split(' ')
      .map(part => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };
  
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd/MM/yyyy');
  };

  return (
    <div className="content-container py-6">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/collaborators')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para Equipe
        </Button>
      </div>
      
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {collaborator?.avatarUrl ? (
                <AvatarImage src={collaborator.avatarUrl} alt={collaborator.name} />
              ) : null}
              <AvatarFallback className="text-lg bg-vehicleApp-lightRed text-vehicleApp-red">
                {collaborator ? getInitials(collaborator.name) : ''}
              </AvatarFallback>
            </Avatar>
            
            <div>
              <CardTitle className="text-2xl">{collaborator?.name}</CardTitle>
              <p className="text-vehicleApp-mediumGray">
                {collaborator?.role}
              </p>
            </div>
          </div>
        </CardHeader>
        
        <Tabs defaultValue="profile" className="px-6 pb-6">
          <TabsList className="mb-4">
            <TabsTrigger value="profile">Perfil</TabsTrigger>
            {isManager && id && <TabsTrigger value="history">Histórico</TabsTrigger>}
          </TabsList>
          
          <TabsContent value="profile">
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Calendar className="text-vehicleApp-red h-5 w-5" />
                    <div>
                      <p className="text-sm text-vehicleApp-mediumGray">Data de Início</p>
                      <p className="font-medium">
                        {collaborator?.joinDate ? formatDate(collaborator.joinDate) : "N/A"}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Briefcase className="text-vehicleApp-red h-5 w-5" />
                    <div className="w-full">
                      <p className="text-sm text-vehicleApp-mediumGray">Cargo</p>
                      
                      {isManager ? (
                        <div className="mt-1 max-w-xs">
                          <Select 
                            value={collaborator?.role as UserRoleType}
                            onValueChange={(value: UserRoleType) => handleRoleChange(value)}
                            disabled={
                              isUpdatingRole || 
                              (collaborator?.role === 'Administrador') || 
                              (collaborator?.role === 'Gerente' && !isAdmin) ||
                              (!isAdmin && collaborator?.role === 'Vendedor' && collaborator?.role === 'Vendedor')
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={collaborator?.role || ''} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Vendedor">Vendedor</SelectItem>
                              {isAdmin && <SelectItem value="Gerente">Gerente</SelectItem>}
                              {isAdmin && <SelectItem value="Administrador">Administrador</SelectItem>}
                            </SelectContent>
                          </Select>
                          {isUpdatingRole && (
                            <div className="flex items-center mt-2 text-sm text-vehicleApp-mediumGray">
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              Atualizando...
                            </div>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {isAdmin 
                              ? "Administradores podem alterar qualquer cargo."
                              : "Gerentes só podem alterar cargos de Vendedores."}
                          </p>
                        </div>
                      ) : (
                        <p className="font-medium">{collaborator?.role}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="text-vehicleApp-red h-5 w-5" />
                  <p className="font-medium">Bio</p>
                </div>
                <p className="text-vehicleApp-darkGray pl-8">
                  {collaborator?.bio || "Nenhuma biografia disponível."}
                </p>
              </div>
            </CardContent>
          </TabsContent>
          
          {isManager && id && (
            <TabsContent value="history">
              <CardContent>
                <CollaboratorHistory collaboratorId={id} />
              </CardContent>
            </TabsContent>
          )}
        </Tabs>
      </Card>
    </div>
  );
};

export default CollaboratorDetailsPage;
