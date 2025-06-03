
// Mapeamento de nomes técnicos para nomes amigáveis
const FIELD_NAMES = {
  plate: 'Placa',
  model: 'Modelo',
  color: 'Cor',
  mileage: 'Quilometragem',
  price: 'Preço',
  year: 'Ano',
  status: 'Status',
  description: 'Descrição',
  image_url: 'Imagem',
  specifications: 'Especificações'
};

const STATUS_NAMES = {
  available: 'Disponível',
  reserved: 'Reservado',
  sold: 'Vendido'
};

export const formatFieldName = (fieldName: string): string => {
  return FIELD_NAMES[fieldName as keyof typeof FIELD_NAMES] || fieldName;
};

export const formatValue = (fieldName: string, value: string): string => {
  if (fieldName === 'status') {
    return STATUS_NAMES[value as keyof typeof STATUS_NAMES] || value;
  }
  if (fieldName === 'price') {
    return `R$ ${parseFloat(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }
  if (fieldName === 'mileage') {
    return `${parseInt(value).toLocaleString('pt-BR')} km`;
  }
  return value;
};

export const createSmartNotificationMessage = (
  vehicleModel: string,
  vehiclePlate: string,
  changedFields: string[]
): { message: string; details: string } => {
  const fieldCount = changedFields.length;
  
  if (fieldCount === 0) {
    return {
      message: "Veículo atualizado",
      details: `${vehicleModel} foi atualizado`
    };
  }
  
  if (fieldCount === 1) {
    const fieldName = formatFieldName(changedFields[0]);
    return {
      message: `${fieldName} atualizado`,
      details: `O campo ${fieldName} do ${vehicleModel} foi atualizado`
    };
  }
  
  if (fieldCount <= 3) {
    const formattedFields = changedFields.map(formatFieldName).join(', ');
    return {
      message: "Múltiplos campos atualizados",
      details: `Os campos ${formattedFields} do ${vehicleModel} foram atualizados`
    };
  }
  
  return {
    message: "Veículo atualizado",
    details: `${fieldCount} campos do ${vehicleModel} foram atualizados`
  };
};
