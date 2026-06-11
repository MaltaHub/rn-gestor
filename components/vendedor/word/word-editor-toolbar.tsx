"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";

const FONTS = ["Arial", "Times New Roman", "Georgia", "Courier New", "Verdana", "Calibri"];
// Escada de tamanhos do Word (pt) — o campo tambem aceita qualquer valor digitado.
const SIZE_LADDER = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
const SIZE_MIN = 6;
const SIZE_MAX = 96;
const BASE_SIZE_PT = 12; // tamanho-base do documento (doc-styles.ts)

/** Converte o valor do mark fontSize ("16px" | "14pt") para pt. */
function toPt(value: string): number | null {
  const m = /^([\d.]+)\s*(px|pt)$/.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return m[2] === "px" ? Math.round(n * 0.75 * 2) / 2 : n;
}

type PainterFormat = {
  marks: Array<{ type: string; attrs: Record<string, unknown> }>;
  textAlign: string;
};

/** Captura o formato (marks + alinhamento) na posicao atual do cursor/selecao. */
function captureFormat(editor: Editor): PainterFormat {
  const { state } = editor;
  const { empty, from, $from } = state.selection;
  const marks = empty ? (state.storedMarks ?? $from.marks()) : (state.doc.nodeAt(from)?.marks ?? $from.marks());
  const textAlign = (["center", "right", "justify"] as const).find((a) => editor.isActive({ textAlign: a })) ?? "left";
  return { marks: marks.map((m) => ({ type: m.type.name, attrs: m.attrs })), textAlign };
}

