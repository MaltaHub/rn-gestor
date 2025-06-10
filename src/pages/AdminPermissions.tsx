
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Users, Settings, Activity } from "lucide-react";
import { UserManagementPanel } from "@/components/admin/UserManagementPanel";
import { PermissionMatrixPanel } from "@/components/admin/PermissionMatrixPanel";
import { AuditLogPanel } from "@/components/admin/AuditLogPanel";
import ProtectedArea from "@/components/ProtectedArea";

const AdminPermissions: React.FC = () => {
  return (
    <ProtectedArea 
      area="inventory" 
      requiredLevel={10}
      fallback={
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold text-red-600">Acesso Negado</h1>
          <p className="text-gray-700">Apenas Administradores podem acessar o painel de permissões.</p>
        </div>
      }
    >
      <div className="content-container py-6">
        <div className="flex items-center space-x-3 mb-6">
          <Shield className="h-8 w-8 text-vehicleApp-red" />
          <h1 className="text-3xl font-bold">Painel de Controle de Permissões</h1>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Sistema de Gestão de Permissões</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Gerencie usuários, roles e permissões do sistema. Todas as alterações são registradas para auditoria.
            </p>
          </CardContent>
        </Card>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Gestão de Usuários
            </TabsTrigger>
            <TabsTrigger value="permissions" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Matriz de Permissões
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Auditoria
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <UserManagementPanel />
          </TabsContent>

          <TabsContent value="permissions">
            <PermissionMatrixPanel />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogPanel />
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedArea>
  );
};

export default AdminPermissions;
