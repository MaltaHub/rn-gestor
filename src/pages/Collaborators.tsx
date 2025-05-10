
import React, { useState } from "react";
import { Loader2, Search, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { useCollaborators } from "@/hooks/useCollaborators";

const CollaboratorsPage: React.FC = () => {
  const navigate = useNavigate();
  const { collaborators, isLoading } = useCollaborators();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const filteredCollaborators = collaborators.filter(collaborator => {
    const matchesSearch = collaborator.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "all" || collaborator.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleCollaboratorClick = (id: string) => {
    navigate(`/collaborator/${id}`);
  };

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  return (
    <div className="content-container py-6">
      <h1 className="text-2xl font-bold mb-6">Colaboradores</h1>
      
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar colaborador..."
            className="pl-10 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="w-full md:w-48">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger>
              <div className="flex items-center">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filtrar por cargo" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cargos</SelectItem>
              <SelectItem value="Vendedor">Vendedor</SelectItem>
              <SelectItem value="Gerente">Gerente</SelectItem>
              <SelectItem value="Administrador">Administrador</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredCollaborators.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCollaborators.map((collaborator) => (
            <Card 
              key={collaborator.id} 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleCollaboratorClick(collaborator.id)}
            >
              <CardContent className="p-4 flex items-center">
                <Avatar className="h-12 w-12 mr-4">
                  <AvatarImage src={collaborator.avatarUrl} alt={collaborator.name} />
                  <AvatarFallback className="bg-vehicleApp-red text-white">
                    {getInitials(collaborator.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-medium">{collaborator.name}</h3>
                  <p className="text-sm text-gray-500">{collaborator.role}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-500">Nenhum colaborador encontrado</p>
        </div>
      )}
    </div>
  );
};

export default CollaboratorsPage;
