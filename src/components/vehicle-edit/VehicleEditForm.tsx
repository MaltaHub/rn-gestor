import React, { useReducer } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VehicleWithIndicators } from "@/types";
import { toast } from "@/components/ui/sonner";
import { Save } from "lucide-react";

interface VehicleEditFormProps {
  vehicle: VehicleWithIndicators;
  onSave: (updatedData: Partial<VehicleWithIndicators>) => Promise<void>;
  onCancel: () => void;
}

type State = Partial<VehicleWithIndicators>;
type Action = 
  | { type: 'SET_FIELD'; field: string; value: any }
  | { type: 'SET_SPECIFICATION'; key: string; value: string };

const formReducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_SPECIFICATION':
      return {
        ...state,
        specifications: {
          ...state.specifications,
          [action.key]: action.value
        }
      };
    default:
      return state;
  }
};

const VehicleEditForm: React.FC<VehicleEditFormProps> = ({ vehicle, onSave, onCancel }) => {
  const [formState, dispatch] = useReducer(formReducer, vehicle);
  const [isSaving, setIsSaving] = React.useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const numericFields = ["price", "mileage", "year"];
    dispatch({ 
      type: 'SET_FIELD', 
      field: name, 
      value: numericFields.includes(name) ? (value === '' ? '' : Number(value)) : value 
    });
  };

  const handleStatusChange = (value: string) => {
    dispatch({ type: 'SET_FIELD', field: 'status', value });
  };
  
  const handleSpecificationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    dispatch({ type: 'SET_SPECIFICATION', key: name, value });
  };

  const handleSaveClick = async () => {
    setIsSaving(true);
    // Simplificado: passa o estado inteiro do formulário. 
    // A lógica de detecção de mudanças já existe no `VehicleContext`.
    await onSave(formState);
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Coluna 1 */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="model">Modelo</Label>
            <Input id="model" name="model" value={formState.model || ''} onChange={handleInputChange} />
          </div>
          <div>
            <Label htmlFor="image_url">URL da Imagem</Label>
            <Input id="image_url" name="image_url" value={formState.image_url || ''} onChange={handleInputChange} placeholder="https://exemplo.com/imagem.jpg" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="plate">Placa</Label>
              <Input id="plate" name="plate" value={formState.plate || ''} onChange={handleInputChange} />
            </div>
            <div>
              <Label htmlFor="year">Ano</Label>
              <Input id="year" name="year" type="number" value={formState.year || ''} onChange={handleInputChange} />
            </div>
          </div>
          <div>
            <Label htmlFor="price">Preço</Label>
            <Input id="price" name="price" type="number" value={formState.price || ''} onChange={handleInputChange} />
          </div>
        </div>
        
        {/* Coluna 2 */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="color">Cor</Label>
            <Input id="color" name="color" value={formState.color || ''} onChange={handleInputChange} />
          </div>
          <div>
            <Label htmlFor="mileage">Quilometragem</Label>
            <Input id="mileage" name="mileage" type="number" value={formState.mileage || ''} onChange={handleInputChange} />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select value={formState.status || ''} onValueChange={handleStatusChange}>
              <SelectTrigger id="status">
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Disponível</SelectItem>
                <SelectItem value="reserved">Reservado</SelectItem>
                <SelectItem value="sold">Vendido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Descrição */}
      <div>
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" name="description" value={formState.description || ''} onChange={handleInputChange} rows={4} />
      </div>

      {/* Especificações */}
      <div>
        <h4 className="text-md font-medium mb-3">Especificações</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(formState.specifications || {}).map(([key, value]) => (
            <div key={key}>
              <Label htmlFor={`spec_${key}`} className="capitalize">{key.replace(/_/g, ' ')}</Label>
              <Input id={`spec_${key}`} name={key} value={value} onChange={handleSpecificationChange} />
            </div>
          ))}
        </div>
      </div>

      {/* Ações do Formulário */}
      <div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSaveClick} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>
    </div>
  );
};

export default VehicleEditForm;
