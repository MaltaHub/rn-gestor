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
const CAR_COLOR_ALIAS_BY_TOKEN: Record<string, string> = {
  preta: "preto",
  preto: "preto",
  branca: "branco",
  branco: "branco",
  prateada: "prata",
  prateado: "prata",
  prata: "prata",
  cinzenta: "cinza",
  cinzento: "cinza",
  cinza: "cinza",
  vermelha: "vermelho",
  vermelho: "vermelho",
  azul: "azul",
  verde: "verde",
  amarela: "amarelo",
  amarelo: "amarelo",
  marrom: "marrom",
  bege: "bege",
  roxa: "roxo",
  roxo: "roxo",
  rosa: "rosa",
  laranja: "laranja",
  dourada: "dourado",
  dourado: "dourado",
  grafite: "grafite",
  chumbo: "chumbo",
  vinho: "vinho"
};

function normalizeColorToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeCarColorValue(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = normalizeColorToken(value);
  if (!normalized) return null;

  const direct = CAR_COLOR_ALIAS_BY_TOKEN[normalized];
  if (direct) return direct;

  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    const alias = CAR_COLOR_ALIAS_BY_TOKEN[token];
    if (alias) return alias;
  }

  return null;
}

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

