"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { JSONContent } from "@tiptap/core";
import { FocusDialog, dialogStyles } from "@/components/ui/dialog/focus-dialog";
import { confirmDialog } from "@/components/ui/dialog/confirm";
import type { RequestAuth } from "@/components/ui-grid/types";
import { DOCUMENT_TYPES, matchDocumentType } from "@/components/files/document-slots";
import { checklistDoPainel, estadoDoItem, vendaTemTroca } from "@/components/vendedor/checklist-painel";
import { cancelarVenda, concluirVenda, desfazerEntrega, registrarEntrega } from "@/components/vendedor/api";
import { formatPreco, formatValor } from "@/components/vendedor/format";
import { Icon } from "@/components/vendedor/ui/icons";
import { RepasseBadge, SituacaoBadge, VeiculoThumb } from "@/components/vendedor/veiculos/veiculos-ui";
import { fetchDocumento, fetchVendaDocContext } from "@/components/vendedor/word/api";
import { conferirEImprimir } from "@/components/vendedor/word/imprimir";
import { useNovoDocumento } from "@/components/vendedor/word/use-novo-documento";
import { VendaWizard, type ModoSalvar } from "@/components/vendedor/vender/venda-wizard";
import styles from "@/components/vendedor/vender/vender.module.css";
import { clausulaPagamento, clausulaTransferencia, descreverDebitos } from "@/lib/domain/venda-documentos/clausulas";
import type { CategoriaDocumento } from "@/lib/domain/venda-documentos/categorias";
import { formatDataCurta } from "@/lib/domain/venda-documentos/formato";
import { ETAPAS_VENDA, hojeIso, SITUACAO_LABEL, type SituacaoVenda } from "@/lib/domain/vendas/situacao";
import type { PainelVeiculo } from "@/lib/domain/vendedor/types";

const FORMA_LABEL: Record<string, string> = {
  a_vista_pix: "À vista (PIX)",
  financiamento: "Financiamento",
  cartao_credito: "Cartão de crédito",
  consorcio: "Consórcio"
};

// Arquivos que a venda pede na pasta do veículo (arquivados pela administração).
const ARQUIVOS_DA_VENDA = ["identidade_consumidor_final", "comp_endereco_venda", "nota_saida", "recibo_venda", "termo_entrega"];
const ROTULO_ARQUIVO = new Map(DOCUMENT_TYPES.map((tipo) => [tipo.key, tipo.label]));

