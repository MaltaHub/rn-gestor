
import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useVehicles } from "@/contexts/VehicleContext";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { VehicleFormData } from "@/types/forms";
import { usePermission } from "@/contexts/PermissionContext";
import { VehicleFormProvider } from "@/components/vehicle/VehicleFormProvider";
import { VehicleFormActions } from "@/components/vehicle/VehicleFormActions";
import { VehicleFormContent } from "@/components/vehicle/VehicleFormContent";
import { RestrictedAccess } from "@/components/vehicle/RestrictedAccess";

const AddVehiclePage: React.FC = () => {
  const navigate = useNavigate();
  const { addVehicle } = useVehicles();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);
  const { toast } = useToast();
  const { checkPermission } = usePermission();
  
  // Check if user can add vehicles (level 5 for add_vehicle)
  const canAddVehicle = checkPermission('add_vehicle', 5);
  
  // If user can't add vehicles, redirect to inventory
  React.useEffect(() => {
    if (!canAddVehicle) {
      navigate('/inventory');
    }
  }, [canAddVehicle, navigate]);
  
  const formMethods = useForm<VehicleFormData>({
    defaultValues: {
      plate: "",
      model: "",
      color: "",
      mileage: 0,
      imageUrl: "",
      price: 0,
      year: new Date().getFullYear(),
      description: "",
      marca: "",
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

  const watchPlate = formMethods.watch("plate");
  
  const handlePlateChange = (value: string) => {
    formMethods.setValue("plate", value);
  };
  
  const handlePlateSearchSuccess = (data: any) => {
    console.log("Preenchendo dados do veículo:", data);
    
    // Preenche os campos com os dados retornados da API usando as chaves em português
    if (data.placa) formMethods.setValue("plate", data.placa);
    if (data.modelo) formMethods.setValue("model", data.modelo);
    if (data.marca) formMethods.setValue("marca", data.marca);
    if (data.ano) formMethods.setValue("year", parseInt(data.ano));
    if (data.cor) formMethods.setValue("color", data.cor);
    
    // Preencher os campos de especificações
    if (data.tipoCombustivel) formMethods.setValue("specifications.fuel", data.tipoCombustivel);
    if (data.renavam) formMethods.setValue("specifications.renavam", data.renavam);
    if (data.chassi) formMethods.setValue("specifications.chassi", data.chassi);
    if (data.tipoCarroceria) formMethods.setValue("specifications.tipoCarroceria", data.tipoCarroceria);
    if (data.municipio) formMethods.setValue("specifications.municipio", data.municipio);
    if (data.uf) formMethods.setValue("specifications.uf", data.uf);
    if (data.valorFipe) formMethods.setValue("specifications.valorFipe", data.valorFipe);
    
    // Se houver modelo completo, usar como descrição
    if (data.modeloCompleto) {
      formMethods.setValue("description", `${data.modeloCompleto} - Ano: ${data.ano}`);
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
    
    console.log("Dados do formulário:", data);
    
    // Validação básica
    if (!data.plate || !data.model || !data.color || !data.imageUrl) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }
    
    if (data.price <= 0 || data.mileage < 0 || data.year < 1900) {
      toast({
        title: "Valores inválidos",
        description: "Verifique os valores de preço, quilometragem e ano",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const vehicleData = {
        plate: data.plate,
        model: data.model,
        color: data.color,
        mileage: data.mileage,
        imageUrl: data.imageUrl,
        price: data.price,
        year: data.year,
        description: data.description || "",
        specifications: data.specifications || {},
        status: 'available' as const
      };
      
      console.log("Enviando dados do veículo:", vehicleData);
      
      await addVehicle(vehicleData);
      
      toast({
        title: "Veículo adicionado",
        description: "O veículo foi adicionado com sucesso ao inventário",
      });
      
      navigate('/inventory');
    } catch (error) {
      console.error("Erro ao adicionar veículo:", error);
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o veículo. Verifique os dados e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // If user doesn't have permission, show restricted access component
  if (!canAddVehicle) {
    return <RestrictedAccess />;
  }

  return (
    <div className="content-container py-6">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Adicionar Novo Veículo</CardTitle>
        </CardHeader>
        <VehicleFormProvider
          formMethods={formMethods}
          onSubmit={onSubmit}
        >
          <CardContent className="space-y-6">
            <VehicleFormContent
              plate={watchPlate}
              isSearching={isSearching}
              onPlateChange={handlePlateChange}
              onPlateSearchSuccess={handlePlateSearchSuccess}
              setIsSearching={setIsSearching}
            />
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <VehicleFormActions 
              isSubmitting={isSubmitting}
              onCancel={() => navigate('/inventory')}
            />
          </CardFooter>
        </VehicleFormProvider>
      </Card>
    </div>
  );
};

export default AddVehiclePage;
