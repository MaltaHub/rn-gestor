"use client";

import { useEffect, useId, useState } from "react";
import type { RequestAuth } from "@/components/ui-grid/types";
import { buscarModelos, consultarPlacaTroca, type ModeloOpcao } from "@/components/vendedor/api";
import { Icon } from "@/components/vendedor/ui/icons";
import type { TrocaDraft } from "@/components/vendedor/vender/use-venda-draft";
import { Campo, FieldError, type FieldErrorState } from "@/components/vendedor/vender/field-error";
import styles from "@/components/vendedor/vender/vender.module.css";
import type { LookupItem } from "@/lib/core/types/lookups";

const PROPOSITOS = [
  { value: "VENDA", label: "Venda", hint: "Vai para a vitrine e o catálogo, como qualquer carro da loja." },
  { value: "REPASSE", label: "Repasse", hint: "Não aparece na vitrine nem no catálogo e fica fora dos cálculos de preço." }
] as const;

/**
 * Cadastro do veículo recebido na troca, dentro do fluxo de venda — com o
 * mesmo que o cadastro do grid exige: placa (consulta preenche modelo, cor,
 * anos e chassi), modelo do catálogo (ou novo), local e o PROPÓSITO declarado
 * pelo vendedor. Ao salvar a venda, o carro entra na loja (origem TROCA, valor
 * de compra = valor desta entrada).
 */
