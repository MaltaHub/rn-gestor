
/**
 * Format date string into a localized format
 * @param dateString Date string to format
 * @returns Formatted date string
 */
export const formatDate = (dateString: string | null): string => {
  if (!dateString) return "Não informado";
  
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  } catch (error) {
    console.error("Error formatting date:", error);
    return dateString;
  }
};

/**
 * Format date and time string into a localized format
 * @param dateTimeString Date and time string to format
 * @returns Formatted date and time string
 */
export const formatDateTime = (dateTimeString: string | null): string => {
  if (!dateTimeString) return "Não informado";
  
  try {
    const date = new Date(dateTimeString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  } catch (error) {
    console.error("Error formatting date and time:", error);
    return dateTimeString;
  }
};
