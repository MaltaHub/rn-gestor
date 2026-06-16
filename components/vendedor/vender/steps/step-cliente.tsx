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
import type { DraftPatch, VendaDraft } from "@/components/vendedor/vender/use-venda-draft";
import { FieldError, type FieldErrorState } from "@/components/vendedor/vender/field-error";

/** Erro só quando o campo está preenchido E inválido (campos são opcionais). */
function erro(value: string, valido: (v: string) => boolean, msg: string): string | null {
  return value.trim() && !valido(value) ? msg : null;
}

type ViaCepResposta = {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

/** Passo 1: dados do cliente + canal e vendedor responsável. Valida CPF/CNPJ,
 *  RG, CEP, telefone e e-mail; o CEP busca o endereço (ViaCEP). */
export function StepCliente({
  draft,
  patch,
  usuarios,
  canais,
  actorNome,
  fieldError
}: {
  draft: VendaDraft;
  patch: (changes: DraftPatch) => void;
  usuarios: LookupItem[];
  canais: LookupItem[];
  actorNome: string | null;
  fieldError: FieldErrorState;
}) {
  const vendedorMissing =
    draft.vendedorAuthUserId && !usuarios.some((item) => item.code === draft.vendedorAuthUserId);

  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "notfound" | "error">("idle");
  const ultimoCepRef = useRef<string>("");

  const docErro = erro(draft.compradorDocumento, isValidCpfCnpj, "CPF/CNPJ inválido.");
  const rgErro = erro(draft.compradorRg, isValidRG, "RG inválido.");
  const cepErro = erro(draft.compradorCep, isValidCEP, "CEP deve ter 8 dígitos.");
  const telErro = erro(draft.compradorTelefone, isValidTelefone, "Telefone inválido.");
  const emailErro = erro(draft.compradorEmail, isValidEmail, "E-mail inválido.");

  // Busca o endereço no ViaCEP quando o CEP fica com 8 dígitos.
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
        const changes: DraftPatch = {};
        const rua = [data.logradouro, data.bairro].filter(Boolean).join(", ");
        if (rua && !draft.compradorEndereco.trim()) changes.compradorEndereco = rua;
        const cidadeEstado = data.localidade && data.uf ? `${data.localidade} - ${data.uf}` : "";
        if (cidadeEstado && !draft.compradorCidadeEstado.trim()) changes.compradorCidadeEstado = cidadeEstado;
        if (Object.keys(changes).length > 0) patch(changes);
      } catch {
        if (active) setCepStatus("error");
      }
    }, 400);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
    // patch é estável; depende dos valores atuais para decidir o que preencher.
  }, [draft.compradorCep, draft.compradorEndereco, draft.compradorCidadeEstado, patch]);

  const cepHint =
    cepStatus === "loading"
      ? "Buscando endereço..."
      : cepStatus === "notfound"
        ? "CEP não encontrado."
        : cepStatus === "error"
          ? "Não foi possível consultar o CEP."
          : null;

  return (
    <div className="vender-step">
      <label className="vendedor-field" data-field-error-anchor="compradorNome">
        <span>Nome do cliente *</span>
        <input
          value={draft.compradorNome}
          onChange={(event) => patch({ compradorNome: event.target.value })}
          placeholder="Nome completo"
          data-testid="vender-cliente-nome"
          aria-invalid={fieldError?.field === "compradorNome"}
        />
        <FieldError fieldError={fieldError} field="compradorNome" />
      </label>

      <div className="vendedor-field-row">
        <label className="vendedor-field" data-field-error-anchor="compradorDocumento">
          <span>CPF/CNPJ</span>
          <input
            value={draft.compradorDocumento}
            onChange={(event) => patch({ compradorDocumento: event.target.value })}
            onBlur={(event) => patch({ compradorDocumento: formatCpfCnpj(event.target.value) })}
            placeholder="000.000.000-00"
            inputMode="numeric"
            aria-invalid={Boolean(docErro)}
          />
          {docErro ? <small className="vender-field-error">{docErro}</small> : null}
        </label>
        <label className="vendedor-field" data-field-error-anchor="compradorRg">
          <span>RG</span>
          <input
            value={draft.compradorRg}
            onChange={(event) => patch({ compradorRg: event.target.value })}
            placeholder="00.000.000-0"
            data-testid="vender-cliente-rg"
            aria-invalid={Boolean(rgErro)}
          />
          {rgErro ? <small className="vender-field-error">{rgErro}</small> : null}
        </label>
        <label className="vendedor-field" data-field-error-anchor="compradorTelefone">
          <span>Telefone</span>
          <input
            value={draft.compradorTelefone}
            onChange={(event) => patch({ compradorTelefone: event.target.value })}
            onBlur={(event) => patch({ compradorTelefone: formatTelefone(event.target.value) })}
            placeholder="(84) 90000-0000"
            inputMode="tel"
            aria-invalid={Boolean(telErro)}
          />
          {telErro ? <small className="vender-field-error">{telErro}</small> : null}
        </label>
      </div>

      <label className="vendedor-field" data-field-error-anchor="compradorEmail">
        <span>E-mail</span>
        <input
          type="email"
          value={draft.compradorEmail}
          onChange={(event) => patch({ compradorEmail: event.target.value })}
          placeholder="cliente@email.com"
          aria-invalid={Boolean(emailErro)}
        />
        {emailErro ? <small className="vender-field-error">{emailErro}</small> : null}
      </label>

      <div className="vendedor-field-row">
        <label className="vendedor-field" data-field-error-anchor="compradorCep">
          <span>CEP</span>
          <input
            value={draft.compradorCep}
            onChange={(event) => patch({ compradorCep: event.target.value })}
            onBlur={(event) => patch({ compradorCep: formatCEP(event.target.value) })}
            placeholder="59000-000"
            inputMode="numeric"
            data-testid="vender-cliente-cep"
            aria-invalid={Boolean(cepErro)}
          />
          {cepErro ? <small className="vender-field-error">{cepErro}</small> : cepHint ? <small className="vendedor-hint">{cepHint}</small> : null}
        </label>
        <label className="vendedor-field">
          <span>Cidade - Estado</span>
          <input
            value={draft.compradorCidadeEstado}
            onChange={(event) => patch({ compradorCidadeEstado: event.target.value })}
            placeholder="Natal - RN"
            data-testid="vender-cliente-cidade-estado"
          />
        </label>
      </div>

      <label className="vendedor-field">
        <span>Endereço</span>
        <input
          value={draft.compradorEndereco}
          onChange={(event) => patch({ compradorEndereco: event.target.value })}
          placeholder="Rua, número, bairro"
        />
      </label>

      <label className="vendedor-field vender-field-debitos">
        <span>Débitos do veículo (IPVA, multas)</span>
        <textarea
          value={draft.debitos}
          rows={2}
          onChange={(event) => patch({ debitos: event.target.value })}
          placeholder="Opcional — ex.: IPVA 2025 em aberto, 1 multa"
          data-testid="vender-cliente-debitos"
        />
        <small>Destaque em vermelho — registre pendências do veículo, se houver.</small>
      </label>

      <div className="vendedor-field-row">
        <label className="vendedor-field">
          <span>Canal do cliente</span>
          <select value={draft.canalCliente} onChange={(event) => patch({ canalCliente: event.target.value })}>
            <option value="">— Não informado —</option>
            {canais.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="vendedor-field" data-field-error-anchor="vendedorAuthUserId">
          <span>Vendedor responsável *</span>
          <select
            value={draft.vendedorAuthUserId}
            onChange={(event) => patch({ vendedorAuthUserId: event.target.value })}
            data-testid="vender-cliente-vendedor"
            aria-invalid={fieldError?.field === "vendedorAuthUserId"}
          >
            {vendedorMissing ? <option value={draft.vendedorAuthUserId}>{actorNome ?? "Você"} (atual)</option> : null}
            {!draft.vendedorAuthUserId ? <option value="">Selecione...</option> : null}
            {usuarios.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
          <FieldError fieldError={fieldError} field="vendedorAuthUserId" />
        </label>
      </div>
    </div>
  );
}
