import { describe, expect, it } from "vitest";
import { montarPaginaComRecentes } from "@/lib/domain/vendedor/service";

// Lista "inteira" de mentira: 3 recentes (na ordem do uso) + 7 que não são.
const RECENTES = ["r1", "r2", "r3", "fora-do-filtro"];
const TOPO = [{ id: "r3" }, { id: "r1" }, { id: "r2" }]; // o banco devolve em qualquer ordem
const RESTO_INTEIRO = Array.from({ length: 7 }, (_, i) => ({ id: `c${i + 1}` }));

/** O que o serviço faz: pede o resto a partir de max(0, from - recentes.length). */
function pagina(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const inicioBusca = Math.max(0, from - RECENTES.length);
  return montarPaginaComRecentes({
    topo: TOPO,
    resto: RESTO_INTEIRO.slice(inicioBusca, from + pageSize),
    restoTotal: RESTO_INTEIRO.length,
    recentes: RECENTES,
    from,
    pageSize,
    inicioBusca
  });
}

describe("lista Recentes: o que o usuário mexeu por último vem na frente", () => {
  it("1ª página: recentes na ordem do uso, depois o resto na ordem da situação", () => {
    const { carros, total } = pagina(1, 5);
    expect(carros.map((c) => c.id)).toEqual(["r1", "r2", "r3", "c1", "c2"]);
    expect(total).toBe(10);
  });

  it("páginas seguintes continuam o resto sem repetir nem pular", () => {
    const todas = [1, 2].flatMap((page) => pagina(page, 5).carros.map((c) => c.id));
    expect(todas).toEqual(["r1", "r2", "r3", "c1", "c2", "c3", "c4", "c5", "c6", "c7"]);
  });

  it("página pequena, toda dentro dos recentes", () => {
    expect(pagina(1, 2).carros.map((c) => c.id)).toEqual(["r1", "r2"]);
    expect(pagina(2, 2).carros.map((c) => c.id)).toEqual(["r3", "c1"]);
    expect(pagina(3, 2).carros.map((c) => c.id)).toEqual(["c2", "c3"]);
  });
});
