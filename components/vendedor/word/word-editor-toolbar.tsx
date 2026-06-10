"use client";

import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { NodeSelection } from "@tiptap/pm/state";

const FONTS = ["Arial", "Times New Roman", "Georgia", "Courier New", "Verdana", "Calibri"];
const SIZES = ["10px", "12px", "14px", "16px", "18px", "24px", "32px"];

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
  onInsertImageUrl
}: {
  editor: Editor | null;
  onInsertSignature: () => void;
  onInsertLogo: () => void;
  onInsertImageUrl: () => void;
}) {
  if (!editor) return <div className="word-toolbar" aria-hidden />;

  const color = (editor.getAttributes("textStyle").color as string) || "#111111";
  const highlight = (editor.getAttributes("highlight").color as string) || "#fff3a3";
  const fontFamily = (editor.getAttributes("textStyle").fontFamily as string) || "";
  const fontSize = (editor.getAttributes("textStyle").fontSize as string) || "";

  const floatType = editor.isActive("image")
    ? "image"
    : editor.isActive("signatureLine")
      ? "signatureLine"
      : null;
  const isFloating = floatType ? Boolean(editor.getAttributes(floatType).floating) : false;
  const hasNodeSelected = editor.state.selection instanceof NodeSelection;

  return (
    <div className="word-toolbar" role="toolbar" aria-label="Formatacao">
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

        <select
          className="word-tb-select"
          title="Tamanho"
          value={fontSize}
          onChange={(e) => {
            const v = e.target.value;
            if (v) editor.chain().focus().setFontSize(v).run();
            else editor.chain().focus().unsetFontSize().run();
          }}
        >
          <option value="">Tamanho</option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s.replace("px", "")}
            </option>
          ))}
        </select>
      </div>

      <div className="word-tb-group">
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
      </div>

      <div className="word-tb-group">
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
    </div>
  );
}
