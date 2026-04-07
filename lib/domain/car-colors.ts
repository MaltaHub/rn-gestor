export type CarColorOption = {
  value: string;
  label: string;
};

// Lista parametrizada de cores comuns para veículos (português BR)
export const CAR_COLOR_OPTIONS: CarColorOption[] = [
  { value: "preto", label: "Preto" },
  { value: "branco", label: "Branco" },
  { value: "prata", label: "Prata" },
  { value: "cinza", label: "Cinza" },
  { value: "vermelho", label: "Vermelho" },
  { value: "azul", label: "Azul" },
  { value: "verde", label: "Verde" },
  { value: "amarelo", label: "Amarelo" },
  { value: "marrom", label: "Marrom" },
  { value: "bege", label: "Bege" },
  { value: "roxo", label: "Roxo" },
  { value: "rosa", label: "Rosa" },
  { value: "laranja", label: "Laranja" },
  { value: "dourado", label: "Dourado" },
  { value: "grafite", label: "Grafite" },
  { value: "chumbo", label: "Chumbo" },
  { value: "vinho", label: "Vinho" }
];

// Mapa auxiliar para cores aproximadas em HEX (para exibição opcional)
export const CAR_COLOR_HEX_BY_VALUE: Record<string, string> = {
  preto: "#000000",
  branco: "#ffffff",
  prata: "#c0c0c0",
  cinza: "#9ca3af",
  vermelho: "#dc2626",
  azul: "#2563eb",
  verde: "#16a34a",
  amarelo: "#f59e0b",
  marrom: "#92400e",
  bege: "#f5f5dc",
  roxo: "#7c3aed",
  rosa: "#ec4899",
  laranja: "#f97316",
  dourado: "#d4af37",
  grafite: "#4b5563",
  chumbo: "#374151",
  vinho: "#7f1d1d"
};

