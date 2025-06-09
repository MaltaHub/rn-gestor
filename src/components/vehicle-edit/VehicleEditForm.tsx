
import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Vehicle, LocalType, DocumentacaoType } from "@/types";
import { Info, Car, Settings, MapPin, FileText, Camera } from "lucide-react";

interface VehicleEditFormProps {
  vehicle: Vehicle;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onStatusChange: (value: string) => void;
  onLocalChange: (value: string) => void;
  onDocumentacaoChange: (value: string) => void;
  onCheckboxChange: (field: string, checked: boolean) => void;
}

const LOCAL_OPTIONS: LocalType[] = ['Oficina', 'Funilaria', 'Polimento', 'Bailon', 'Robertão', 'Laudo', 'Perícia', 'Trânsito'];
const DOCUMENTACAO_OPTIONS: DocumentacaoType[] = ['Recepção', 'Fazendo Laudo', 'Laudo Aprovado', 'Laudo Reprovado', 'Vistoria', 'Transferência', 'IPVA Pago', 'IPVA Atrasado', 'Multas Pendentes', 'CRLV em Andamento', 'CRLV Entregue', 'Despacho Finalizado'];

export const VehicleEditForm: React.FC<VehicleEditFormProps> = ({
  vehicle,
  onInputChange,
  onStatusChange,
  onLocalChange,
  onDocumentacaoChange,
  onCheckboxChange
}) => {
  return (
    <div className="space-y-8">
      {/* Imagem */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Car className="h-4 w-4" />
          Imagem do Veículo
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64">
            <img 
              src={vehicle.image_url} 
              alt={vehicle.model}
              className="w-full h-full object-cover rounded-lg border"
            />
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="image_url">URL da Imagem</Label>
              <Input
                id="image_url"
                name="image_url"
                value={vehicle.image_url}
                onChange={onInputChange}
                placeholder="https://exemplo.com/imagem.jpg"
                className="mt-1"
              />
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Informações Básicas */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Info className="h-4 w-4" />
          Informações Básicas
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="model">Modelo</Label>
            <Input
              id="model"
              name="model"
              value={vehicle.model}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="plate">Placa</Label>
            <Input
              id="plate"
              name="plate"
              value={vehicle.plate}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="color">Cor</Label>
            <Input
              id="color"
              name="color"
              value={vehicle.color}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="year">Ano</Label>
            <Input
              id="year"
              name="year"
              type="number"
              value={vehicle.year}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="mileage">Quilometragem</Label>
            <Input
              id="mileage"
              name="mileage"
              type="number"
              value={vehicle.mileage}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="price">Preço</Label>
            <Input
              id="price"
              name="price"
              type="number"
              value={vehicle.price}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={vehicle.status}
              onValueChange={onStatusChange}
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
          </div>
        </div>
      </div>

      <Separator />

      {/* Local e Documentação */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <MapPin className="h-4 w-4" />
          Local e Documentação
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="local">Local</Label>
            <Select
              value={vehicle.local || ''}
              onValueChange={onLocalChange}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione o local" />
              </SelectTrigger>
              <SelectContent>
                {LOCAL_OPTIONS.map((local) => (
                  <SelectItem key={local} value={local}>
                    {local}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="documentacao">Documentação</Label>
            <Select
              value={vehicle.documentacao || ''}
              onValueChange={onDocumentacaoChange}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione o status da documentação" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENTACAO_OPTIONS.map((doc) => (
                  <SelectItem key={doc} value={doc}>
                    {doc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Fotos */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Camera className="h-4 w-4" />
          Status das Fotos
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="fotos_roberto"
              checked={vehicle.fotos_roberto || false}
              onCheckedChange={(checked) => onCheckboxChange('fotos_roberto', checked as boolean)}
            />
            <Label htmlFor="fotos_roberto">Fotos Roberto Automóveis</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="fotos_rn"
              checked={vehicle.fotos_rn || false}
              onCheckedChange={(checked) => onCheckboxChange('fotos_rn', checked as boolean)}
            />
            <Label htmlFor="fotos_rn">Fotos RN Multimarcas</Label>
          </div>
        </div>
      </div>

      <Separator />

      {/* Especificações */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4" />
          Especificações
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="specifications.engine">Motor</Label>
            <Input
              id="specifications.engine"
              name="specifications.engine"
              value={vehicle.specifications?.engine || ""}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="specifications.transmission">Transmissão</Label>
            <Input
              id="specifications.transmission"
              name="specifications.transmission"
              value={vehicle.specifications?.transmission || ""}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="specifications.fuel">Combustível</Label>
            <Input
              id="specifications.fuel"
              name="specifications.fuel"
              value={vehicle.specifications?.fuel || ""}
              onChange={onInputChange}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Descrição */}
      <div>
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          name="description"
          value={vehicle.description || ""}
          onChange={onInputChange}
          rows={4}
          className="mt-2"
          placeholder="Descrição detalhada do veículo..."
        />
      </div>
    </div>
  );
};
