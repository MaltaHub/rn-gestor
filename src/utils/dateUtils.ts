
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "Data não disponível";
  
  try {
    const date = parseISO(dateString);
    return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Data inválida";
  }
};

export const formatDateTime = (dateString: string | null | undefined): string => {
  if (!dateString) return "Data não disponível";
  
  try {
    const date = parseISO(dateString);
    return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Data inválida";
  }
};
