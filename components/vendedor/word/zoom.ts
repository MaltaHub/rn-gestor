/**
 * Zoom do papel no editor Word (puro, testável). Três modos, como no Word:
 * ajustar à LARGURA, PÁGINA inteira (folha A4 toda à vista) ou um valor LIVRE
 * (−/+, lista de porcentagens, Ctrl+roda do mouse / pinça no touchpad).
 */
export type ZoomModo = "largura" | "pagina" | "livre";
export type ZoomEstado = { modo: ZoomModo; valor: number };

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;
/** Degraus do − / + (os mesmos dos navegadores). */
export const ZOOM_DEGRAUS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
/** Atalhos da lista. */
export const ZOOM_ATALHOS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export const ZOOM_PADRAO: ZoomEstado = { modo: "largura", valor: 1 };

export function limitarZoom(valor: number): number {
  if (!Number.isFinite(valor)) return 1;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, valor)) * 100) / 100;
}

/** Próximo degrau acima (+1) ou abaixo (−1) do zoom em uso. */
export function degrau(atual: number, direcao: 1 | -1): number {
  const alvo =
    direcao > 0
      ? ZOOM_DEGRAUS.find((valor) => valor > atual + 0.001)
      : [...ZOOM_DEGRAUS].reverse().find((valor) => valor < atual - 0.001);
  return limitarZoom(alvo ?? atual);
}

/**
 * Ctrl+roda: a roda do mouse dá passos de ~15%; a pinça do touchpad (deltaY
 * pequeno e contínuo) acompanha o gesto.
 */
export function zoomPelaRoda(atual: number, deltaY: number): number {
  const sensibilidade = Math.abs(deltaY) >= 40 ? 0.0015 : 0.01;
  return limitarZoom(atual * Math.exp(-deltaY * sensibilidade));
}

/** Escala que cabe no espaço (largura e, no modo página, também a altura da folha). */
export function escalaQueCabe(espaco: { largura: number; altura: number }, folha: { largura: number; altura: number }, modo: "largura" | "pagina"): number {
  const porLargura = espaco.largura / folha.largura;
  const escala = modo === "pagina" ? Math.min(porLargura, espaco.altura / folha.altura) : porLargura;
  return limitarZoom(Math.min(modo === "largura" ? 1.25 : ZOOM_MAX, escala));
}

export function lerZoomSalvo(raw: string | null): ZoomEstado {
  if (!raw) return ZOOM_PADRAO;
  try {
    const salvo = JSON.parse(raw) as Partial<ZoomEstado>;
    if (salvo.modo === "largura" || salvo.modo === "pagina") return { modo: salvo.modo, valor: 1 };
    if (salvo.modo === "livre" && typeof salvo.valor === "number") return { modo: "livre", valor: limitarZoom(salvo.valor) };
  } catch {
    // Valor velho/corrompido: volta ao padrão.
  }
  return ZOOM_PADRAO;
}

export function rotuloZoom(valor: number): string {
  return `${Math.round(valor * 100)}%`;
}
