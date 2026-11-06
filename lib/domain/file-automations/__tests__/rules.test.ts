import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILE_AUTOMATION_RULES,
  isSoldByRules,
  parseFileAutomationRules,
  planVehicleDelete,
  planVehicleFolders,
  renderDisplayTemplate,
  type FileAutomationRules
} from "../rules";

const rules = (patch: Partial<FileAutomationRules> = {}): FileAutomationRules => ({ ...DEFAULT_FILE_AUTOMATION_RULES, ...patch });

describe("regras padrão = comportamento histórico", () => {
  it("em estoque: garante docs e fotos nos repositórios ativos, criando se faltar", () => {
    expect(planVehicleFolders(rules(), { sold: false, photos: { exists: false, fileCount: 0 } })).toEqual({
      documents: { action: "ensure", repository: "active", createIfMissing: true },
      photos: { action: "ensure", repository: "active", createIfMissing: true }
    });
  });

  it("vendido: docs para o arquivo, fotos com arquivos para vendidos, vazia é apagada", () => {
    expect(planVehicleFolders(rules(), { sold: true, photos: { exists: true, fileCount: 5 } })).toEqual({
      documents: { action: "ensure", repository: "sold", createIfMissing: true },
      photos: { action: "ensure", repository: "sold", createIfMissing: false }
    });
    expect(planVehicleFolders(rules(), { sold: true, photos: { exists: true, fileCount: 0 } }).photos).toEqual({ action: "delete" });
    expect(planVehicleFolders(rules(), { sold: true, photos: { exists: false, fileCount: 0 } }).photos).toEqual({ action: "none" });
  });

  it("exclusão: docs com arquivos arquivados, vazios apagados; fotos vazias apagadas, com arquivos mantidas", () => {
    expect(
      planVehicleDelete(rules(), { documents: { exists: true, fileCount: 2 }, photos: { exists: true, fileCount: 0 } })
    ).toEqual({ documents: "archive", photos: "delete" });
    expect(
      planVehicleDelete(rules(), { documents: { exists: true, fileCount: 0 }, photos: { exists: true, fileCount: 3 } })
    ).toEqual({ documents: "delete", photos: "keep" });
    expect(
      planVehicleDelete(rules(), { documents: { exists: false, fileCount: 0 }, photos: { exists: false, fileCount: 0 } })
    ).toEqual({ documents: "none", photos: "none" });
  });

  it("só VENDIDO conta como vendido (sem acento/caixa)", () => {
    expect(isSoldByRules(rules(), "VENDIDO")).toBe(true);
    expect(isSoldByRules(rules(), "vendido")).toBe(true);
    expect(isSoldByRules(rules(), "DISPONÍVEL")).toBe(false);
    expect(isSoldByRules(rules(), null)).toBe(false);
  });
});

describe("customização", () => {
  it("estados extras contam como vendido", () => {
    const custom = rules({ soldStates: ["VENDIDO", "Repassado"] });
    expect(isSoldByRules(custom, "REPASSADO")).toBe(true);
    expect(isSoldByRules(custom, "ATENCAO")).toBe(false);
  });

  it("manter fotos e documentos no lugar ao vender", () => {
    const custom = rules({
      photos: { ...DEFAULT_FILE_AUTOMATION_RULES.photos, onSold: "keep", deleteEmptyOnSold: false },
      documents: { ...DEFAULT_FILE_AUTOMATION_RULES.documents, onSold: "keep" }
    });
    expect(planVehicleFolders(custom, { sold: true, photos: { exists: true, fileCount: 0 } })).toEqual({
      documents: { action: "ensure", repository: "active", createIfMissing: true },
      photos: { action: "ensure", repository: "active", createIfMissing: false }
    });
  });

  it("não criar pastas para estoque", () => {
    const custom = rules({
      photos: { ...DEFAULT_FILE_AUTOMATION_RULES.photos, createForStock: false },
      documents: { ...DEFAULT_FILE_AUTOMATION_RULES.documents, createForStock: false }
    });
    const plan = planVehicleFolders(custom, { sold: false, photos: { exists: false, fileCount: 0 } });
    expect(plan.photos).toEqual({ action: "ensure", repository: "active", createIfMissing: false });
    expect(plan.documents).toEqual({ action: "ensure", repository: "active", createIfMissing: false });
    // ao vender, documentos passam a existir
    expect(planVehicleFolders(custom, { sold: true, photos: { exists: false, fileCount: 0 } }).documents).toMatchObject({
      createIfMissing: true
    });
  });

  it("exclusão alternativa: docs desvinculados no lugar, fotos para vendidos", () => {
    const custom = rules({
      photos: { ...DEFAULT_FILE_AUTOMATION_RULES.photos, onVehicleDelete: "move_to_sold" },
      documents: { ...DEFAULT_FILE_AUTOMATION_RULES.documents, onVehicleDelete: "keep" }
    });
    expect(
      planVehicleDelete(custom, { documents: { exists: true, fileCount: 1 }, photos: { exists: true, fileCount: 4 } })
    ).toEqual({ documents: "detach", photos: "move_to_sold" });
  });
});

describe("parseFileAutomationRules", () => {
  it("completa campos ausentes com o padrão e ignora lixo", () => {
    expect(parseFileAutomationRules(null)).toEqual(DEFAULT_FILE_AUTOMATION_RULES);
    expect(parseFileAutomationRules({ photos: { onSold: "keep" } }).photos).toMatchObject({ onSold: "keep", autoCover: true });
    expect(parseFileAutomationRules({ photos: { onSold: "explodir" } })).toEqual(DEFAULT_FILE_AUTOMATION_RULES);
  });
});

describe("renderDisplayTemplate", () => {
  const car = { id: "c1", placa: "abc1d23", modelo: "Onix", ano: 2022, cor: "", chassi: null };

  it("substitui tokens e limpa separadores órfãos", () => {
    expect(renderDisplayTemplate("{placa} · {modelo} {ano}", car)).toBe("ABC1D23 · Onix 2022");
    expect(renderDisplayTemplate("{placa} · {cor}", car)).toBe("ABC1D23");
    expect(renderDisplayTemplate("{cor} — {placa}", car)).toBe("ABC1D23");
    expect(renderDisplayTemplate("{desconhecido} {placa}", car)).toBe("{desconhecido} ABC1D23");
  });
});
