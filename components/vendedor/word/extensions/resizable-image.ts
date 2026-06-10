import Image from "@tiptap/extension-image";
import { mergeAttributes } from "@tiptap/core";
import {
  applyFloatStyle,
  attachFloatingDrag,
  floatStyleString,
  floatingAttributes,
  visualScale
} from "@/components/vendedor/word/extensions/floating";

/**
 * Imagem redimensionavel (alca de arrasto) e com "posicao livre" (flutuante).
 * A largura e a posicao vao como inline style no renderHTML, entao o print
 * (generateHTML usa renderHTML, nao o NodeView) respeita ambos.
 */
function widthToCss(width: unknown): string {
  if (width == null || width === "") return "";
  return typeof width === "number" ? `${width}px` : String(width);
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.width || el.getAttribute("width") || null,
        renderHTML: () => ({})
      },
      ...floatingAttributes()
    };
  },

  renderHTML({ HTMLAttributes, node }) {
    const parts: string[] = [];
    const w = widthToCss(node.attrs.width);
    if (w) parts.push(`width:${w}`);
    const fs = floatStyleString(node.attrs);
    if (fs) parts.push(fs);
    const style = parts.join(";");
    return ["img", mergeAttributes(HTMLAttributes, style ? { style } : {})];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const wrapper = document.createElement("div");
      wrapper.className = "word-img-wrap";

      const img = document.createElement("img");
      img.src = node.attrs.src as string;
      if (node.attrs.alt) img.alt = node.attrs.alt as string;
      const initial = widthToCss(node.attrs.width);
      if (initial) img.style.width = initial;
      wrapper.appendChild(img);

      const handle = document.createElement("span");
      handle.className = "word-img-handle";
      handle.contentEditable = "false";
      wrapper.appendChild(handle);

      handle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const scale = visualScale(img);
        const startX = event.clientX;
        const startW = img.offsetWidth;
        const onMove = (e: MouseEvent) => {
          img.style.width = `${Math.max(40, startW + (e.clientX - startX) / scale)}px`;
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          if (typeof getPos === "function") {
            editor
              .chain()
              .command(({ tr }) => {
                const pos = getPos();
                if (typeof pos !== "number") return false;
                const current = tr.doc.nodeAt(pos);
                if (!current) return false;
                tr.setNodeMarkup(pos, undefined, { ...current.attrs, width: img.style.width });
                return true;
              })
              .run();
          }
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });

      applyFloatStyle(wrapper, node.attrs);
      attachFloatingDrag({ dom: wrapper, editor, getPos, fallbackAttrs: node.attrs });

      return {
        dom: wrapper,
        update: (updated) => {
          if (updated.type.name !== node.type.name) return false;
          if (updated.attrs.src !== img.src) img.src = updated.attrs.src as string;
          img.style.width = widthToCss(updated.attrs.width);
          applyFloatStyle(wrapper, updated.attrs);
          return true;
        },
        ignoreMutation: () => true
      };
    };
  }
});