function TBtn({
  active,
  disabled,
  onClick,
  title,
  children
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`word-tb-btn ${active ? "is-active" : ""}`.trim()}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function WordEditorToolbar({
  editor,
  onInsertSignature,
  onInsertLogo,
  onInsertImageUrl,
  trailing
}: {
  editor: Editor | null;
  onInsertSignature: () => void;
  onInsertLogo: () => void;
  onInsertImageUrl: () => void;
  /** Controles extras na ponta direita do ribbon (margens, zoom, paginas). */
  trailing?: ReactNode;
}) {
  // ----- Pincel de formatacao: copia o formato e aplica na proxima selecao.
  const [painter, setPainter] = useState<PainterFormat | null>(null);
  useEffect(() => {
    if (!editor || !painter) return;
    const apply = () => {
      const { selection } = editor.state;
      if (selection.empty || selection instanceof NodeSelection) return;
      const chain = editor.chain().focus().unsetAllMarks();
      for (const mark of painter.marks) chain.setMark(mark.type, mark.attrs);
      chain.setTextAlign(painter.textAlign);
      chain.run();
      setPainter(null);
    };
    editor.on("selectionUpdate", apply);
    return () => {
      editor.off("selectionUpdate", apply);
    };
  }, [editor, painter]);

  // ----- Tamanho da fonte: campo livre em pt (Word-like), com A- / A+.
  const fontSizeAttr = (editor?.getAttributes("textStyle").fontSize as string) || "";
  const selSizePt = toPt(fontSizeAttr) ?? BASE_SIZE_PT;
  const [sizeDraft, setSizeDraft] = useState(String(selSizePt));
  useEffect(() => {
    setSizeDraft(Number.isInteger(selSizePt) ? String(selSizePt) : selSizePt.toFixed(1));
  }, [selSizePt]);

  if (!editor) return <div className="word-toolbar" aria-hidden />;

  function applySize(raw: string) {
    if (!editor) return;
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setSizeDraft(String(selSizePt));
      return;
    }
    const pt = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(n * 2) / 2));
    editor.chain().focus().setFontSize(`${pt}pt`).run();
  }

  function stepSize(direction: 1 | -1) {
    if (!editor) return;
    const next =
      direction === 1
        ? (SIZE_LADDER.find((s) => s > selSizePt) ?? Math.min(SIZE_MAX, selSizePt + 4))
        : ([...SIZE_LADDER].reverse().find((s) => s < selSizePt) ?? Math.max(SIZE_MIN, selSizePt - 1));
    editor.chain().focus().setFontSize(`${next}pt`).run();
  }

  const color = (editor.getAttributes("textStyle").color as string) || "#111111";
  const highlight = (editor.getAttributes("highlight").color as string) || "#fff3a3";
  const fontFamily = (editor.getAttributes("textStyle").fontFamily as string) || "";

  const floatType = editor.isActive("image")
    ? "image"
    : editor.isActive("signatureLine")
      ? "signatureLine"
      : null;
  const floatAttrs = floatType ? editor.getAttributes(floatType) : {};
  const isFloating = Boolean(floatAttrs.floating);
  const isLocked = Boolean(floatAttrs.locked);
  const hasNodeSelected = editor.state.selection instanceof NodeSelection;
  const inColumns = editor.isActive("columnBlock");

  function toggleLock() {
    if (!editor || !floatType) return;
    const next = !isLocked;
    const chain = editor.chain().updateAttributes(floatType, { locked: next });
    // Ao bloquear, tira a selecao do no (senao digitar substituiria o item).
    if (next) chain.setTextSelection(editor.state.selection.to);
    chain.run();
  }

  return (
    <div className="word-toolbar" role="toolbar" aria-label="Formatacao">
      <div className="word-tb-group">
        <TBtn
          title={painter ? "Pincel armado: selecione o texto de destino (clique para cancelar)" : "Pincel de formatacao (copia o formato; selecione o destino para colar)"}
          active={Boolean(painter)}
          onClick={() => setPainter((prev) => (prev ? null : captureFormat(editor)))}
        >
          🖌
        </TBtn>
      </div>

      <div className="word-tb-group">
        <select
          className="word-tb-select"
          title="Estilo"
          value={
            editor.isActive("heading", { level: 1 })
              ? "h1"
              : editor.isActive("heading", { level: 2 })
                ? "h2"
                : editor.isActive("heading", { level: 3 })
                  ? "h3"
                  : "p"
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v === "p") editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
          }}
        >
          <option value="p">Normal</option>
          <option value="h1">Titulo 1</option>
          <option value="h2">Titulo 2</option>
          <option value="h3">Titulo 3</option>
        </select>

        <select
          className="word-tb-select"
          title="Fonte"
          value={fontFamily}
          onChange={(e) => {
            const v = e.target.value;
            if (v) editor.chain().focus().setFontFamily(v).run();
            else editor.chain().focus().unsetFontFamily().run();
          }}
        >
          <option value="">Fonte</option>
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <span className="word-tb-size" title="Tamanho da fonte (pt)">
          <input
            className="word-tb-size-input"
            aria-label="Tamanho da fonte"
            value={sizeDraft}
            list="word-font-sizes"
            inputMode="decimal"
            onChange={(e) => setSizeDraft(e.target.value)}
            onBlur={(e) => applySize(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applySize((e.target as HTMLInputElement).value);
              }
            }}
          />
          <datalist id="word-font-sizes">
            {SIZE_LADDER.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <TBtn title="Diminuir fonte" onClick={() => stepSize(-1)}>
            A<sub>−</sub>
          </TBtn>
          <TBtn title="Aumentar fonte" onClick={() => stepSize(1)}>
            A<sup>+</sup>
          </TBtn>
        </span>
      </div>

      <div className="word-tb-group">
        <TBtn title="Negrito" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <strong>N</strong>
        </TBtn>
        <TBtn title="Italico" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </TBtn>
        <TBtn
          title="Sublinhado"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <u>S</u>
        </TBtn>
        <TBtn
          title="Tachado"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <s>T</s>
        </TBtn>
        <label className="word-tb-color" title="Cor da fonte">
          <span aria-hidden>A</span>
          <input
            type="color"
            value={color}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>
        <label className="word-tb-color" title="Cor de fundo (marca-texto)">
          <span aria-hidden className="word-tb-color-bg">A</span>
          <input
            type="color"
            value={highlight}
            onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
          />
        </label>
      </div>

      <div className="word-tb-group">
        <TBtn
          title="Alinhar a esquerda"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          ⯇
        </TBtn>
        <TBtn
          title="Centralizar"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          ☰
        </TBtn>
        <TBtn
          title="Alinhar a direita"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          ⯈
        </TBtn>
        <TBtn
          title="Justificar"
          active={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          ▤
        </TBtn>
        <TBtn
          title="Lista com marcadores"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •
        </TBtn>
        <TBtn
          title="Lista numerada"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </TBtn>
      </div>

      <div className="word-tb-group">
        <TBtn title="Inserir linha de assinatura" onClick={onInsertSignature}>
          ✒ Assinatura
        </TBtn>
        <TBtn title="Inserir logo" onClick={onInsertLogo}>
          🏷 Logo
        </TBtn>
        <TBtn title="Inserir imagem por URL" onClick={onInsertImageUrl}>
          🖼 Imagem
        </TBtn>
        {inColumns ? (
          <TBtn title="Remover colunas (mescla o conteudo em texto corrido)" onClick={() => editor.chain().focus().removeColumnBlock().run()}>
            ▭ Remover colunas
          </TBtn>
        ) : (
          <TBtn title="Inserir duas colunas" onClick={() => editor.chain().focus().insertColumnBlock().run()}>
            ▦ Colunas
          </TBtn>
        )}
        <TBtn title="Inserir quebra de pagina (Ctrl+Enter)" onClick={() => editor.chain().focus().insertPageBreak().run()}>
          ⤓ Nova página
        </TBtn>
      </div>

      {editor.isActive("image") ? (
        <div className="word-tb-group">
          <span className="word-tb-label">Largura:</span>
          {(
            [
              ["P", "120px"],
              ["M", "220px"],
              ["G", "360px"],
              ["Total", "100%"]
            ] as const
          ).map(([label, width]) => (
            <TBtn
              key={width}
              title={`Largura ${label}`}
              onClick={() => editor.chain().focus().updateAttributes("image", { width }).run()}
            >
              {label}
            </TBtn>
          ))}
        </div>
      ) : null}

      {floatType ? (
        <div className="word-tb-group">
          <TBtn
            title={isFloating ? "Fixar no texto" : "Posicao livre (arrastar para mover)"}
            active={isFloating}
            onClick={() =>
              editor
                .chain()
                .focus()
                .updateAttributes(
                  floatType,
                  isFloating ? { floating: false, left: 0, top: 0 } : { floating: true, left: 20, top: 20 }
                )
                .run()
            }
          >
            {isFloating ? "⤓ No texto" : "✥ Posicao livre"}
          </TBtn>
          <TBtn
            title={isLocked ? "Desbloquear item" : "Bloquear item (cliques atravessam; o texto atras fica editavel)"}
            active={isLocked}
            onClick={toggleLock}
          >
            {isLocked ? "🔓" : "🔒"}
          </TBtn>
        </div>
      ) : null}

      {hasNodeSelected ? (
        <div className="word-tb-group">
          <TBtn
            title="Excluir item selecionado (Del)"
            onClick={() => editor.chain().focus().deleteSelection().run()}
          >
            🗑 Excluir
          </TBtn>
        </div>
      ) : null}

      {trailing ? <div className="word-tb-group is-trailing">{trailing}</div> : null}
    </div>
  );
}
