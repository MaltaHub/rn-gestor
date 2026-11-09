"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { DOCUMENT_TYPES, matchDocumentType } from "@/components/files/document-slots";
import { fetchVehicleDocuments, type VehicleDocumentFile } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import styles from "@/components/ui-grid/form-vehicle-documents.module.css";

/** Tipos do processo: sempre aparecem (faltando = atalho para enviar). */
const PROCESS_KEYS = ["crlv_branco", "procuracao", "crlv_virado", "nota_entrada", "pericia", "nota_saida"];

type Chip = { key: string; label: string; files: VehicleDocumentFile[] };

function buildChips(files: VehicleDocumentFile[], placa: string): Chip[] {
  const byKey = new Map<string, VehicleDocumentFile[]>();
  for (const file of files) {
    if (file.isMissing) continue;
    const key = matchDocumentType(file.fileName, placa)?.key;
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), file]);
  }
  return DOCUMENT_TYPES.filter((type) => PROCESS_KEYS.includes(type.key) || byKey.has(type.key)).map((type) => ({
    key: type.key,
    label: type.label,
    // Mais recente por último (sort_order cresce com o envio).
    files: (byKey.get(type.key) ?? []).sort((left, right) => left.sortOrder - right.sortOrder)
  }));
}

/**
 * Atalhos do form do grid para os documentos do veículo: um botão por tipo
 * (CRLV, Procuração, Nota de entrada, Perícia…). Presente = abre o arquivo;
 * faltando = vai para a pasta de documentos (enviar).
 */
export function FormVehicleDocuments({
  carroId,
  requestAuth,
  hideTitle
}: {
  carroId: string;
  requestAuth: RequestAuth;
  /** Dentro de um grupo do form (o grupo já tem o título). */
  hideTitle?: boolean;
}) {
  const [state, setState] = useState<{ placa: string; files: VehicleDocumentFile[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const token = (requestRef.current += 1);
    setState(null);
    setError(null);
    fetchVehicleDocuments({ requestAuth, carroId })
      .then((data) => {
        if (token === requestRef.current) setState({ placa: data.placa, files: data.files });
      })
      .catch((err: unknown) => {
        if (token === requestRef.current) setError(err instanceof Error ? err.message : "Falha ao carregar documentos.");
      });
  }, [carroId, requestAuth]);

  const chips = useMemo(() => (state ? buildChips(state.files, state.placa) : []), [state]);
  const folderHref = `/arquivos?carro=${encodeURIComponent(carroId)}`;

  return (
    <nav className={`${styles.strip} ${hideTitle ? styles.bare : ""}`} aria-label="Documentos do veículo" data-testid="form-vehicle-documents">
      {hideTitle ? null : <span className={styles.title}>Documentos</span>}
      {error ? <span className={styles.hint}>{error}</span> : null}
      {!state && !error ? <span className={styles.hint}>Carregando…</span> : null}
      {chips.map((chip) => {
        const latest = chip.files[chip.files.length - 1];
        if (latest?.previewUrl) {
          return (
            <a
              key={chip.key}
              className={`${styles.chip} ${styles.present}`}
              href={latest.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={chip.files.map((file) => file.fileName).join("\n")}
              data-testid={`form-doc-${chip.key}`}
            >
              <span aria-hidden="true">✓</span> {chip.label}
              {chip.files.length > 1 ? <small>{chip.files.length}</small> : null}
            </a>
          );
        }
        return (
          <Link
            key={chip.key}
            className={`${styles.chip} ${styles.missing}`}
            href={folderHref}
            title={`Sem ${chip.label} — abrir a pasta para enviar`}
            data-testid={`form-doc-${chip.key}`}
          >
            <span aria-hidden="true">+</span> {chip.label}
          </Link>
        );
      })}
    </nav>
  );
}
