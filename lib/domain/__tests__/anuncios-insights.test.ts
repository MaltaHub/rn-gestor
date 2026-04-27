import { describe, expect, it } from "vitest";
import {
  ANUNCIO_INSIGHT_CODE,
  ANUNCIO_INSIGHT_MESSAGES,
  collectInsightItems,
  getAnuncioRowClass,
} from "@/lib/domain/anuncios-insights";

const BASE_FLAGS = {
  hasPendingAction: false,
  deleteRecommended: false,
  replaceRecommended: false,
  hasGroupDuplicateAds: false,
  missingData: false,
  insightCode: null,
  insightMessage: null,
};

describe("anuncios insight priority", () => {
  it("keeps substitute as the primary insight when a replacement is available", () => {
    const items = collectInsightItems({
      ...BASE_FLAGS,
      hasPendingAction: true,
      deleteRecommended: true,
      replaceRecommended: true,
      hasGroupDuplicateAds: true,
    });

    expect(items[0]).toMatchObject({
      code: ANUNCIO_INSIGHT_CODE.SUBSTITUIR_ANUNCIO_REPRESENTANTE,
    });
  });

  it("keeps delete ahead of duplicate/update warnings when there is no replacement", () => {
    const items = collectInsightItems({
      ...BASE_FLAGS,
      hasPendingAction: true,
      deleteRecommended: true,
      hasGroupDuplicateAds: true,
    });

    expect(items[0]).toMatchObject({
      code: ANUNCIO_INSIGHT_CODE.APAGAR_ANUNCIO_RECOMENDADO,
    });
    expect(getAnuncioRowClass({ ...BASE_FLAGS, deleteRecommended: true })).toBe("sheet-row-delete");
  });

  it("uses preco extra above generic missing reference when the backend says so", () => {
    const flags = {
      ...BASE_FLAGS,
      insightCode: ANUNCIO_INSIGHT_CODE.ANUNCIO_PRECO_EXTRA,
      insightMessage: "",
    };

    const items = collectInsightItems(flags);

    expect(items).toEqual([
      {
        code: ANUNCIO_INSIGHT_CODE.ANUNCIO_PRECO_EXTRA,
        message: ANUNCIO_INSIGHT_MESSAGES[ANUNCIO_INSIGHT_CODE.ANUNCIO_PRECO_EXTRA],
      },
    ]);
    expect(getAnuncioRowClass(flags)).toBe("sheet-row-warning");
  });

  it("keeps generic missing reference when no backend code is provided", () => {
    const items = collectInsightItems({
      ...BASE_FLAGS,
      missingData: true,
    });

    expect(items).toEqual([
      {
        code: ANUNCIO_INSIGHT_CODE.ANUNCIO_SEM_REFERENCIA,
        message: ANUNCIO_INSIGHT_MESSAGES[ANUNCIO_INSIGHT_CODE.ANUNCIO_SEM_REFERENCIA],
      },
    ]);
  });

  it("trusts the backend primary insight and does not stack conflicting items", () => {
    const items = collectInsightItems({
      ...BASE_FLAGS,
      hasPendingAction: true,
      deleteRecommended: true,
      hasGroupDuplicateAds: true,
      insightCode: ANUNCIO_INSIGHT_CODE.SUBSTITUIR_ANUNCIO_REPRESENTANTE,
      insightMessage: "Substituir pelo representante disponivel.",
    });

    expect(items).toEqual([
      {
        code: ANUNCIO_INSIGHT_CODE.SUBSTITUIR_ANUNCIO_REPRESENTANTE,
        message: "Substituir pelo representante disponivel.",
      },
    ]);
  });
});