export function EntradaTrocaForm({
  auth,
  index,
  troca,
  locais,
  fieldError,
  onChange
}: {
  auth: RequestAuth;
  index: number;
  troca: TrocaDraft;
  locais: LookupItem[];
  fieldError: FieldErrorState;
  onChange: (changes: Partial<TrocaDraft>) => void;
}) {
  const listId = useId();
  const [consultando, setConsultando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro" | "info"; texto: string } | null>(null);
  const [modelos, setModelos] = useState<ModeloOpcao[]>([]);
  const campo = (nome: string) => `entrada-${index}-${nome}`;

  // Autocompletar do modelo pelo catálogo (debounce, cancela a busca anterior).
  useEffect(() => {
    const termo = troca.modelo.trim();
    if (termo.length < 2) {
      setModelos([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      buscarModelos(auth, termo, controller.signal)
        .then(setModelos)
        .catch(() => undefined);
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [auth, troca.modelo]);

  async function consultar() {
    const placa = troca.placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (placa.length < 7) {
      setAviso({ tom: "erro", texto: "Informe a placa completa antes de consultar." });
      return;
    }
    setConsultando(true);
    setAviso(null);
    try {
      const data = await consultarPlacaTroca(auth, placa);
      if (data.jaCadastrado) {
        setAviso({ tom: "erro", texto: `Esta placa já tem cadastro na loja (situação ${data.jaCadastrado.estadoVenda}). Fale com o gerente antes de lançar a troca.` });
        return;
      }
      onChange({
        placa: data.placa,
        modelo: troca.modelo.trim() || data.modeloCatalogo?.modelo || data.modeloSugerido || "",
        cor: troca.cor.trim() || data.cor || "",
        anoFab: troca.anoFab.trim() || (data.anoFab ? String(data.anoFab) : ""),
        anoMod: troca.anoMod.trim() || (data.anoMod ? String(data.anoMod) : ""),
        chassi: troca.chassi.trim() || data.chassi || ""
      });
      setAviso(
        data.aviso
          ? { tom: "info", texto: data.aviso }
          : data.modeloCatalogo
            ? { tom: "ok", texto: `Encontrado: ${data.modeloCatalogo.modelo}. Confira os dados.` }
            : { tom: "info", texto: data.modeloSugerido ? `Modelo "${data.modeloSugerido}" não está no catálogo: será cadastrado com a venda. Confira o nome.` : "Consulta feita. Complete os dados." }
      );
    } catch (err) {
      setAviso({ tom: "erro", texto: err instanceof Error ? err.message : "Falha ao consultar a placa." });
    } finally {
      setConsultando(false);
    }
  }

  const modeloNovo = troca.modelo.trim().length >= 2 && !modelos.some((item) => item.modelo.toLowerCase() === troca.modelo.trim().toLowerCase());

  return (
    <div className={styles.trocaForm} data-testid="vender-troca-form">
      <div className={styles.fields}>
        <Campo label="Placa" required span={3} field={campo("trocaPlaca")} fieldError={fieldError}>
          <span className={styles.inline}>
            <input
              className={styles.input}
              value={troca.placa}
              onChange={(e) => onChange({ placa: e.target.value.toUpperCase() })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void consultar();
                }
              }}
              placeholder="ABC1D23"
              maxLength={8}
              data-testid="vender-troca-placa"
            />
            <button type="button" className={styles.btn} onClick={() => void consultar()} disabled={consultando} data-testid="vender-troca-consultar">
              <Icon name="search" size={15} />
              {consultando ? "Consultando..." : "Consultar"}
            </button>
          </span>
        </Campo>
        <Campo
          label="Modelo"
          required
          span={3}
          field={campo("trocaModelo")}
          fieldError={fieldError}
          hint={modeloNovo ? "Modelo novo: entra no catálogo ao salvar a venda." : undefined}
        >
          <input
            className={styles.input}
            value={troca.modelo}
            list={listId}
            onChange={(e) => onChange({ modelo: e.target.value })}
            placeholder="Digite e escolha do catálogo"
            autoComplete="off"
            data-testid="vender-troca-modelo"
          />
          <datalist id={listId}>
            {modelos.map((item) => (
              <option key={item.id} value={item.modelo} />
            ))}
          </datalist>
        </Campo>

        {aviso ? (
          <p
            className={`${styles.alert} ${aviso.tom === "ok" ? styles.alertOk : aviso.tom === "erro" ? styles.alertDanger : ""} ${styles.fieldWide}`.trim()}
            role="status"
            data-testid="vender-troca-aviso"
          >
            <Icon name={aviso.tom === "ok" ? "check" : aviso.tom === "erro" ? "alert" : "info"} size={15} />
            {aviso.texto}
          </p>
        ) : null}

        <Campo label="Cor" span={2}>
          <input className={styles.input} value={troca.cor} onChange={(e) => onChange({ cor: e.target.value })} placeholder="Prata" />
        </Campo>
        <Campo label="Ano fab." span={2} field={campo("troca-anoFab")} fieldError={fieldError}>
          <input className={styles.input} inputMode="numeric" value={troca.anoFab} onChange={(e) => onChange({ anoFab: e.target.value })} placeholder="2018" />
        </Campo>
        <Campo label="Ano mod." span={2} field={campo("troca-anoMod")} fieldError={fieldError}>
          <input className={styles.input} inputMode="numeric" value={troca.anoMod} onChange={(e) => onChange({ anoMod: e.target.value })} placeholder="2019" />
        </Campo>
        <Campo label="KM" span={2} field={campo("troca-hodometro")} fieldError={fieldError}>
          <input className={styles.input} inputMode="numeric" value={troca.hodometro} onChange={(e) => onChange({ hodometro: e.target.value })} placeholder="80000" />
        </Campo>
        <Campo label="Renavam" span={2}>
          <input className={styles.input} value={troca.renavam} onChange={(e) => onChange({ renavam: e.target.value })} />
        </Campo>
        <Campo label="Chassi" span={2}>
          <input className={styles.input} value={troca.chassi} onChange={(e) => onChange({ chassi: e.target.value.toUpperCase() })} />
        </Campo>
        <Campo label="Onde o carro vai ficar" required span={3} field={campo("trocaLocal")} fieldError={fieldError}>
          <select className={styles.select} value={troca.local} onChange={(e) => onChange({ local: e.target.value })} data-testid="vender-troca-local">
            <option value="">Selecione...</option>
            {locais.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div data-field-error-anchor={campo("trocaProposito")}>
        <span className={styles.label}>
          Propósito do veículo<em> *</em>
        </span>
        <div className={styles.options} role="radiogroup" aria-label="Propósito do veículo da troca" data-testid="vender-troca-proposito">
          {PROPOSITOS.map((item) => (
            <label key={item.value} className={styles.option}>
              <input type="radio" name={`troca-proposito-${index}`} checked={troca.proposito === item.value} onChange={() => onChange({ proposito: item.value })} />
              <span className={styles.optionTitle}>{item.label}</span>
              <span className={styles.optionHint}>{item.hint}</span>
            </label>
          ))}
        </div>
        <FieldError fieldError={fieldError} field={campo("trocaProposito")} />
      </div>
    </div>
  );
}
