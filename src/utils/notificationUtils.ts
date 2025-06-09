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
  specifications: 'Especificações',
  'specifications.engine': 'Motor',
  'specifications.transmission': 'Transmissão',
  'specifications.fuel': 'Combustível',
  'specifications.renavam': 'RENAVAM',
  'specifications.chassi': 'Chassi',
  'specifications.tipoCarroceria': 'Tipo de Carroceria',
  'specifications.municipio': 'Município',
  'specifications.uf': 'UF',
  'specifications.valorFipe': 'Valor FIPE'
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
  if (fieldName === 'year') {
    return value;
  }
  return value || 'Vazio';
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

export const createSmartNotificationMessage = (
  vehicleModel: string,
  vehiclePlate: string,
  changedFields: string[]
): { message: string; details: string } => {
  const validFields = changedFields.filter(field => field !== undefined && field !== null);
  const fieldCount = validFields.length;

  if (fieldCount === 0) {
    return {
      message: "Veículo atualizado",
      details: `${vehicleModel} foi atualizado`
    };
  }

  if (fieldCount === 1) {
    const fieldName = formatFieldName(validFields[0]);
    return {
      message: `${fieldName} atualizado`,
      details: `O campo ${fieldName} do ${vehicleModel} foi atualizado`
    };
  }

  if (fieldCount <= 3) {
    const formattedFields = validFields.map(formatFieldName).join(', ');
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
