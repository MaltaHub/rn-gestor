"use client";

import {
  applyTransformPipeline,
  type ConditionOp,
  type TransformOp,
  type TransformStep
} from "@/lib/domain/string-transform";

type MassTransformEditorProps = {
  steps: TransformStep[];
  onChange: (steps: TransformStep[]) => void;
  /** Valores atuais (amostra) das linhas selecionadas, para o preview. */
  sampleValues: string[];
};

const CONDITION_LABELS: Record<ConditionOp["op"], string> = {
  always: "Sempre",
  lengthGt: "Tamanho >",
  lengthLt: "Tamanho <",
  lengthEq: "Tamanho =",
  contains: "Contem",
  startsWith: "Comeca com",
  endsWith: "Termina com",
  equals: "Igual a",
  isEmpty: "Vazio",
  notEmpty: "Nao vazio",
  valueGt: "Valor (numero) >",
  valueLt: "Valor (numero) <",
  partGt: "Parte (split) >",
  partLt: "Parte (split) <"
};

const TRANSFORM_LABELS: Record<TransformOp["op"], string> = {
  prefix: "Concatenar antes",
  suffix: "Concatenar depois",
  set: "Definir valor",
  replace: "Substituir",
  splitJoin: "Split + juntar com",
  take: "Pegar parte (split)",
  slice: "Recortar (slice)",
  upper: "MAIUSCULAS",
  lower: "minusculas",
  trim: "Remover espacos",
  add: "Somar",
  subtract: "Subtrair",
  multiply: "Multiplicar por",
  divide: "Dividir por",
  round: "Arredondar (casas)"
};

function defaultCondition(op: ConditionOp["op"]): ConditionOp {
  switch (op) {
    case "lengthGt":
    case "lengthLt":
    case "lengthEq":
      return { op, n: 3 };
    case "contains":
    case "startsWith":
    case "endsWith":
    case "equals":
      return { op, text: "" };
    case "valueGt":
    case "valueLt":
      return { op, value: "" };
    case "partGt":
    case "partLt":
      return { op, sep: "_", index: 0, value: "" };
    default:
      return { op } as ConditionOp;
  }
}

function defaultTransform(op: TransformOp["op"]): TransformOp {
  switch (op) {
    case "prefix":
    case "suffix":
    case "set":
      return { op, text: "" };
    case "replace":
      return { op, find: "", replace: "" };
    case "splitJoin":
      return { op, sep: " ", join: "-" };
    case "take":
      return { op, sep: "_", index: 0 };
    case "slice":
      return { op, start: 0, end: null };
    case "add":
    case "subtract":
    case "multiply":
    case "divide":
      return { op, n: 0 };
    case "round":
      return { op, decimals: 0 };
    default:
      return { op } as TransformOp;
  }
}

