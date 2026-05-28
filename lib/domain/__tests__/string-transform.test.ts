import { describe, expect, it } from "vitest";
import { applyTransformPipeline, type TransformStep } from "@/lib/domain/string-transform";

describe("string transform pipeline", () => {
  it("aplica concatenacao condicional por length (exemplo do usuario)", () => {
    const steps: TransformStep[] = [{ when: { op: "lengthGt", n: 3 }, then: { op: "suffix", text: "_" } }];
    expect(applyTransformPipeline("ABCD", steps)).toBe("ABCD_");
    expect(applyTransformPipeline("AB", steps)).toBe("AB");
  });

  it("encadeia condicoes: split('_')[0] > '300' concatena 'alto'", () => {
    const steps: TransformStep[] = [
      { when: { op: "lengthGt", n: 3 }, then: { op: "suffix", text: "_" } },
      { when: { op: "partGt", sep: "_", index: 0, value: "300" }, then: { op: "suffix", text: "alto" } }
    ];
    // "350" -> length 3 (nao concatena _) -> part[0]="350" > 300 -> "350alto"
    expect(applyTransformPipeline("350", steps)).toBe("350alto");
    // "3500" -> length 4 -> "3500_" -> part[0]="3500" > 300 -> "3500_alto"
    expect(applyTransformPipeline("3500", steps)).toBe("3500_alto");
    // "250" -> length 3 -> part[0]="250" nao > 300 -> "250"
    expect(applyTransformPipeline("250", steps)).toBe("250");
  });

  it("split + join (insere caractere entre os pedacos)", () => {
    const steps: TransformStep[] = [{ when: { op: "always" }, then: { op: "splitJoin", sep: " ", join: "-" } }];
    expect(applyTransformPipeline("a b c", steps)).toBe("a-b-c");
  });

  it("take/slice/replace/upper compostos", () => {
    expect(applyTransformPipeline("AAA-123", [{ when: { op: "always" }, then: { op: "take", sep: "-", index: 1 } }])).toBe("123");
    expect(applyTransformPipeline("hello", [{ when: { op: "always" }, then: { op: "slice", start: 0, end: 3 } }])).toBe("hel");
    expect(applyTransformPipeline("a.b.a", [{ when: { op: "always" }, then: { op: "replace", find: "a", replace: "X" } }])).toBe("X.b.X");
    expect(applyTransformPipeline("abc", [{ when: { op: "contains", text: "b" }, then: { op: "upper" } }])).toBe("ABC");
  });

  it("nao transforma quando a condicao falha", () => {
    const steps: TransformStep[] = [{ when: { op: "startsWith", text: "X" }, then: { op: "set", text: "MUDOU" } }];
    expect(applyTransformPipeline("ABC", steps)).toBe("ABC");
    expect(applyTransformPipeline("XYZ", steps)).toBe("MUDOU");
  });
});
