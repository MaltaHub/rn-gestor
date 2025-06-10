
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Settings, Save, RefreshCw } from "lucide-react";
import { permissionRules } from "@/utils/permissionRules";
import { AppArea } from "@/types/permission";
import { toast } from "@/components/ui/sonner";
import { usePermissionManagement } from "@/hooks/usePermissionManagement";

type UserRole = "Consultor" | "Gestor" | "Gerente" | "Administrador" | "Usuario";

const roles: UserRole[] = ["Usuario", "Consultor", "Gestor", "Gerente", "Administrador"];
const areas = Object.keys(permissionRules) as AppArea[];

interface PermissionEdit {
  area: AppArea;
  role: UserRole;
  level: number;
}

export const PermissionMatrixPanel: React.FC = () => {
  const { permissions, isLoading, updatePermission, getPermissionLevel, loadPermissions } = usePermissionManagement();
  const [editingPermissions, setEditingPermissions] = useState<PermissionEdit[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const getCurrentLevel = (area: AppArea, role: UserRole): number => {
    // Primeiro tentar do banco, depois do permissionRules
    const dbLevel = getPermissionLevel(area, role);
    if (dbLevel > 0) return dbLevel;
    
    const rule = permissionRules[area];
    return rule?.roles[role] || 0;
  };

  const getEditingLevel = (area: AppArea, role: UserRole): number => {
    const edit = editingPermissions.find(e => e.area === area && e.role === role);
    return edit ? edit.level : getCurrentLevel(area, role);
  };

  const handleLevelChange = (area: AppArea, role: UserRole, newLevel: number) => {
    setEditingPermissions(prev => {
      const existing = prev.findIndex(e => e.area === area && e.role === role);
      const currentLevel = getCurrentLevel(area, role);
      
      if (newLevel === currentLevel) {
        // Remove if reverting to original value
        return prev.filter(e => !(e.area === area && e.role === role));
      }
      
      const newEdit: PermissionEdit = { area, role, level: newLevel };
      
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = newEdit;
        return updated;
      } else {
        return [...prev, newEdit];
      }
    });
    setHasChanges(true);
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      let allSuccess = true;
      
      for (const edit of editingPermissions) {
        const success = await updatePermission(edit.area, edit.role, edit.level);
        if (!success) {
          allSuccess = false;
          break;
        }
      }

      if (allSuccess) {
        toast.success(`${editingPermissions.length} alterações salvas com sucesso!`);
        setEditingPermissions([]);
        setHasChanges(false);
      } else {
        toast.error("Erro ao salvar algumas alterações");
      }
    } catch (error) {
      console.error("Error saving changes:", error);
      toast.error("Erro ao salvar alterações");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetChanges = () => {
    setEditingPermissions([]);
    setHasChanges(false);
    toast.info("Alterações descartadas");
  };

  const getLevelColor = (level: number, hasEdit: boolean) => {
    if (hasEdit) return "bg-yellow-100 border-yellow-300";
    if (level === 0) return "bg-red-50 text-red-700";
    if (level <= 2) return "bg-green-50 text-green-700";
    if (level <= 5) return "bg-blue-50 text-blue-700";
    return "bg-purple-50 text-purple-700";
  };

  const getAreaTypeIcon = (area: AppArea) => {
    const rule = permissionRules[area];
    return rule?.type === "page" ? "📄" : "⚙️";
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Carregando permissões...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Matriz de Permissões
          </CardTitle>
          
          <div className="flex gap-2">
            {hasChanges && (
              <>
                <Button variant="outline" size="sm" onClick={handleResetChanges}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Descartar
                </Button>
                <Button size="sm" onClick={handleSaveChanges} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? "Salvando..." : `Salvar (${editingPermissions.length})`}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p>Configure os níveis de permissão necessários para cada área do sistema por role.</p>
            <p>📄 = Página | ⚙️ = Funcionalidade | 0 = Sem acesso | 1+ = Nível mínimo</p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Área do Sistema</TableHead>
                  <TableHead>Tipo</TableHead>
                  {roles.map(role => (
                    <TableHead key={role} className="text-center min-w-24">
                      {role}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {areas.map(area => (
                  <TableRow key={area}>
                    <TableCell className="font-medium">
                      {area.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </TableCell>
                    
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {getAreaTypeIcon(area)} {permissionRules[area]?.type}
                      </Badge>
                    </TableCell>
                    
                    {roles.map(role => {
                      const currentLevel = getCurrentLevel(area, role);
                      const editingLevel = getEditingLevel(area, role);
                      const hasEdit = editingPermissions.some(e => e.area === area && e.role === role);
                      
                      return (
                        <TableCell key={`${area}-${role}`} className="text-center">
                          <Input
                            type="number"
                            min="0"
                            max="9"
                            value={editingLevel}
                            onChange={(e) => handleLevelChange(area, role, parseInt(e.target.value) || 0)}
                            className={`w-16 h-8 text-center text-sm ${getLevelColor(editingLevel, hasEdit)}`}
                          />
                          {hasEdit && (
                            <div className="text-xs text-yellow-600 mt-1">
                              {currentLevel} → {editingLevel}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Legenda dos Níveis:</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-50 border border-red-200 rounded"></div>
                <span>0 = Sem acesso</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
                <span>1-2 = Visualização</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-50 border border-blue-200 rounded"></div>
                <span>3-5 = Operação</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-purple-50 border border-purple-200 rounded"></div>
                <span>6+ = Administração</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
