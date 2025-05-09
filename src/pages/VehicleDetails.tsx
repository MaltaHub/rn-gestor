
import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { useVehicles } from "@/contexts/VehicleContext";
import { Vehicle } from "@/types";
import { CalendarDays, MapPin, Calculator, PenLine, Tag, Info, Trash2, ArrowLeft, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const VehicleDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getVehicle, updateVehicle, deleteVehicle } = useVehicles();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const vehicle = getVehicle(id || "");
  
  if (!vehicle) {
    return (
      <div className="content-container py-6">
        <Card>
          <CardContent className="py-10">
            <div className="text-center">
              <h2 className="text-xl font-semibold">Veículo não encontrado</h2>
              <p className="mt-2 text-gray-500">O veículo solicitado não está disponível.</p>
              <Button className="mt-4" onClick={() => navigate('/inventory')}>
                Voltar para Estoque
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const [editedVehicle, setEditedVehicle] = useState<Vehicle>({...vehicle});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setEditedVehicle(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent as keyof Vehicle],
          [child]: value
        }
      }));
    } else if (name === 'price' || name === 'mileage' || name === 'year') {
      setEditedVehicle(prev => ({
        ...prev,
        [name]: Number(value)
      }));
    } else {
      setEditedVehicle(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };
  
  const handleStatusChange = (value: string) => {
    setEditedVehicle(prev => ({
      ...prev,
      status: value as Vehicle['status']
    }));
  };

  const handleUpdate = async () => {
    setIsSaving(true);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    updateVehicle(vehicle.id, editedVehicle);
    setIsEditing(false);
    setIsSaving(false);
  };
  
  const handleDelete = async () => {
    deleteVehicle(vehicle.id);
    navigate('/inventory');
  };

  return (
    <div className="content-container py-6">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/inventory')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao Estoque
        </Button>
      </div>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-2xl">
            {vehicle.model}
          </CardTitle>
          <div className="flex gap-2">
            {!isEditing ? (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsEditing(true)}
                >
                  <PenLine className="mr-2 h-4 w-4" />
                  Editar
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir veículo</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja excluir este veículo? Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                        Sim, excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setIsEditing(false);
                    setEditedVehicle({...vehicle});
                  }}
                >
                  Cancelar
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleUpdate}
                  disabled={isSaving}
                  className="bg-vehicleApp-red hover:bg-red-600"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Alterações"
                  )}
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="h-full max-h-96">
              <img 
                src={isEditing ? editedVehicle.imageUrl : vehicle.imageUrl}
                alt={vehicle.model}
                className="w-full h-full object-cover rounded-lg"
              />
              {isEditing && (
                <div className="mt-2">
                  <Label htmlFor="imageUrl">URL da Imagem</Label>
                  <Input
                    id="imageUrl"
                    name="imageUrl"
                    value={editedVehicle.imageUrl}
                    onChange={handleInputChange}
                    className="mt-1"
                  />
                </div>
              )}
            </div>
            
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Informações Básicas
                </h2>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Placa</Label>
                      {isEditing ? (
                        <Input
                          name="plate"
                          value={editedVehicle.plate}
                          onChange={handleInputChange}
                          className="mt-1"
                        />
                      ) : (
                        <p className="font-medium text-black">{vehicle.plate}</p>
                      )}
                    </div>
                    <div>
                      <Label>Status</Label>
                      {isEditing ? (
                        <Select
                          value={editedVehicle.status}
                          onValueChange={handleStatusChange}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="available">Disponível</SelectItem>
                            <SelectItem value="reserved">Reservado</SelectItem>
                            <SelectItem value="sold">Vendido</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="mt-1">
                          <StatusBadge status={vehicle.status} />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Ano</Label>
                      {isEditing ? (
                        <Input
                          type="number"
                          name="year"
                          value={editedVehicle.year}
                          onChange={handleInputChange}
                          className="mt-1"
                        />
                      ) : (
                        <div className="flex items-center mt-1">
                          <CalendarDays className="h-4 w-4 mr-1 text-vehicleApp-mediumGray" />
                          <span>{vehicle.year}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <Label>Cor</Label>
                      {isEditing ? (
                        <Input
                          name="color"
                          value={editedVehicle.color}
                          onChange={handleInputChange}
                          className="mt-1"
                        />
                      ) : (
                        <div className="flex items-center mt-1">
                          <MapPin className="h-4 w-4 mr-1 text-vehicleApp-mediumGray" />
                          <span>{vehicle.color}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Quilometragem</Label>
                      {isEditing ? (
                        <Input
                          type="number"
                          name="mileage"
                          value={editedVehicle.mileage}
                          onChange={handleInputChange}
                          className="mt-1"
                        />
                      ) : (
                        <div className="flex items-center mt-1">
                          <Calculator className="h-4 w-4 mr-1 text-vehicleApp-mediumGray" />
                          <span>{vehicle.mileage.toLocaleString()} km</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <Label>Preço</Label>
                      {isEditing ? (
                        <Input
                          type="number"
                          name="price"
                          value={editedVehicle.price}
                          onChange={handleInputChange}
                          className="mt-1"
                        />
                      ) : (
                        <div className="flex items-center mt-1">
                          <Tag className="h-4 w-4 mr-1 text-vehicleApp-mediumGray" />
                          <span className={`font-bold ${vehicle.status === 'available' ? 'text-vehicleApp-red' : ''}`}>
                            R$ {vehicle.price.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h2 className="text-lg font-semibold">Especificações</h2>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  <div>
                    <Label>Motor</Label>
                    {isEditing ? (
                      <Input
                        name="specifications.engine"
                        value={editedVehicle.specifications?.engine || ""}
                        onChange={handleInputChange}
                        className="mt-1"
                      />
                    ) : (
                      <p className="text-vehicleApp-darkGray">{vehicle.specifications?.engine || "-"}</p>
                    )}
                  </div>
                  <div>
                    <Label>Transmissão</Label>
                    {isEditing ? (
                      <Input
                        name="specifications.transmission"
                        value={editedVehicle.specifications?.transmission || ""}
                        onChange={handleInputChange}
                        className="mt-1"
                      />
                    ) : (
                      <p className="text-vehicleApp-darkGray">{vehicle.specifications?.transmission || "-"}</p>
                    )}
                  </div>
                  <div>
                    <Label>Combustível</Label>
                    {isEditing ? (
                      <Input
                        name="specifications.fuel"
                        value={editedVehicle.specifications?.fuel || ""}
                        onChange={handleInputChange}
                        className="mt-1"
                      />
                    ) : (
                      <p className="text-vehicleApp-darkGray">{vehicle.specifications?.fuel || "-"}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <Label>Descrição</Label>
            {isEditing ? (
              <Textarea
                name="description"
                value={editedVehicle.description || ""}
                onChange={handleInputChange}
                rows={4}
                className="mt-2"
              />
            ) : (
              <p className="mt-2 text-vehicleApp-darkGray whitespace-pre-line">
                {vehicle.description || "Sem descrição disponível."}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const StatusBadge: React.FC<{ status: Vehicle['status'] }> = ({ status }) => {
  let color: "default" | "secondary" | "destructive" = "default";
  let label = "";
  
  switch (status) {
    case "available":
      color = "default";
      label = "Disponível";
      break;
    case "reserved":
      color = "secondary";
      label = "Reservado";
      break;
    case "sold":
      color = "destructive";
      label = "Vendido";
      break;
  }
  
  return <Badge variant={color}>{label}</Badge>;
};

export default VehicleDetailsPage;
