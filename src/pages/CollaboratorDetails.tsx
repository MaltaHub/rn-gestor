
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCollaborator } from "@/hooks/useCollaborator";
import { useVehicles } from "@/contexts/VehicleContext";
import { 
  ArrowLeft, 
  Calendar, 
  Mail, 
  User,
  Clock,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableRow, 
  TableHead, 
  TableCell 
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const CollaboratorDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { collaborator, isLoading } = useCollaborator(id || "");
  const { vehicles } = useVehicles();
  const [fieldFilter, setFieldFilter] = useState<string>("all");
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  
  useEffect(() => {
    // Simular histórico de alterações para o colaborador
    // Em uma implementação real, isso viria do backend
    if (collaborator && vehicles.length > 0) {
      const simulatedHistory = [
        {
          id: "1",
          fieldName: "price",
          oldValue: "45000",
          newValue: "43000",
          date: "2025-04-05T14:30:00",
          vehicleId: vehicles[0]?.id,
          vehiclePlate: vehicles[0]?.plate,
          vehicleModel: vehicles[0]?.model
        },
        {
          id: "2",
          fieldName: "status",
          oldValue: "Disponível",
          newValue: "Vendido",
          date: "2025-04-10T09:15:00",
          vehicleId: vehicles[0]?.id,
          vehiclePlate: vehicles[0]?.plate,
          vehicleModel: vehicles[0]?.model
        },
        {
          id: "3",
          fieldName: "description",
          oldValue: "Carro em bom estado",
          newValue: "Carro em excelente estado, revisado",
          date: "2025-04-15T11:45:00",
          vehicleId: vehicles[1]?.id || vehicles[0]?.id,
          vehiclePlate: vehicles[1]?.plate || vehicles[0]?.plate,
          vehicleModel: vehicles[1]?.model || vehicles[0]?.model
        }
      ];
      
      setHistoryItems(simulatedHistory);
    }
  }, [collaborator, vehicles]);
  
  const filteredHistory = historyItems.filter(item => {
    return fieldFilter === "all" || item.fieldName === fieldFilter;
  });
  
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };
  
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric'
    });
  };
  
  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  if (!collaborator) {
    return (
      <div className="content-container py-6">
        <Button 
          variant="outline" 
          onClick={() => navigate('/collaborators')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">Colaborador não encontrado</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="content-container py-6">
      <Button 
        variant="outline" 
        onClick={() => navigate('/collaborators')}
        className="mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Colaboradores
      </Button>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card>
            <CardContent className="p-6 flex flex-col items-center">
              <Avatar className="h-24 w-24 mb-4 mt-4">
                <AvatarImage src={collaborator.avatarUrl} alt={collaborator.name} />
                <AvatarFallback className="bg-vehicleApp-red text-white text-xl">
                  {getInitials(collaborator.name)}
                </AvatarFallback>
              </Avatar>
              
              <h2 className="text-2xl font-bold mb-1">{collaborator.name}</h2>
              <Badge className="mb-4">{collaborator.role}</Badge>
              
              <div className="w-full space-y-4 mt-2">
                <div className="flex items-center">
                  <Mail className="h-5 w-5 mr-3 text-gray-500" />
                  <span>{collaborator.email}</span>
                </div>
                
                <div className="flex items-center">
                  <Calendar className="h-5 w-5 mr-3 text-gray-500" />
                  <span>Nascimento: {collaborator.birthdate ? formatDate(collaborator.birthdate) : "Não informado"}</span>
                </div>
                
                <div className="flex items-center">
                  <Clock className="h-5 w-5 mr-3 text-gray-500" />
                  <span>Data de entrada: {formatDate(collaborator.joinDate || "2024-01-15")}</span>
                </div>
              </div>
              
              {collaborator.bio && (
                <div className="w-full mt-6">
                  <h3 className="font-medium mb-2 flex items-center">
                    <FileText className="h-4 w-4 mr-2" />
                    Biografia
                  </h3>
                  <p className="text-gray-600">{collaborator.bio}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        <div className="md:col-span-2">
          <Card className="mb-6">
            <CardHeader className="pb-0">
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl">Histórico de Alterações</CardTitle>
                <div className="w-48">
                  <Select value={fieldFilter} onValueChange={setFieldFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filtrar por campo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os campos</SelectItem>
                      <SelectItem value="price">Preço</SelectItem>
                      <SelectItem value="status">Status</SelectItem>
                      <SelectItem value="description">Descrição</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {filteredHistory.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Campo</TableHead>
                      <TableHead>Veículo</TableHead>
                      <TableHead>Alteração</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{formatDate(item.date)}</div>
                          <div className="text-xs text-gray-500">{formatTime(item.date)}</div>
                        </TableCell>
                        <TableCell className="capitalize">{item.fieldName}</TableCell>
                        <TableCell>
                          <Button 
                            variant="link" 
                            className="p-0 h-auto"
                            onClick={() => navigate(`/vehicle/${item.vehicleId}`)}
                          >
                            {item.vehicleModel} ({item.vehiclePlate})
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <div className="flex items-center">
                              <span className="text-gray-500 text-sm">De:</span>
                              <span className="ml-1 text-sm">{item.oldValue}</span>
                            </div>
                            <div className="flex items-center">
                              <span className="text-gray-500 text-sm">Para:</span>
                              <span className="ml-1 text-sm font-medium">{item.newValue}</span>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-6">
                  <p className="text-gray-500">Nenhum histórico encontrado</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Estatísticas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-gray-500 text-sm mb-1">Total de veículos cadastrados</div>
                  <div className="text-2xl font-bold">{Math.floor(Math.random() * 30) + 5}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-gray-500 text-sm mb-1">Veículos vendidos</div>
                  <div className="text-2xl font-bold">{Math.floor(Math.random() * 20) + 2}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-gray-500 text-sm mb-1">Alterações no último mês</div>
                  <div className="text-2xl font-bold">{Math.floor(Math.random() * 50) + 10}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-gray-500 text-sm mb-1">Taxa de conversão</div>
                  <div className="text-2xl font-bold">{Math.floor(Math.random() * 30) + 50}%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CollaboratorDetails;
