import { describe, expect, it } from "vitest";
import { ZOOM_MAX, ZOOM_MIN, degrau, escalaQueCabe, lerZoomSalvo, rotuloZoom, zoomPelaRoda } from "@/components/vendedor/word/zoom";

const FOLHA = { largura: 794, altura: 1123 };

describe("zoom do papel (Word)", () => {
  it("− / + andam pelos degraus e param nos limites", () => {
    expect(degrau(1, 1)).toBe(1.1);
    expect(degrau(1, -1)).toBe(0.9);
    expect(degrau(0.87, 1)).toBe(0.9);
    expect(degrau(0.87, -1)).toBe(0.8);
    expect(degrau(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(degrau(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });

  it("Ctrl+roda: roda do mouse dá um passo; pinça acompanha devagar; respeita os limites", () => {
    expect(zoomPelaRoda(1, -100)).toBeGreaterThan(1.1);
    expect(zoomPelaRoda(1, 100)).toBeLessThan(0.9);
    const pinca = zoomPelaRoda(1, -3);
    expect(pinca).toBeGreaterThan(1);
    expect(pinca).toBeLessThan(1.05);
    expect(zoomPelaRoda(ZOOM_MAX, -1000)).toBe(ZOOM_MAX);
    expect(zoomPelaRoda(ZOOM_MIN, 1000)).toBe(ZOOM_MIN);
  });

  it("largura: cabe na largura (até 125%); página inteira: cabe também na altura", () => {
    expect(escalaQueCabe({ largura: 397, altura: 2000 }, FOLHA, "largura")).toBe(0.5);
    expect(escalaQueCabe({ largura: 3000, altura: 3000 }, FOLHA, "largura")).toBe(1.25);
    expect(escalaQueCabe({ largura: 1200, altura: 561.5 }, FOLHA, "pagina")).toBe(0.5);
  });

  it("o que ficou salvo volta; lixo volta ao padrão (ajustar à largura)", () => {
    expect(lerZoomSalvo(JSON.stringify({ modo: "livre", valor: 1.5 }))).toEqual({ modo: "livre", valor: 1.5 });
    expect(lerZoomSalvo(JSON.stringify({ modo: "pagina" }))).toEqual({ modo: "pagina", valor: 1 });
    expect(lerZoomSalvo("{quebrado")).toEqual({ modo: "largura", valor: 1 });
    expect(lerZoomSalvo(null)).toEqual({ modo: "largura", valor: 1 });
    expect(rotuloZoom(0.87)).toBe("87%");
  });
});
