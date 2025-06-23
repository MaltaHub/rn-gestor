import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Users, Settings, Activity, Info, Lock, Eye } from "lucide-react";
import { UserManagementPanel } from "@/components/admin/UserManagementPanel";
import { PermissionMatrixPanel } from "@/components/admin/PermissionMatrixPanel";
import { AuditLogPanel } from "@/components/admin/AuditLogPanel";
import ProtectedArea from "@/components/ProtectedArea";
import { usePermission } from "@/contexts/PermissionContext";

const AdminPermissions: React.FC = () => {
  const { canEditPermissions, isSuperAdmin, userRole } = usePermission();

  return (
    <ProtectedArea 
      area="admin_panel" 
      requiredLevel={9}
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
          <Card className="w-full max-w-md border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
            <CardContent className="p-8 text-center">
              <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-red-600 mb-2">Acesso Negado</h1>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Apenas Super Administradores podem acessar o painel de permissões.
              </p>
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                Nível mínimo requerido: 9
              </Badge>
            </CardContent>
          </Card>
        </div>
      }
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="container mx-auto px-4 py-6 space-y-6">
          {/* Header Melhorado */}
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <Shield className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      Painel de Controle de Permissões
                    </CardTitle>
                    <p className="text-slate-600 dark:text-slate-400 mt-1">
                      Sistema avançado de gestão de usuários e permissões
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <Lock className="h-3 w-3 mr-1" />
                    Super Admin
                  </Badge>
                  {!canEditPermissions() && (
                    <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                      <Eye className="h-3 w-3 mr-1" />
                      Modo Visualização
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Informações do Sistema */}
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Sistema de Níveis de Permissão</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-3 text-slate-900 dark:text-slate-100">Como Funciona:</h4>
                  <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                      <span><strong>Sistema de Níveis Mínimos:</strong> Usuários com nível igual ou superior ao requerido têm acesso</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                      <span><strong>Hierarquia de Roles:</strong> Administrador (9) → Gerente (8) → Gestor (6) → Consultor (3) → Usuário (1)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                      <span><strong>Edição Restrita:</strong> Apenas Super Administradores (nível 9) podem modificar permissões</span>
                    </li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-3 text-slate-900 dark:text-slate-100">Níveis de Acesso:</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">0</span>
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Sem acesso</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">1-2</span>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Acesso básico</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">3-5</span>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Acesso intermediário</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">6+</span>
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Acesso avançado</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alert para usuários que não podem editar */}
          {!canEditPermissions() && (
            <Alert className="border-orange-200 bg-orange-50">
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>Modo Visualização:</strong> Você está visualizando o painel de administração em modo somente leitura. 
                Seu nível atual: <strong>{userRole}</strong> (nível {isSuperAdmin() ? "9+" : "inferior"})
              </AlertDescription>
            </Alert>
          )}

          {/* Tabs de Funcionalidades */}
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
            <CardContent className="p-6">
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

                <TabsContent value="users" className="space-y-4">
                  <UserManagementPanel />
                </TabsContent>

                <TabsContent value="permissions" className="space-y-4">
                  <PermissionMatrixPanel />
                </TabsContent>

                <TabsContent value="audit" className="space-y-4">
                  <AuditLogPanel />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedArea>
  );
};

export default AdminPermissions;
