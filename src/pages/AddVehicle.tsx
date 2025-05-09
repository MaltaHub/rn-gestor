
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useVehicles } from "@/contexts/VehicleContext";
import { Vehicle } from "@/types";
import { useForm } from "react-hook-form";
import { Loader2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type VehicleFormData = Omit<Vehicle, 'id' | 'addedAt' | 'status'>;

const AddVehiclePage: React.FC = () => {
  const navigate = useNavigate();
  const { addVehicle } = useVehicles();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);
  const { toast } = useToast();
  
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<VehicleFormData>({
    defaultValues: {
      plate: "",
      model: "",
      color: "",
      mileage: 0,
      imageUrl: "",
      price: 0,
      year: new Date().getFullYear(),
      description: "",
      specifications: {
        engine: "",
        transmission: "",
        fuel: ""
      }
    }
  });

  const watchPlate = watch("plate");
  
  const searchPlateInfo = async () => {
    if (!watchPlate || watchPlate.length < 6) {
      toast({
        title: "Placa inválida",
        description: "Por favor, insira uma placa válida",
        variant: "destructive",
      });
      return;
    }
    
    setIsSearching(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('info-placas', {
        body: { placa: watchPlate }
      });
      
      if (error) throw error;
      
      if (data.success) {
        // Preenche os campos com os dados retornados
        if (data.model) setValue("model", data.model);
        if (data.year) setValue("year", data.year);
        if (data.color) setValue("color", data.color);
        
        toast({
          title: "Informações encontradas",
          description: "Os campos foram preenchidos com os dados do veículo",
        });
      } else {
        toast({
          title: "Veículo não encontrado",
          description: "Não foi possível encontrar informações para esta placa",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Erro ao buscar informações da placa:", error);
      toast({
        title: "Erro na busca",
        description: "Não foi possível obter informações para esta placa",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const onSubmit = async (data: VehicleFormData) => {
    setIsSubmitting(true);
    
    try {
      await addVehicle({
        ...data,
        status: 'available'
      });
      
      toast({
        title: "Veículo adicionado",
        description: "O veículo foi adicionado com sucesso ao inventário",
      });
      
      navigate('/inventory');
    } catch (error) {
      console.error("Erro ao adicionar veículo:", error);
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o veículo",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="content-container py-6">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Adicionar Novo Veículo</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="plate">Placa do Veículo*</Label>
                <Input
                  id="plate"
                  placeholder="ABC1234"
                  {...register("plate", { required: "Campo obrigatório" })}
                />
                {errors.plate && <p className="text-red-500 text-sm">{errors.plate.message}</p>}
              </div>
              <Button 
                type="button" 
                onClick={searchPlateInfo}
                disabled={isSearching || !watchPlate}
                className="mb-[2px]"
                variant="outline"
              >
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2">Buscar</span>
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="model">Modelo*</Label>
                <Input
                  id="model"
                  placeholder="Toyota Corolla"
                  {...register("model", { required: "Campo obrigatório" })}
                />
                {errors.model && <p className="text-red-500 text-sm">{errors.model.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="color">Cor*</Label>
                <Input
                  id="color"
                  placeholder="Prata"
                  {...register("color", { required: "Campo obrigatório" })}
                />
                {errors.color && <p className="text-red-500 text-sm">{errors.color.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="mileage">Quilometragem*</Label>
                <Input
                  id="mileage"
                  type="number"
                  min="0"
                  placeholder="45000"
                  {...register("mileage", { 
                    required: "Campo obrigatório",
                    valueAsNumber: true,
                    min: { value: 0, message: "Deve ser maior que 0" }
                  })}
                />
                {errors.mileage && <p className="text-red-500 text-sm">{errors.mileage.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="price">Preço*</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  placeholder="75000"
                  {...register("price", { 
                    required: "Campo obrigatório",
                    valueAsNumber: true,
                    min: { value: 0, message: "Deve ser maior que 0" }
                  })}
                />
                {errors.price && <p className="text-red-500 text-sm">{errors.price.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="year">Ano*</Label>
                <Input
                  id="year"
                  type="number"
                  min="1900"
                  placeholder={new Date().getFullYear().toString()}
                  {...register("year", { 
                    required: "Campo obrigatório",
                    valueAsNumber: true,
                    min: { value: 1900, message: "Ano inválido" },
                    max: { value: new Date().getFullYear() + 1, message: "Ano inválido" }
                  })}
                />
                {errors.year && <p className="text-red-500 text-sm">{errors.year.message}</p>}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="imageUrl">URL da Imagem*</Label>
              <Input
                id="imageUrl"
                placeholder="https://example.com/car-image.jpg"
                {...register("imageUrl", { required: "Campo obrigatório" })}
              />
              {errors.imageUrl && <p className="text-red-500 text-sm">{errors.imageUrl.message}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descreva o veículo em detalhes..."
                rows={3}
                {...register("description")}
              />
            </div>
            
            <div className="space-y-4">
              <h3 className="font-medium">Especificações</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="engine">Motor</Label>
                  <Input
                    id="engine"
                    placeholder="2.0"
                    {...register("specifications.engine")}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="transmission">Transmissão</Label>
                  <Input
                    id="transmission"
                    placeholder="Automático"
                    {...register("specifications.transmission")}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="fuel">Combustível</Label>
                  <Input
                    id="fuel"
                    placeholder="Flex"
                    {...register("specifications.fuel")}
                  />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate('/inventory')}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-vehicleApp-red hover:bg-red-600" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Adicionar Veículo"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default AddVehiclePage;
