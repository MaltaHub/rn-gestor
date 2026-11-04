import { describe, expect, it } from "vitest";

import { detectInconsistencies, type InconsistencyInput } from "../inconsistencies";
import { DEFAULT_FILE_AUTOMATION_RULES } from "../rules";

const repositories = {
  vehicle_photos_active: "r-fotos",
  vehicle_photos_sold: "r-fotos-vendidos",
  vehicle_documents_active: "r-docs",
  vehicle_documents_archive: "r-docs-vendidos"
};

function input(patch: Partial<InconsistencyInput>): InconsistencyInput {
  return {
    rules: DEFAULT_FILE_AUTOMATION_RULES,
    repositories,
    cars: [],
    mappings: [],
    folderParentById: new Map(),
    fileCountByFolderId: new Map(),
    ...patch
  };
}

const kinds = (issues: ReturnType<typeof detectInconsistencies>) => issues.map((issue) => `${issue.kind}:${issue.carroId ?? issue.folderId}`).sort();

describe("detectInconsistencies", () => {
  it("veículo em ordem não gera nada", () => {
    const issues = detectInconsistencies(
      input({
        cars: [{ id: "c1", placa: "AAA1A11", estado_venda: "DISPONÍVEL" }],
        mappings: [
          { folderId: "d1", carroId: "c1", automationKey: "vehicle_documents", paused: false },
          { folderId: "p1", carroId: "c1", automationKey: "vehicle_photos", paused: false }
        ],
        folderParentById: new Map([
          ["d1", "r-docs"],
          ["p1", "r-fotos"]
        ]),
        fileCountByFolderId: new Map([["p1", 3]])
      })
    );
    expect(issues).toEqual([]);
  });

  it("aponta pasta faltando, pausada, fora do lugar e estoque sem fotos", () => {
    const issues = detectInconsistencies(
      input({
        cars: [
          { id: "sem-pastas", placa: "BBB2B22", estado_venda: "DISPONÍVEL" },
          { id: "vendido", placa: "CCC3C33", estado_venda: "VENDIDO" }
        ],
        mappings: [
          { folderId: "d-v", carroId: "vendido", automationKey: "vehicle_documents", paused: true },
          { folderId: "p-v", carroId: "vendido", automationKey: "vehicle_photos", paused: false }
        ],
        folderParentById: new Map([
          ["d-v", "r-docs"], // vendido: deveria estar no arquivo
          ["p-v", "r-fotos"] // vendido com fotos: deveria estar em vendidos
        ]),
        fileCountByFolderId: new Map([["p-v", 4]])
      })
    );
    expect(kinds(issues)).toEqual(
      [
        "automation_paused:vendido",
        "misplaced_folder:vendido",
        "misplaced_folder:vendido",
        "missing_documents_folder:sem-pastas",
        "missing_photos_folder:sem-pastas"
      ].sort()
    );
  });

  it("vendido com fotos vazias e pasta desvinculada", () => {
    const issues = detectInconsistencies(
      input({
        cars: [{ id: "v", placa: "DDD4D44", estado_venda: "VENDIDO" }],
        mappings: [
          { folderId: "d", carroId: "v", automationKey: "vehicle_documents", paused: false },
          { folderId: "p", carroId: "v", automationKey: "vehicle_photos", paused: false },
          { folderId: "orfa", carroId: null, automationKey: "vehicle_documents", paused: false }
        ],
        folderParentById: new Map([
          ["d", "r-docs-vendidos"],
          ["p", "r-fotos-vendidos"],
          ["orfa", "r-docs-vendidos"]
        ])
      })
    );
    expect(kinds(issues)).toEqual(["sold_empty_photos:v", "unlinked_folder:orfa"]);
  });

  it("respeita as regras customizadas (manter no lugar ao vender)", () => {
    const rules = {
      ...DEFAULT_FILE_AUTOMATION_RULES,
      photos: { ...DEFAULT_FILE_AUTOMATION_RULES.photos, onSold: "keep" as const },
      documents: { ...DEFAULT_FILE_AUTOMATION_RULES.documents, onSold: "keep" as const }
    };
    const issues = detectInconsistencies(
      input({
        rules,
        cars: [{ id: "v", placa: "EEE5E55", estado_venda: "VENDIDO" }],
        mappings: [
          { folderId: "d", carroId: "v", automationKey: "vehicle_documents", paused: false },
          { folderId: "p", carroId: "v", automationKey: "vehicle_photos", paused: false }
        ],
        folderParentById: new Map([
          ["d", "r-docs"],
          ["p", "r-fotos"]
        ]),
        fileCountByFolderId: new Map([["p", 2]])
      })
    );
    expect(issues).toEqual([]);
  });
});
