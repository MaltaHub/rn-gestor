"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Icon, type IconName } from "@/components/vendedor/ui/icons";

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

// Contagem de itens travados por versao do documento (docs sao imutaveis:
// mover o cursor nao reconta).
const lockedByDoc = new WeakMap<PMNode, number>();
function countLocked(doc: PMNode): number {
  const cached = lockedByDoc.get(doc);
  if (cached != null) return cached;
  let count = 0;
  doc.descendants((node) => {
    if (node.attrs?.locked) count += 1;
  });
  lockedByDoc.set(doc, count);
  return count;
}

type ToolbarState = {
  style: "p" | "h1" | "h2" | "h3";
  fontFamily: string;
  sizePt: number;
  color: string;
  highlight: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  align: "left" | "center" | "right" | "justify";
  bullet: boolean;
  ordered: boolean;
  image: boolean;
  floatType: "image" | "signatureLine" | null;
  floating: boolean;
  locked: boolean;
  nodeSelected: boolean;
  inColumns: boolean;
  inCondition: boolean;
  lockedCount: number;
  canUndo: boolean;
  canRedo: boolean;
};

function TBtn({
  active,
  disabled,
  onClick,
  title,
  icon,
  children,
  testId
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  icon?: IconName;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={["word-tb-btn", active ? "is-active" : "", children ? "has-label" : "", icon ? "has-icon" : ""].filter(Boolean).join(" ")}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      data-testid={testId}
    >
      {icon ? <Icon name={icon} size={17} /> : null}
      {children ? <span className="word-tb-text">{children}</span> : null}
    </button>
  );
}

