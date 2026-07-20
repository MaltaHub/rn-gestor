import { describe, expect, it } from "vitest";
import { buildFormValuesFromRow, getFormFieldKind, toDatetimeLocal, type FormFieldContext } from "@/components/ui-grid/sheet-form";

function makeContext(overrides: Partial<FormFieldContext> = {}): FormFieldContext {
  return {
    activeSheetKey: "carros",
    relationByColumn: {},
    lookupOptionsByColumn: {},
    sampleValueByColumn: {},
    ...overrides
  };
}

describe("toDatetimeLocal", () => {
  it("nao estoura com Invalid Date (regressao: form nao abria em linhas seletas)", () => {
    expect(toDatetimeLocal(new Date("CRETA 1.6T"))).toBe("");
    expect(toDatetimeLocal(new Date(Number.NaN))).toBe("");
  });

  it("converte timestamp valido para o formato datetime-local", () => {
    expect(toDatetimeLocal(new Date("2026-05-28T19:05:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe("getFormFieldKind", () => {
  it("nao classifica texto com 'T' como datetime pela amostra", () => {
    const context = makeContext({ sampleValueByColumn: { modelo: "CRETA 1.6T" } });
    expect(getFormFieldKind(context, "modelo")).toBe("text");
  });

  it("classifica timestamp ISO real como datetime", () => {
    const context = makeContext({ sampleValueByColumn: { created_at: "2026-05-28T19:05:21+00:00" } });
    expect(getFormFieldKind(context, "created_at")).toBe("datetime");
  });
});

describe("buildFormValuesFromRow", () => {
  const fieldContext = makeContext();

  it("nao estoura quando coluna 'data_*' guarda texto com 'T' numa linha", () => {
    // data_* e classificada datetime pelo NOME; a linha, porem, tem lixo com "T".
    const run = () =>
      buildFormValuesFromRow({
        row: { data_evento: "AGILE LTZ" },
        formEditableColumns: ["data_evento"],
        modeloLabelByValue: {},
        fieldContext
      });

    expect(run).not.toThrow();
    expect(run().data_evento).toBe("AGILE LTZ");
  });

  it("converte timestamp ISO real para datetime-local", () => {
    const values = buildFormValuesFromRow({
      row: { data_evento: "2026-05-28T19:05:00Z" },
      formEditableColumns: ["data_evento"],
      modeloLabelByValue: {},
      fieldContext
    });

    expect(values.data_evento).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
