
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface LicensePlateSearchProps {
  plate: string;
  isSearching: boolean;
  onPlateChange: (value: string) => void;
  onSuccess: (data: any) => void;
  error?: string;
}

export const LicensePlateSearch: React.FC<LicensePlateSearchProps> = ({
  plate,
  isSearching,
  onPlateChange,
  onSuccess,
  error
}) => {
  const { toast } = useToast();
  
  const searchPlateInfo = async () => {
    if (!plate || plate.length < 6) {
      toast({
        title: "Placa inválida",
        description: "Por favor, insira uma placa válida",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const { data, error } = await supabase.functions.invoke('auto-completar-placa', {
        body: { placa: plate }
      });
      
      if (error) throw error;
      
      if (data.success) {
        // Callback with vehicle data
        onSuccess(data);
        
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
    }
  };

  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1 space-y-2">
        <Label htmlFor="plate">Placa do Veículo*</Label>
        <Input
          id="plate"
          placeholder="ABC1234"
          value={plate}
          onChange={(e) => onPlateChange(e.target.value)}
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>
      <Button 
        type="button" 
        onClick={searchPlateInfo}
        disabled={isSearching || !plate}
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
  );
};