export function MassTransformEditor({ steps, onChange, sampleValues }: MassTransformEditorProps) {
  function update(index: number, step: TransformStep) {
    const next = [...steps];
    next[index] = step;
    onChange(next);
  }
  function remove(index: number) {
    onChange(steps.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...steps, { when: { op: "always" }, then: { op: "suffix", text: "" } }]);
  }

  return (
    <div className="mtf" data-testid="mass-transform-editor">
      {steps.length === 0 ? <p className="mtf-empty">Nenhum passo. Adicione um passo de transformacao.</p> : null}

      {steps.map((step, index) => (
        <div key={index} className="mtf-step" data-testid={`mtf-step-${index}`}>
          <div className="mtf-line">
            <span className="mtf-kw">Se</span>
            <select
              value={step.when.op}
              data-testid={`mtf-cond-op-${index}`}
              onChange={(e) => update(index, { ...step, when: defaultCondition(e.target.value as ConditionOp["op"]) })}
            >
              {(Object.keys(CONDITION_LABELS) as ConditionOp["op"][]).map((op) => (
                <option key={op} value={op}>
                  {CONDITION_LABELS[op]}
                </option>
              ))}
            </select>
            {renderConditionArgs(step.when, (when) => update(index, { ...step, when }))}
          </div>

          <div className="mtf-line">
            <span className="mtf-kw">entao</span>
            <select
              value={step.then.op}
              data-testid={`mtf-tf-op-${index}`}
              onChange={(e) => update(index, { ...step, then: defaultTransform(e.target.value as TransformOp["op"]) })}
            >
              {(Object.keys(TRANSFORM_LABELS) as TransformOp["op"][]).map((op) => (
                <option key={op} value={op}>
                  {TRANSFORM_LABELS[op]}
                </option>
              ))}
            </select>
            {renderTransformArgs(step.then, (then) => update(index, { ...step, then }))}
            <button type="button" className="mtf-remove" onClick={() => remove(index)} aria-label="Remover passo">
              ×
            </button>
          </div>
        </div>
      ))}

      <button type="button" className="mtf-add" onClick={add} data-testid="mtf-add-step">
        + Adicionar passo
      </button>

      {sampleValues.length > 0 && steps.length > 0 ? (
        <div className="mtf-preview" data-testid="mtf-preview">
          <span className="mtf-preview-title">Pre-visualizacao</span>
          {sampleValues.slice(0, 5).map((value, i) => (
            <div key={i} className="mtf-preview-row">
              <code>{value || "(vazio)"}</code>
              <span className="mtf-arrow">→</span>
              <code>{applyTransformPipeline(value, steps) || "(vazio)"}</code>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NumberArg({ value, onChange, testId }: { value: number; onChange: (n: number) => void; testId: string }) {
  return (
    <input
      type="number"
      className="mtf-arg mtf-arg-num"
      value={value}
      data-testid={testId}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  );
}

function TextArg({
  value,
  onChange,
  placeholder,
  testId
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  testId: string;
}) {
  return (
    <input
      type="text"
      className="mtf-arg"
      value={value}
      placeholder={placeholder}
      data-testid={testId}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function renderConditionArgs(cond: ConditionOp, onChange: (cond: ConditionOp) => void) {
  switch (cond.op) {
    case "lengthGt":
    case "lengthLt":
    case "lengthEq":
      return <NumberArg value={cond.n} onChange={(n) => onChange({ ...cond, n })} testId="mtf-cond-n" />;
    case "contains":
    case "startsWith":
    case "endsWith":
    case "equals":
      return <TextArg value={cond.text} onChange={(text) => onChange({ ...cond, text })} placeholder="texto" testId="mtf-cond-text" />;
    case "valueGt":
    case "valueLt":
      return <TextArg value={cond.value} onChange={(value) => onChange({ ...cond, value })} placeholder="numero" testId="mtf-cond-value" />;
    case "partGt":
    case "partLt":
      return (
        <>
          <TextArg value={cond.sep} onChange={(sep) => onChange({ ...cond, sep })} placeholder="sep" testId="mtf-cond-sep" />
          <NumberArg value={cond.index} onChange={(index) => onChange({ ...cond, index })} testId="mtf-cond-index" />
          <TextArg value={cond.value} onChange={(value) => onChange({ ...cond, value })} placeholder="valor" testId="mtf-cond-value" />
        </>
      );
    default:
      return null;
  }
}

function renderTransformArgs(transform: TransformOp, onChange: (transform: TransformOp) => void) {
  switch (transform.op) {
    case "prefix":
    case "suffix":
    case "set":
      return <TextArg value={transform.text} onChange={(text) => onChange({ ...transform, text })} placeholder="texto" testId="mtf-tf-text" />;
    case "replace":
      return (
        <>
          <TextArg value={transform.find} onChange={(find) => onChange({ ...transform, find })} placeholder="achar" testId="mtf-tf-find" />
          <TextArg value={transform.replace} onChange={(replace) => onChange({ ...transform, replace })} placeholder="por" testId="mtf-tf-replace" />
        </>
      );
    case "splitJoin":
      return (
        <>
          <TextArg value={transform.sep} onChange={(sep) => onChange({ ...transform, sep })} placeholder="split" testId="mtf-tf-sep" />
          <TextArg value={transform.join} onChange={(join) => onChange({ ...transform, join })} placeholder="juntar" testId="mtf-tf-join" />
        </>
      );
    case "take":
      return (
        <>
          <TextArg value={transform.sep} onChange={(sep) => onChange({ ...transform, sep })} placeholder="split" testId="mtf-tf-sep" />
          <NumberArg value={transform.index} onChange={(index) => onChange({ ...transform, index })} testId="mtf-tf-index" />
        </>
      );
    case "slice":
      return (
        <>
          <NumberArg value={transform.start} onChange={(start) => onChange({ ...transform, start })} testId="mtf-tf-start" />
          <NumberArg value={transform.end ?? 0} onChange={(end) => onChange({ ...transform, end })} testId="mtf-tf-end" />
        </>
      );
    case "add":
    case "subtract":
    case "multiply":
    case "divide":
      return <NumberArg value={transform.n} onChange={(n) => onChange({ ...transform, n })} testId="mtf-tf-n" />;
    case "round":
      return <NumberArg value={transform.decimals} onChange={(decimals) => onChange({ ...transform, decimals })} testId="mtf-tf-decimals" />;
    default:
      return null;
  }
}