/**
 * Ribbon do editor (uma faixa, estilo Word). O estado dos botões vem de
 * useEditorState: o ribbon re-renderiza só quando o que ele MOSTRA muda, e
 * não a cada tecla (o editor não re-renderiza o React por transação).
 */
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
  const state = useEditorState<ToolbarState | null>({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      const textStyle = e.getAttributes("textStyle");
      const floatType = e.isActive("image") ? "image" : e.isActive("signatureLine") ? "signatureLine" : null;
      const floatAttrs = floatType ? e.getAttributes(floatType) : {};
      return {
        style: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "p",
        fontFamily: (textStyle.fontFamily as string) || "",
        sizePt: toPt((textStyle.fontSize as string) || "") ?? BASE_SIZE_PT,
        color: (textStyle.color as string) || "#111111",
        highlight: (e.getAttributes("highlight").color as string) || "#fff3a3",
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        align: (["center", "right", "justify"] as const).find((a) => e.isActive({ textAlign: a })) ?? "left",
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        image: e.isActive("image"),
        floatType,
        floating: Boolean(floatAttrs.floating),
        locked: Boolean(floatAttrs.locked),
        nodeSelected: e.state.selection instanceof NodeSelection,
        inColumns: e.isActive("columnBlock"),
        inCondition: e.isActive("conditionalBlock"),
        lockedCount: countLocked(e.state.doc),
        canUndo: e.can().undo(),
        canRedo: e.can().redo()
      };
    }
  });

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
  const selSizePt = state?.sizePt ?? BASE_SIZE_PT;
  const [sizeDraft, setSizeDraft] = useState(String(selSizePt));
  useEffect(() => {
    setSizeDraft(Number.isInteger(selSizePt) ? String(selSizePt) : selSizePt.toFixed(1));
  }, [selSizePt]);

  if (!editor || !state) return <div className="word-toolbar" aria-hidden />;
  const e = editor;

  function applySize(raw: string) {
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setSizeDraft(String(selSizePt));
      return;
    }
    const pt = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(n * 2) / 2));
    e.chain().focus().setFontSize(`${pt}pt`).run();
  }

  function stepSize(direction: 1 | -1) {
    const next =
      direction === 1
        ? (SIZE_LADDER.find((s) => s > selSizePt) ?? Math.min(SIZE_MAX, selSizePt + 4))
        : ([...SIZE_LADDER].reverse().find((s) => s < selSizePt) ?? Math.max(SIZE_MIN, selSizePt - 1));
    e.chain().focus().setFontSize(`${next}pt`).run();
  }

  function unlockAll() {
    e.chain()
      .focus()
      .command(({ tr, state: s }) => {
        let changed = false;
        // setNodeMarkup nao altera tamanhos -> posicoes originais continuam validas.
        s.doc.descendants((node, pos) => {
          if (node.attrs?.locked) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, locked: false });
            changed = true;
          }
        });
        return changed;
      })
      .run();
  }

  function toggleLock() {
    if (!state?.floatType) return;
    const next = !state.locked;
    const chain = e.chain().updateAttributes(state.floatType, { locked: next });
    // Ao bloquear, tira a selecao do no (senao digitar substituiria o item).
    if (next) chain.setTextSelection(e.state.selection.to);
    chain.run();
  }

  return (
    <div className="word-toolbar" role="toolbar" aria-label="Formatação">
      <div className="word-tb-group">
        <TBtn title="Desfazer (Ctrl+Z)" icon="arrowLeft" disabled={!state.canUndo} onClick={() => e.chain().focus().undo().run()} />
        <TBtn title="Refazer (Ctrl+Y)" icon="refresh" disabled={!state.canRedo} onClick={() => e.chain().focus().redo().run()} />
        <TBtn
          title={painter ? "Pincel armado: selecione o texto de destino (clique para cancelar)" : "Pincel de formatação (copia o formato; selecione o destino)"}
          icon="brush"
          active={Boolean(painter)}
          onClick={() => setPainter((prev) => (prev ? null : captureFormat(e)))}
        />
      </div>

      <div className="word-tb-group">
        <select
          className="word-tb-select"
          title="Estilo do parágrafo"
          aria-label="Estilo do parágrafo"
          value={state.style}
          onChange={(event) => {
            const v = event.target.value;
            if (v === "p") e.chain().focus().setParagraph().run();
            else e.chain().focus().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
          }}
        >
          <option value="p">Normal</option>
          <option value="h1">Título 1</option>
          <option value="h2">Título 2</option>
          <option value="h3">Título 3</option>
        </select>

        <select
          className="word-tb-select is-font"
          title="Fonte"
          aria-label="Fonte"
          value={state.fontFamily}
          onChange={(event) => {
            const v = event.target.value;
            if (v) e.chain().focus().setFontFamily(v).run();
            else e.chain().focus().unsetFontFamily().run();
          }}
        >
          <option value="">Fonte padrão</option>
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <span className="word-tb-size" title="Tamanho da fonte (pt)">
          <TBtn title="Diminuir fonte" onClick={() => stepSize(-1)}>
            A−
          </TBtn>
          <input
            className="word-tb-size-input"
            aria-label="Tamanho da fonte"
            value={sizeDraft}
            list="word-font-sizes"
            inputMode="decimal"
            onChange={(event) => setSizeDraft(event.target.value)}
            onBlur={(event) => applySize(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applySize((event.target as HTMLInputElement).value);
              }
            }}
          />
          <datalist id="word-font-sizes">
            {SIZE_LADDER.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <TBtn title="Aumentar fonte" onClick={() => stepSize(1)}>
            A+
          </TBtn>
        </span>
      </div>

      <div className="word-tb-group">
        <TBtn title="Negrito (Ctrl+B)" icon="bold" active={state.bold} onClick={() => e.chain().focus().toggleBold().run()} />
        <TBtn title="Itálico (Ctrl+I)" icon="italic" active={state.italic} onClick={() => e.chain().focus().toggleItalic().run()} />
        <TBtn title="Sublinhado (Ctrl+U)" icon="underline" active={state.underline} onClick={() => e.chain().focus().toggleUnderline().run()} />
        <TBtn title="Tachado" icon="strike" active={state.strike} onClick={() => e.chain().focus().toggleStrike().run()} />
        <label className="word-tb-color" title="Cor da fonte">
          <span aria-hidden style={{ borderBottomColor: state.color }}>A</span>
          <input type="color" value={state.color} onChange={(event) => e.chain().focus().setColor(event.target.value).run()} aria-label="Cor da fonte" />
        </label>
        <label className="word-tb-color" title="Marca-texto">
          <span aria-hidden className="word-tb-color-bg" style={{ background: state.highlight }}>
            A
          </span>
          <input
            type="color"
            value={state.highlight}
            onChange={(event) => e.chain().focus().toggleHighlight({ color: event.target.value }).run()}
            aria-label="Cor do marca-texto"
          />
        </label>
      </div>

      <div className="word-tb-group">
        <TBtn title="Alinhar à esquerda" icon="alignLeft" active={state.align === "left"} onClick={() => e.chain().focus().setTextAlign("left").run()} />
        <TBtn title="Centralizar" icon="alignCenter" active={state.align === "center"} onClick={() => e.chain().focus().setTextAlign("center").run()} />
        <TBtn title="Alinhar à direita" icon="alignRight" active={state.align === "right"} onClick={() => e.chain().focus().setTextAlign("right").run()} />
        <TBtn title="Justificar" icon="alignJustify" active={state.align === "justify"} onClick={() => e.chain().focus().setTextAlign("justify").run()} />
        <TBtn title="Lista com marcadores" icon="list" active={state.bullet} onClick={() => e.chain().focus().toggleBulletList().run()} />
        <TBtn title="Lista numerada" icon="listOrdered" active={state.ordered} onClick={() => e.chain().focus().toggleOrderedList().run()} />
      </div>

      <div className="word-tb-group">
        {state.inCondition ? (
          <TBtn title="Tirar a condição desta seção (o texto passa a sair sempre)" icon="branch" active onClick={() => e.chain().focus().removeConditionalBlock().run()} testId="word-tb-condicao">
            Sem condição
          </TBtn>
        ) : (
          <TBtn
            title="Seção condicional: o trecho só sai quando a venda casar com a condição (ex.: só se tiver entrada)"
            icon="branch"
            onClick={() => e.chain().focus().insertConditionalBlock().run()}
            testId="word-tb-condicao"
          >
            Condição
          </TBtn>
        )}
        <TBtn title="Inserir linha de assinatura" icon="signature" onClick={onInsertSignature}>
          Assinatura
        </TBtn>
        <TBtn title="Inserir logo da loja" icon="logo" onClick={onInsertLogo}>
          Logo
        </TBtn>
        <TBtn title="Inserir imagem por URL" icon="image" onClick={onInsertImageUrl} />
        {state.inColumns ? (
          <TBtn title="Remover colunas (mescla o conteúdo em texto corrido)" icon="columns" active onClick={() => e.chain().focus().removeColumnBlock().run()} />
        ) : (
          <TBtn title="Inserir duas colunas" icon="columns" onClick={() => e.chain().focus().insertColumnBlock().run()} />
        )}
        <TBtn title="Quebra de página (Ctrl+Enter)" icon="pagebreak" onClick={() => e.chain().focus().insertPageBreak().run()} />
      </div>

      {state.image ? (
        <div className="word-tb-group">
          <span className="word-tb-label">Largura</span>
          {(
            [
              ["P", "120px"],
              ["M", "220px"],
              ["G", "360px"],
              ["Total", "100%"]
            ] as const
          ).map(([label, width]) => (
            <TBtn key={width} title={`Largura ${label}`} onClick={() => e.chain().focus().updateAttributes("image", { width }).run()}>
              {label}
            </TBtn>
          ))}
        </div>
      ) : null}

      {state.floatType ? (
        <div className="word-tb-group">
          <TBtn
            title={state.floating ? "Fixar no texto" : "Posição livre (arrastar para mover)"}
            icon={state.floating ? "anchor" : "move"}
            active={state.floating}
            onClick={() =>
              e
                .chain()
                .focus()
                .updateAttributes(state.floatType as string, state.floating ? { floating: false, left: 0, top: 0 } : { floating: true, left: 20, top: 20 })
                .run()
            }
          >
            {state.floating ? "No texto" : "Posição livre"}
          </TBtn>
          <TBtn
            title={state.locked ? "Desbloquear item" : "Bloquear item (cliques atravessam; o texto atrás fica editável)"}
            icon={state.locked ? "unlock" : "lock"}
            active={state.locked}
            onClick={toggleLock}
          />
        </div>
      ) : null}

      {state.nodeSelected ? (
        <div className="word-tb-group">
          <TBtn title="Excluir item selecionado (Del)" icon="trash" onClick={() => e.chain().focus().deleteSelection().run()}>
            Excluir
          </TBtn>
        </div>
      ) : null}

      {state.lockedCount > 0 ? (
        <div className="word-tb-group">
          <TBtn
            title={state.lockedCount === 1 ? "Destravar o item bloqueado do documento" : `Destravar os ${state.lockedCount} itens bloqueados do documento`}
            icon="unlock"
            onClick={unlockAll}
          >
            {state.lockedCount > 1 ? `Desbloquear (${state.lockedCount})` : "Desbloquear"}
          </TBtn>
        </div>
      ) : null}

      {trailing ? <div className="word-tb-group is-trailing">{trailing}</div> : null}
    </div>
  );
}
