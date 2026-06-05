"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, fetchVehicleDocuments, type VehicleDocumentFile } from "@/components/ui-grid/api";
import { DOCUMENT_TYPES, matchDocumentType } from "@/components/files/document-slots";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";

const OUTROS_KEY = "__outros__";
const OUTROS_LABEL = "Outros documentos";

type DocGroup = { key: string; label: string; files: VehicleDocumentFile[] };

function groupByType(files: VehicleDocumentFile[], placa: string): DocGroup[] {
  const byKey = new Map<string, DocGroup>();

  for (const file of files) {
    if (file.isMissing) continue;
    const type = matchDocumentType(file.fileName, placa);
    const key = type?.key ?? OUTROS_KEY;
    const label = type?.label ?? OUTROS_LABEL;
    const group = byKey.get(key) ?? { key, label, files: [] };
    group.files.push(file);
    byKey.set(key, group);
  }

  // Ordena pelos tipos do catálogo; "Outros" por último.
  const order = new Map(DOCUMENT_TYPES.map((type, index) => [type.key, index]));
  return Array.from(byKey.values()).sort((left, right) => {
    const li = order.get(left.key) ?? Number.MAX_SAFE_INTEGER;
    const ri = order.get(right.key) ?? Number.MAX_SAFE_INTEGER;
    return li - ri;
  });
}

export function VehicleDocumentsPanel({ carroId }: { carroId: string }) {
  const auth = useVendedorAuth();
  const [files, setFiles] = useState<VehicleDocumentFile[]>([]);
  const [placa, setPlaca] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    const token = (reqRef.current += 1);
    setLoading(true);
    setError(null);
    fetchVehicleDocuments({ requestAuth: auth, carroId })
      .then((data) => {
        if (token !== reqRef.current) return;
        setFiles(data.files);
        setPlaca(data.placa);
      })
      .catch((err: unknown) => {
        if (token !== reqRef.current) return;
        setError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao carregar documentos.");
      })
      .finally(() => {
        if (token === reqRef.current) setLoading(false);
      });
  }, [auth, carroId]);

  const groups = useMemo(() => groupByType(files, placa), [files, placa]);

  if (loading) return <p className="vendedor-hint">Carregando documentos...</p>;
  if (error) return <p className="vendedor-error">{error}</p>;
  if (groups.length === 0) return <p className="vendedor-empty">Nenhum documento disponivel para este veiculo.</p>;

  return (
    <div className="vendedor-docs" data-testid="vendedor-docs">
      {groups.map((group) => (
        <article key={group.key} className="vendedor-doc-group">
          <h3>{group.label}</h3>
          <ul>
            {group.files.map((file) => (
              <li key={file.id} className="vendedor-doc-row">
                <span className="vendedor-doc-name" title={file.fileName}>
                  {file.fileName}
                </span>
                <span className="vendedor-doc-actions">
                  {file.previewUrl ? (
                    <a
                      className="vendedor-btn-ghost"
                      href={file.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`vendedor-doc-open-${file.id}`}
                    >
                      Abrir
                    </a>
                  ) : null}
                  {file.downloadUrl ? (
                    <a
                      className="vendedor-btn-ghost"
                      href={file.downloadUrl}
                      data-testid={`vendedor-doc-download-${file.id}`}
                    >
                      Baixar
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
