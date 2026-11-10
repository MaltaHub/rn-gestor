"use client";

import { useEffect, useRef, useState } from "react";
import type { LookupItem } from "@/lib/core/types/lookups";
import {
  formatCEP,
  formatCpfCnpj,
  formatTelefone,
  isValidCEP,
  isValidCpfCnpj,
  isValidEmail,
  isValidRG,
  isValidTelefone,
  onlyDigits
} from "@/lib/domain/vendas/validacao";
import { pessoaFisica, type VendaDraft } from "@/components/vendedor/vender/use-venda-draft";
import { Campo, type FieldErrorState } from "@/components/vendedor/vender/field-error";
import styles from "@/components/vendedor/vender/vender.module.css";

/** Erro só quando o campo está preenchido E inválido (campos são opcionais). */
function erro(value: string, valido: (v: string) => boolean, msg: string): string | null {
  return value.trim() && !valido(value) ? msg : null;
}

type ViaCepResposta = { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean };

/**
 * Etapa 1: quem compra. Nome é o único obrigatório (o resto aparece nos
 * documentos — o recibo avisa o que faltar). O CEP completa o endereço (ViaCEP).
 */
export function StepComprador({
  draft,
  patch,
  usuarios,
  canais,
  actorNome,
  fieldError
}: {
  draft: VendaDraft;
  patch: (changes: Partial<VendaDraft>) => void;
  usuarios: LookupItem[];
  canais: LookupItem[];
  actorNome: string | null;
  fieldError: FieldErrorState;
}) {
  const vendedorFora = draft.vendedorAuthUserId && !usuarios.some((item) => item.code === draft.vendedorAuthUserId);
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "notfound" | "error">("idle");
  const ultimoCepRef = useRef("");

  useEffect(() => {
    const cep = onlyDigits(draft.compradorCep);
    if (cep.length !== 8) {
      setCepStatus("idle");
      return;
    }
    if (cep === ultimoCepRef.current) return;
    let active = true;
    const timeout = window.setTimeout(async () => {
      ultimoCepRef.current = cep;
      setCepStatus("loading");
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { cache: "no-store" });
        const data = (await res.json()) as ViaCepResposta;
        if (!active) return;
        if (data.erro) {
          setCepStatus("notfound");
          return;
        }
        setCepStatus("ok");
        // Preenche só o que está vazio (não sobrescreve edição manual).
        const changes: Partial<VendaDraft> = {};
        const rua = [data.logradouro, data.bairro].filter(Boolean).join(", ");
        if (rua && !draft.compradorEndereco.trim()) changes.compradorEndereco = rua;
        const cidade = data.localidade && data.uf ? `${data.localidade} - ${data.uf}` : "";
        if (cidade && !draft.compradorCidadeEstado.trim()) changes.compradorCidadeEstado = cidade;
        if (Object.keys(changes).length > 0) patch(changes);
      } catch {
        if (active) setCepStatus("error");
      }
    }, 400);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [draft.compradorCep, draft.compradorEndereco, draft.compradorCidadeEstado, patch]);

  const cepHint =
    cepStatus === "loading" ? "Buscando endereço..." : cepStatus === "notfound" ? "CEP não encontrado." : cepStatus === "error" ? "Não foi possível consultar o CEP." : null;

  return (
    <section className={styles.card} aria-label="Comprador">
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>Comprador</h3>
        <span className={styles.cardSub}>Obrigatórios: saem no recibo, no contrato e nos termos (e-mail é opcional).</span>
      </div>
      <div className={styles.fields}>
        <Campo label="Nome completo" required field="compradorNome" fieldError={fieldError}>
          <input
            className={styles.input}
            value={draft.compradorNome}
            onChange={(e) => patch({ compradorNome: e.target.value })}
            placeholder="Nome como no documento"
            autoComplete="off"
            data-testid="vender-comprador-nome"
            aria-invalid={fieldError?.field === "compradorNome"}
          />
        </Campo>
        <Campo label="CPF ou CNPJ" required span={2} field="compradorDocumento" fieldError={fieldError} erro={erro(draft.compradorDocumento, isValidCpfCnpj, "CPF/CNPJ inválido.")}>
          <input
            className={styles.input}
            value={draft.compradorDocumento}
            onChange={(e) => patch({ compradorDocumento: e.target.value })}
            onBlur={(e) => patch({ compradorDocumento: formatCpfCnpj(e.target.value) })}
            placeholder="000.000.000-00"
            inputMode="numeric"
            data-testid="vender-comprador-documento"
          />
        </Campo>
        <Campo label="RG" required={pessoaFisica(draft.compradorDocumento) || !draft.compradorDocumento.trim()} span={2} field="compradorRg" fieldError={fieldError} erro={erro(draft.compradorRg, isValidRG, "RG inválido.")}>
          <input className={styles.input} value={draft.compradorRg} onChange={(e) => patch({ compradorRg: e.target.value })} placeholder="00.000.000-0" data-testid="vender-comprador-rg" />
        </Campo>
        <Campo label="Telefone" required span={2} field="compradorTelefone" fieldError={fieldError} erro={erro(draft.compradorTelefone, isValidTelefone, "Telefone inválido.")}>
          <input
            className={styles.input}
            value={draft.compradorTelefone}
            onChange={(e) => patch({ compradorTelefone: e.target.value })}
            onBlur={(e) => patch({ compradorTelefone: formatTelefone(e.target.value) })}
            placeholder="(13) 90000-0000"
            inputMode="tel"
            data-testid="vender-comprador-telefone"
          />
        </Campo>
        <Campo label="CEP" required span={2} field="compradorCep" fieldError={fieldError} erro={erro(draft.compradorCep, isValidCEP, "CEP deve ter 8 dígitos.")} hint={cepHint}>
          <input
            className={styles.input}
            value={draft.compradorCep}
            onChange={(e) => patch({ compradorCep: e.target.value })}
            onBlur={(e) => patch({ compradorCep: formatCEP(e.target.value) })}
            placeholder="00000-000"
            inputMode="numeric"
            data-testid="vender-comprador-cep"
          />
        </Campo>
        <Campo label="Endereço" required span={4} field="compradorEndereco" fieldError={fieldError}>
          <input
            className={styles.input}
            value={draft.compradorEndereco}
            onChange={(e) => patch({ compradorEndereco: e.target.value })}
            placeholder="Rua, número, bairro"
            data-testid="vender-comprador-endereco"
          />
        </Campo>
        <Campo label="Cidade - UF" required span={3} field="compradorCidadeEstado" fieldError={fieldError}>
          <input
            className={styles.input}
            value={draft.compradorCidadeEstado}
            onChange={(e) => patch({ compradorCidadeEstado: e.target.value })}
            placeholder="Santos - SP"
            data-testid="vender-comprador-cidade"
          />
        </Campo>
        <Campo label="E-mail" span={3} field="compradorEmail" fieldError={fieldError} erro={erro(draft.compradorEmail, isValidEmail, "E-mail inválido.")}>
          <input className={styles.input} type="email" value={draft.compradorEmail} onChange={(e) => patch({ compradorEmail: e.target.value })} placeholder="cliente@email.com" />
        </Campo>
        <Campo label="Como chegou à loja" span={3}>
          <select className={styles.select} value={draft.canalCliente} onChange={(e) => patch({ canalCliente: e.target.value })}>
            <option value="">Não informado</option>
            {canais.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Vendedor responsável" required span={3} field="vendedorAuthUserId" fieldError={fieldError}>
          <select
            className={styles.select}
            value={draft.vendedorAuthUserId}
            onChange={(e) => patch({ vendedorAuthUserId: e.target.value })}
            data-testid="vender-vendedor"
            aria-invalid={fieldError?.field === "vendedorAuthUserId"}
          >
            {vendedorFora ? <option value={draft.vendedorAuthUserId}>{actorNome ?? "Você"} (atual)</option> : null}
            {!draft.vendedorAuthUserId ? <option value="">Selecione...</option> : null}
            {usuarios.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </Campo>
      </div>
    </section>
  );
}
