
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Activity, Search, Download, Filter } from "lucide-react";

interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  target: string;
  details: string;
  ip: string;
  status: 'success' | 'failed' | 'warning';
}

// Dados mockados para demonstração
const mockAuditLogs: AuditLogEntry[] = [
  {
    id: "1",
    timestamp: "2025-01-10 14:30:22",
    user: "Admin Sistema",
    action: "UPDATE_USER_ROLE",
    target: "João Silva",
    details: "Role alterado de Consultor para Gestor",
    ip: "192.168.1.100",
    status: "success"
  },
  {
    id: "2",
    timestamp: "2025-01-10 14:25:15",
    user: "Admin Sistema",
    action: "UPDATE_PERMISSION",
    target: "Area: inventory, Role: Consultor",
    details: "Nível alterado de 1 para 2",
    ip: "192.168.1.100",
    status: "success"
  },
  {
    id: "3",
    timestamp: "2025-01-10 14:20:08",
    user: "Maria Santos",
    action: "ACCESS_DENIED",
    target: "Painel Administrativo",
    details: "Tentativa de acesso negada - Role insuficiente",
    ip: "192.168.1.105",
    status: "failed"
  },
  {
    id: "4",
    timestamp: "2025-01-10 14:15:33",
    user: "Admin Sistema",
    action: "BULK_UPDATE_ROLES",
    target: "5 usuários",
    details: "Atualização em massa de roles - Projeto migração",
    ip: "192.168.1.100",
    status: "warning"
  },
  {
    id: "5",
    timestamp: "2025-01-10 13:45:12",
    user: "Pedro Costa",
    action: "LOGIN_ATTEMPT",
    target: "Sistema",
    details: "Login bem-sucedido",
    ip: "192.168.1.110",
    status: "success"
  }
];

export const AuditLogPanel: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredLogs = mockAuditLogs.filter(log => {
    const matchesSearch = 
      log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.target.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAction = actionFilter === "all" || log.action.includes(actionFilter);
    const matchesStatus = statusFilter === "all" || log.status === statusFilter;
    
    return matchesSearch && matchesAction && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800">Sucesso</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Falha</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-800">Aviso</Badge>;
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const getActionDescription = (action: string) => {
    switch (action) {
      case 'UPDATE_USER_ROLE': return 'Alteração de Role';
      case 'UPDATE_PERMISSION': return 'Alteração de Permissão';
      case 'ACCESS_DENIED': return 'Acesso Negado';
      case 'BULK_UPDATE_ROLES': return 'Atualização em Massa';
      case 'LOGIN_ATTEMPT': return 'Tentativa de Login';
      default: return action;
    }
  };

  const handleExportLogs = () => {
    // In a real implementation, this would generate and download a CSV/Excel file
    console.log("Exportando logs...", filteredLogs);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Log de Auditoria ({filteredLogs.length})
          </CardTitle>
          
          <Button variant="outline" size="sm" onClick={handleExportLogs}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              placeholder="Buscar por usuário, ação, target..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-48">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Tipo de Ação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Ações</SelectItem>
              <SelectItem value="UPDATE">Atualizações</SelectItem>
              <SelectItem value="ACCESS">Acessos</SelectItem>
              <SelectItem value="LOGIN">Logins</SelectItem>
              <SelectItem value="BULK">Operações em Massa</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="success">Sucesso</SelectItem>
              <SelectItem value="failed">Falha</SelectItem>
              <SelectItem value="warning">Aviso</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Alvo</TableHead>
                <TableHead>Detalhes</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-sm">
                    {log.timestamp}
                  </TableCell>
                  
                  <TableCell className="font-medium">
                    {log.user}
                  </TableCell>
                  
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {getActionDescription(log.action)}
                    </Badge>
                  </TableCell>
                  
                  <TableCell>
                    {log.target}
                  </TableCell>
                  
                  <TableCell className="max-w-xs">
                    <div className="truncate" title={log.details}>
                      {log.details}
                    </div>
                  </TableCell>
                  
                  <TableCell className="font-mono text-sm">
                    {log.ip}
                  </TableCell>
                  
                  <TableCell>
                    {getStatusBadge(log.status)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p>Nenhum log encontrado com os filtros aplicados.</p>
          </div>
        )}

        <div className="mt-6 p-4 bg-muted rounded-lg">
          <h4 className="font-medium mb-2">Informações do Log:</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium">Retenção:</span> 90 dias
            </div>
            <div>
              <span className="font-medium">Última atualização:</span> Tempo real
            </div>
            <div>
              <span className="font-medium">Total de registros:</span> {mockAuditLogs.length}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