type Acao = { tipo: "concluir" | "entrega"; data: string } | null;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function Linha({ situacao }: { situacao: SituacaoVenda }) {
  const atual = ETAPAS_VENDA.indexOf(situacao);
  return (
    <ol className={styles.timeline} aria-label="Andamento da venda" data-testid="vender-linha">
      {ETAPAS_VENDA.map((etapa, index) => {
        const estado = atual < 0 ? "futuro" : index < atual ? "feito" : index === atual ? "atual" : "futuro";
        return (
          <li key={etapa} className={styles.step} data-estado={estado} aria-current={estado === "atual" ? "step" : undefined}>
            <span className={styles.dot}>{estado === "feito" ? <Icon name="check" size={13} strokeWidth={2.6} /> : null}</span>
            {SITUACAO_LABEL[etapa]}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Painel de UM veículo no /vender: situação na linha do tempo, a ação certa
 * para o momento (iniciar, concluir, entregar), os documentos Word da venda
 * (gerar/abrir/imprimir) e os arquivos da pasta do veículo. O fluxo da venda
 * abre aqui mesmo.
 */
export function PainelVenda({
  auth,
  painel,
  podeGerenciar,
  vendedorPadrao,
  vendedorNome,
  wizardAberto,
  onWizard,
  onAtualizar,
  onVoltar
}: {
  auth: RequestAuth;
  painel: PainelVeiculo;
  podeGerenciar: boolean;
  vendedorPadrao: string;
  vendedorNome: string | null;
  wizardAberto: boolean;
  onWizard: (aberto: boolean) => void;
  onAtualizar: () => void;
  onVoltar: () => void;
}) {
  const router = useRouter();
  const { carro, venda, situacao } = painel;
  const [acao, setAcao] = useState<Acao>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const novoDocumento = useNovoDocumento(auth);
  const checklist = useMemo(() => (venda ? checklistDoPainel(painel) : []), [painel, venda]);

  const tiposPresentes = useMemo(() => {
    const tipos = new Map<string, number>();
    for (const arquivo of painel.arquivos) {
      const tipo = matchDocumentType(arquivo.fileName, carro.placa)?.key ?? "__outros__";
      tipos.set(tipo, (tipos.get(tipo) ?? 0) + 1);
    }
    return tipos;
  }, [carro.placa, painel.arquivos]);

  const arquivosPorTipo = useMemo(() => {
    const grupos = new Map<string, PainelVeiculo["arquivos"]>();
    for (const arquivo of painel.arquivos) {
      const tipo = matchDocumentType(arquivo.fileName, carro.placa);
      const label = tipo?.label ?? "Outros";
      grupos.set(label, [...(grupos.get(label) ?? []), arquivo]);
    }
    return Array.from(grupos.entries());
  }, [carro.placa, painel.arquivos]);

  const ano = carro.anoFab && carro.anoMod && carro.anoFab !== carro.anoMod ? `${carro.anoFab}/${carro.anoMod}` : carro.anoMod ?? carro.anoFab;
  const valorVenda = num(venda?.valor_total);
  const desconto = num(venda?.desconto);

  function onSalvo(modo: ModoSalvar) {
    onWizard(false);
    setAviso({
      tom: "ok",
      texto:
        modo === "reserva"
          ? "Reserva salva: o veículo está RESERVADO. Gere o recibo de sinal se houve entrada."
          : modo === "concluir"
            ? "Venda concluída: o veículo está VENDIDO. Agora gere o Recibo de Venda e os termos abaixo."
            : "Alterações salvas — os documentos já usam os dados novos."
    });
    onAtualizar();
  }

  async function confirmarAcao() {
    if (!acao || !venda || ocupado) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(acao.data)) {
      setAviso({ tom: "erro", texto: "Informe a data." });
      return;
    }
    setOcupado(true);
    try {
      if (acao.tipo === "concluir") await concluirVenda(auth, venda.id, acao.data);
      else await registrarEntrega(auth, venda.id, acao.data);
      setAviso({
        tom: "ok",
        texto:
          acao.tipo === "concluir"
            ? "Venda concluída: o veículo está VENDIDO. Gere o Recibo de Venda."
            : `Entrega registrada em ${formatDataCurta(acao.data)}. Garantia legal de 90 dias contando — gere o Termo de Entrega.`
      });
      setAcao(null);
      onAtualizar();
    } catch (err) {
      setAviso({ tom: "erro", texto: err instanceof Error ? err.message : "Falha ao atualizar a venda." });
    } finally {
      setOcupado(false);
    }
  }

  async function cancelar() {
    if (!venda) return;
    const reserva = venda.estado_venda === "aberta";
    const ok = await confirmDialog({
      title: reserva ? "Cancelar a reserva?" : "Cancelar a venda?",
      message: "O veículo volta ao estoque como disponível. Os documentos gerados continuam na venda cancelada.",
      confirmLabel: reserva ? "Cancelar reserva" : "Cancelar venda",
      tone: "danger"
    });
    if (!ok) return;
    try {
      await cancelarVenda(auth, venda.id);
      setAviso({ tom: "ok", texto: "Venda cancelada. O veículo voltou ao estoque." });
      onAtualizar();
    } catch (err) {
      setAviso({ tom: "erro", texto: err instanceof Error ? err.message : "Falha ao cancelar." });
    }
  }

  async function voltarParaVendido() {
    if (!venda) return;
    const ok = await confirmDialog({ title: "Desfazer a entrega?", message: "A venda volta para \"vendido, aguardando entrega\".", confirmLabel: "Desfazer" });
    if (!ok) return;
    try {
      await desfazerEntrega(auth, venda.id);
      onAtualizar();
    } catch (err) {
      setAviso({ tom: "erro", texto: err instanceof Error ? err.message : "Falha ao desfazer a entrega." });
    }
  }

  async function gerar(categoria: CategoriaDocumento) {
    if (!venda) return;
    try {
      const doc = await novoDocumento.criarDaCategoria(venda.id, categoria, { temTroca: vendaTemTroca(painel) });
      if (doc) router.push(`/vendedor/word?carro=${carro.id}&doc=${doc.id}`);
    } catch (err) {
      setAviso({ tom: "erro", texto: err instanceof Error ? err.message : "Falha ao gerar o documento." });
    }
  }

  async function imprimir(docId: string) {
    if (!venda) return;
    try {
      const [doc, ctx] = await Promise.all([fetchDocumento(auth, docId), fetchVendaDocContext(auth, venda.id)]);
      await conferirEImprimir(doc.conteudo as JSONContent, ctx, doc.titulo);
    } catch (err) {
      setAviso({ tom: "erro", texto: err instanceof Error ? err.message : "Falha ao preparar a impressão." });
    }
  }

  const vendidoSemRegistro = !venda && situacao === "vendido";
  const acoes = (
    <div className={styles.actions}>
      {situacao === "disponivel" || vendidoSemRegistro ? (
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => onWizard(true)} data-testid="vender-iniciar">
          <Icon name="sale" size={16} />
          {vendidoSemRegistro ? "Registrar a venda" : "Iniciar venda"}
        </button>
      ) : null}
      {situacao === "reservado" && venda ? (
        <>
          <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => onWizard(true)} data-testid="vender-continuar">
            <Icon name="edit" size={16} />
            Continuar venda
          </button>
          <button type="button" className={`${styles.btn} ${styles.success}`} onClick={() => setAcao({ tipo: "concluir", data: hojeIso() })} data-testid="vender-concluir-rapido">
            <Icon name="check" size={16} />
            Concluir venda
          </button>
        </>
      ) : null}
      {situacao === "vendido" && venda ? (
        <>
          <button type="button" className={`${styles.btn} ${styles.success}`} onClick={() => setAcao({ tipo: "entrega", data: hojeIso() })} data-testid="vender-entregar">
            <Icon name="key" size={16} />
            Registrar entrega
          </button>
          <button type="button" className={styles.btn} onClick={() => onWizard(true)} data-testid="vender-editar">
            <Icon name="edit" size={16} />
            Editar venda
          </button>
        </>
      ) : null}
      {(situacao === "entregue" || situacao === "finalizado") && venda ? (
        <button type="button" className={styles.btn} onClick={() => onWizard(true)} data-testid="vender-editar">
          <Icon name="edit" size={16} />
          Editar venda
        </button>
      ) : null}
      <Link className={styles.btn} href={`/vendedor/word?carro=${carro.id}`} data-testid="vender-abrir-word">
        <Icon name="file" size={16} />
        Documentos no Word
      </Link>
      <Link className={styles.btn} href={`/vendedor/veiculo/${carro.id}`}>
        <Icon name="car" size={16} />
        Fotos e ficha
      </Link>
      {podeGerenciar && situacao === "entregue" && venda ? (
        <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={() => void voltarParaVendido()}>
          Desfazer entrega
        </button>
      ) : null}
      {podeGerenciar && venda && (situacao === "reservado" || situacao === "vendido") ? (
        <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={() => void cancelar()} data-testid="vender-cancelar">
          {venda.estado_venda === "aberta" ? "Cancelar reserva" : "Cancelar venda"}
        </button>
      ) : null}
    </div>
  );

  return (
    <div className={styles.stageInner} data-testid="vender-painel">
      <button type="button" className={`${styles.btn} ${styles.small} ${styles.backBtn}`} onClick={onVoltar}>
        <Icon name="chevronLeft" size={14} />
        Veículos
      </button>

      <header className={styles.hero}>
        <VeiculoThumb url={carro.coverUrl} alt={carro.modelo ?? carro.placa} width={150} height={112} />
        <div className={styles.heroBody}>
          <h1 className={styles.heroTitle}>
            {carro.modelo ?? "Veículo"} <span className={styles.placa}>{carro.placa}</span>
            <SituacaoBadge situacao={situacao} />
            {carro.proposito === "REPASSE" ? <RepasseBadge /> : null}
          </h1>
          <dl className={styles.facts}>
            {ano ? (
              <div>
                <dt>Ano</dt>
                <dd>{ano}</dd>
              </div>
            ) : null}
            {carro.cor ? (
              <div>
                <dt>Cor</dt>
                <dd>{carro.cor}</dd>
              </div>
            ) : null}
            {carro.hodometro != null ? (
              <div>
                <dt>KM</dt>
                <dd>{carro.hodometro.toLocaleString("pt-BR")}</dd>
              </div>
            ) : null}
            <div>
              <dt>{valorVenda != null ? "Vendido por" : "Preço"}</dt>
              <dd>{formatPreco(valorVenda != null ? valorVenda - (desconto ?? 0) : carro.preco) ?? "—"}</dd>
            </div>
            {str(venda?.comprador_nome) ? (
              <div>
                <dt>Comprador</dt>
                <dd>{str(venda?.comprador_nome)}</dd>
              </div>
            ) : null}
            {str(venda?.data_entrega) ? (
              <div>
                <dt>Entregue em</dt>
                <dd>{formatDataCurta(str(venda?.data_entrega))}</dd>
              </div>
            ) : null}
          </dl>
          {wizardAberto ? null : acoes}
        </div>
      </header>

      <Linha situacao={situacao} />

      {aviso ? (
        <p className={`${styles.alert} ${aviso.tom === "ok" ? styles.alertOk : styles.alertDanger}`} role="status" data-testid="vender-aviso">
          <Icon name={aviso.tom === "ok" ? "check" : "alert"} size={16} />
          {aviso.texto}
        </p>
      ) : null}

      {situacao === "indisponivel" ? (
        <p className={styles.alert}>
          <Icon name="info" size={16} />
          Veículo com status &quot;{carro.estadoVenda}&quot; — não está disponível para venda agora.
        </p>
      ) : null}

      {wizardAberto ? (
        <VendaWizard
          auth={auth}
          painel={painel}
          vendedorPadrao={vendedorPadrao}
          vendedorNome={vendedorNome}
          onCancelar={() => onWizard(false)}
          onSalvo={onSalvo}
        />
      ) : (
        <div className={styles.grid}>
          <section className={styles.card} aria-label="Venda">
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Venda</h2>
              {venda ? <span className={styles.cardSub}>{FORMA_LABEL[String(venda.forma_pagamento)] ?? ""}</span> : null}
            </div>
            {venda ? (
              <>
                <dl className={styles.kv}>
                  <dt>Comprador</dt>
                  <dd>{str(venda.comprador_nome) ?? "—"}</dd>
                  <dt>CPF/CNPJ</dt>
                  <dd>{str(venda.comprador_documento) ?? "—"}</dd>
                  <dt>Telefone</dt>
                  <dd>{str(venda.comprador_telefone) ?? "—"}</dd>
                  <dt>Valor</dt>
                  <dd>
                    {formatValor(valorVenda) ?? "—"}
                    {desconto ? ` (desconto de ${formatValor(desconto)})` : ""}
                  </dd>
                  <dt>Data da venda</dt>
                  <dd>{formatDataCurta(str(venda.data_venda)) ?? "—"}</dd>
                </dl>
                <p className={styles.clausula}>
                  <small>Pagamento</small>
                  {clausulaPagamento({
                    valorTotal: valorVenda,
                    desconto,
                    formaPagamento: str(venda.forma_pagamento),
                    financBanco: str(venda.financ_banco),
                    financValor: num(venda.financ_valor),
                    financParcelasQtde: num(venda.financ_parcelas_qtde),
                    financParcelaValor: num(venda.financ_parcela_valor),
                    cartaoParcelasQtde: num(venda.cartao_parcelas_qtde),
                    cartaoParcelaValor: num(venda.cartao_parcela_valor),
                    entradas: venda.venda_entradas.map((entrada) => ({
                      tipo: entrada.tipo,
                      valor: entrada.valor,
                      descricao: entrada.descricao,
                      cartaoParcelasQtde: entrada.cartao_parcelas_qtde,
                      cartaoParcelaValor: entrada.cartao_parcela_valor,
                      troca: entrada.troca ? { placa: entrada.troca.placa, modelo: entrada.troca.modelo, anoMod: entrada.troca.anoMod, cor: entrada.troca.cor } : null
                    }))
                  }) || "Sem valor informado."}
                </p>
                {clausulaTransferencia({ tipoTransferencia: str(venda.tipo_transferencia), valorTransferencia: num(venda.valor_transferencia) }) ? (
                  <p className={styles.clausula}>
                    <small>Transferência</small>
                    {clausulaTransferencia({ tipoTransferencia: str(venda.tipo_transferencia), valorTransferencia: num(venda.valor_transferencia) })}
                  </p>
                ) : null}
                {descreverDebitos(str(venda.debitos), num(venda.debitos_valor)) ? (
                  <p className={`${styles.alert} ${styles.alertDanger}`} data-testid="vender-painel-debitos">
                    <Icon name="alert" size={16} />
                    Débitos: {descreverDebitos(str(venda.debitos), num(venda.debitos_valor))}
                  </p>
                ) : null}
                {venda.venda_entradas
                  .filter((entrada) => entrada.tipo === "carro_troca" && descreverDebitos(entrada.debitos, entrada.debitos_valor))
                  .map((entrada) => (
                    <p key={entrada.id} className={styles.alert} data-testid="vender-painel-debitos-troca">
                      <Icon name="car" size={16} />
                      Débitos da troca{entrada.troca?.placa ? ` (${entrada.troca.placa})` : ""}: {descreverDebitos(entrada.debitos, entrada.debitos_valor)}
                    </p>
                  ))}
              </>
            ) : (
              <p className={styles.cardSub}>
                {vendidoSemRegistro
                  ? "Este veículo consta como vendido, mas a venda não foi registrada no sistema. Registre para gerar os documentos."
                  : situacao === "disponivel"
                    ? "Nenhuma venda em andamento. Inicie a venda para reservar o veículo para o cliente e gerar os documentos."
                    : "Sem venda ativa."}
              </p>
            )}
          </section>

          <div className={styles.wizardMain}>
            <section className={styles.card} aria-label="Documentos da venda" data-testid="vender-documentos">
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Documentos da venda</h2>
                <span className={styles.spacer} />
                {venda ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.small}`}
                    onClick={() =>
                      void novoDocumento
                        .escolherECriar(
                          venda.id,
                          Object.fromEntries(checklist.map((item) => [item.categoria.key, item.relevancia])),
                          Object.fromEntries(checklist.map((item) => [item.categoria.key, item.documentos.length])),
                          { temTroca: vendaTemTroca(painel) }
                        )
                        .then((doc) => {
                          if (doc) router.push(`/vendedor/word?carro=${carro.id}&doc=${doc.id}`);
                        })
                        .catch((err: unknown) => setAviso({ tom: "erro", texto: err instanceof Error ? err.message : "Falha ao criar o documento." }))
                    }
                    data-testid="vender-novo-documento"
                  >
                    <Icon name="fileplus" size={14} />
                    Novo
                  </button>
                ) : null}
              </div>
              {!venda ? (
                <p className={styles.cardSub}>Os documentos nascem da venda — inicie a venda primeiro.</p>
              ) : checklist.length === 0 ? (
                <p className={styles.cardSub}>Nenhum documento esperado nesta situação.</p>
              ) : (
                <ul className={styles.docList}>
                  {checklist.map((item) => {
                    const estado = estadoDoItem(item);
                    const doc = item.documentos[0];
                    return (
                      <li key={item.categoria.key} className={styles.docRow} data-estado={estado} data-testid={`vender-doc-${item.categoria.key}`}>
                        <span className={styles.docIcon}>
                          <Icon name={estado === "gerado" ? "check" : estado === "obrigatorio" ? "alert" : "file"} size={15} />
                        </span>
                        <span className={styles.docBody}>
                          <span className={styles.docLabel}>{item.categoria.label}</span>
                          <span className={styles.docHint} title={item.categoria.resumo}>
                            {estado === "gerado"
                              ? `Gerado${item.documentos.length > 1 ? ` (${item.documentos.length})` : ""}${item.arquivado ? " · via assinada arquivada" : " · falta arquivar a via assinada"}`
                              : `${estado === "obrigatorio" ? "Obrigatório" : estado === "recomendado" ? "Recomendado" : "Opcional"} · ${item.categoria.resumo}`}
                          </span>
                        </span>
                        <span className={styles.docActions}>
                          {doc ? (
                            <>
                              <button type="button" className={styles.linkBtn} onClick={() => void imprimir(doc.id)}>
                                Imprimir
                              </button>
                              <Link className={styles.linkBtn} href={`/vendedor/word?carro=${carro.id}&doc=${doc.id}`}>
                                Abrir
                              </Link>
                            </>
                          ) : (
                            <button
                              type="button"
                              className={styles.linkBtn}
                              onClick={() => void gerar(item.categoria.key)}
                              disabled={novoDocumento.criando === item.categoria.key}
                              data-testid={`vender-gerar-${item.categoria.key}`}
                            >
                              {novoDocumento.criando === item.categoria.key ? "Gerando..." : "Gerar"}
                            </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className={styles.card} aria-label="Arquivos do veículo" data-testid="vender-arquivos">
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Arquivos do veículo</h2>
                <span className={styles.cardSub}>{painel.arquivos.length} na pasta de documentos</span>
              </div>
              {situacao === "vendido" || situacao === "entregue" ? (
                <div className={styles.addRow}>
                  {ARQUIVOS_DA_VENDA.map((tipo) => {
                    const presente = (tiposPresentes.get(tipo) ?? 0) > 0;
                    return (
                      <span key={tipo} className={`${styles.alert} ${presente ? styles.alertOk : ""}`.trim()} title={presente ? "Arquivado" : "Ainda não arquivado"}>
                        <Icon name={presente ? "check" : "info"} size={14} />
                        {ROTULO_ARQUIVO.get(tipo) ?? tipo}
                      </span>
                    );
                  })}
                </div>
              ) : null}
              {arquivosPorTipo.length === 0 ? (
                <p className={styles.cardSub}>Nenhum arquivo na pasta de documentos deste veículo.</p>
              ) : (
                arquivosPorTipo.map(([label, arquivos]) => (
                  <div key={label} className={styles.fileGroup}>
                    <span className={styles.fileGroupLabel}>{label}</span>
                    <ul className={styles.docList}>
                      {arquivos.map((arquivo) => (
                        <li key={arquivo.id} className={styles.docRow}>
                          <span className={styles.docIcon}>
                            <Icon name={arquivo.mimeType.startsWith("image/") ? "image" : "file"} size={15} />
                          </span>
                          <span className={styles.docBody}>
                            <span className={styles.docHint} title={arquivo.fileName}>
                              {arquivo.fileName}
                            </span>
                          </span>
                          <span className={styles.docActions}>
                            {arquivo.previewUrl ? (
                              <a className={styles.linkBtn} href={arquivo.previewUrl} target="_blank" rel="noopener noreferrer">
                                Abrir
                              </a>
                            ) : null}
                            {arquivo.downloadUrl ? (
                              <a className={styles.linkBtn} href={arquivo.downloadUrl}>
                                Baixar
                              </a>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>
      )}

      <FocusDialog
        open={Boolean(acao)}
        onClose={() => setAcao(null)}
        busy={ocupado}
        title={acao?.tipo === "concluir" ? `Concluir a venda — ${carro.placa}` : `Registrar a entrega — ${carro.placa}`}
        subtitle={
          acao?.tipo === "concluir"
            ? "O veículo passa a VENDIDO e o envelope de documentos entra em fechamento."
            : "A entrega marca a responsabilidade do comprador (multas, despesas) e inicia a garantia legal de 90 dias."
        }
        size="sm"
        testId="vender-acao-dialog"
        footer={
          <>
            <button type="button" className={dialogStyles.btn} onClick={() => setAcao(null)} disabled={ocupado}>
              Voltar
            </button>
            <button type="button" className={`${dialogStyles.btn} ${dialogStyles.primary}`} onClick={() => void confirmarAcao()} disabled={ocupado} data-testid="vender-acao-confirmar">
              {ocupado ? "Salvando..." : acao?.tipo === "concluir" ? "Concluir venda" : "Registrar entrega"}
            </button>
          </>
        }
      >
        <label className={dialogStyles.field}>
          <span className={dialogStyles.fieldLabel}>{acao?.tipo === "concluir" ? "Data da venda" : "Data da entrega"}</span>
          <input type="date" value={acao?.data ?? ""} onChange={(e) => setAcao((atual) => (atual ? { ...atual, data: e.target.value } : atual))} />
        </label>
      </FocusDialog>

      {novoDocumento.dialogos}
    </div>
  );
}
