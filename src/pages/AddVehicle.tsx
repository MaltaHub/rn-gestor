
import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useVehicles } from "@/contexts/VehicleContext";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LicensePlateSearch } from "@/components/vehicle/LicensePlateSearch";
import { BasicVehicleInfo } from "@/components/vehicle/BasicVehicleInfo";
import { VehicleSpecifications } from "@/components/vehicle/VehicleSpecifications";
import { VehicleFormData } from "@/types/forms";
import { usePermission } from "@/contexts/PermissionContext";

const AddVehiclePage: React.FC = () => {
  const navigate = useNavigate();
  const { addVehicle } = useVehicles();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);
  const { toast } = useToast();
  const { checkPermission, userRole } = usePermission();
  
  // Check if user has edit permission (level 2 for inventory)
  const canEdit = checkPermission('inventory', 2);
  
  // Check if user can add vehicles (level 5 for add_vehicle)
  const canAddVehicle = checkPermission('add_vehicle', 5);
  
  // If user can't add vehicles, redirect to inventory
  React.useEffect(() => {
    if (!canAddVehicle) {
      navigate('/inventory');
    }
  }, [canAddVehicle, navigate]);
  
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
        fuel: "",
        renavam: "",
        chassi: "",
        tipoCarroceria: "",
        municipio: "",
        uf: "",
        valorFipe: ""
      }
    }
  });

  const watchPlate = watch("plate");
  
  const handlePlateChange = (value: string) => {
    setValue("plate", value);
  };
  
  const handlePlateSearchSuccess = (data: any) => {
    // Preenche os campos com os dados retornados da API usando as chaves em português
    if (data.placa) setValue("plate", data.placa);
    if (data.modelo) setValue("model", data.modelo);
    if (data.marca) setValue("marca", data.marca);
    if (data.ano) setValue("year", data.ano);
    if (data.cor) setValue("color", data.cor);
    
    // Preencher os campos de especificações
    if (data.tipoCombustivel) setValue("specifications.fuel", data.tipoCombustivel);
    if (data.renavam) setValue("specifications.renavam", data.renavam);
    if (data.chassi) setValue("specifications.chassi", data.chassi);
    if (data.tipoCarroceria) setValue("specifications.tipoCarroceria", data.tipoCarroceria);
    if (data.municipio) setValue("specifications.municipio", data.municipio);
    if (data.uf) setValue("specifications.uf", data.uf);
    if (data.valorFipe) setValue("specifications.valorFipe", data.valorFipe);
    
    // Se houver modelo completo, usar como descrição
    if (data.modeloCompleto) {
      setValue("description", `${data.modeloCompleto} - Ano: ${data.ano}`);
    }
  };

  const onSubmit = async (data: VehicleFormData) => {
    if (!canAddVehicle) {
      toast({
        title: "Permissão negada",
        description: "Você não tem permissão para adicionar veículos",
        variant: "destructive",
      });
      return;
    }
    
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

  // If user doesn't have permission, don't render the form
  if (!canAddVehicle) {
    return (
      <div className="content-container py-6">
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Acesso Restrito</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center">Somente Gerentes e Administradores podem adicionar veículos.</p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button onClick={() => navigate('/inventory')}>
              Voltar para o Estoque
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="content-container py-6">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Adicionar Novo Veículo</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            {/* License Plate Search Component */}
            <LicensePlateSearch
              plate={watchPlate}
              isSearching={isSearching}
              onPlateChange={handlePlateChange}
              onSuccess={handlePlateSearchSuccess}
              error={errors.plate?.message}
              setIsSearching={setIsSearching}
            />
            
            {/* Basic Vehicle Information Component */}
            <BasicVehicleInfo 
              register={register}
              errors={errors}
            />
            
            {/* Image URL Input */}
            <div className="space-y-2">
              <Label htmlFor="imageUrl">URL da Imagem*</Label>
              <Input
                id="imageUrl"
                placeholder="https://example.com/car-image.jpg"
                {...register("imageUrl", { required: "Campo obrigatório" })}
              />
              {errors.imageUrl && <p className="text-red-500 text-sm">{errors.imageUrl.message}</p>}
            </div>
            
            {/* Description Textarea */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descreva o veículo em detalhes..."
                rows={3}
                {...register("description")}
              />
            </div>
            
            {/* Vehicle Specifications Component */}
            <VehicleSpecifications register={register} />
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
