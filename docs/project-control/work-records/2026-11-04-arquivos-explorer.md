# 2026-11-04 — Arquivos: explorer com índice no cliente (fase 1 de 3)

## Por quê

`/arquivos` era lento em tudo: abrir uma pasta fazia o servidor reler todas as
pastas + contagens + automação e assinar **2 URLs por arquivo** (uma chamada ao
Storage cada); toda mutação (renomear, excluir, reordenar) devolvia esse mesmo
"detail" pesado; a busca só filtrava a pasta aberta. A UI era um monólito de
3.2k linhas com slots de documento duplicando o formulário de upload.

## O que mudou

**Servidor**
- `GET /api/v1/files/index` — árvore inteira + metadados de todos os arquivos
  (sem URLs), paginado contra o `max_rows` do PostgREST. Automação carregada em
  leituras fixas (`loadFolderAutomationIndex`, substitui o `enrich…` N+1) já com
  rótulo do veículo e `foto_capa_id`.
- `POST /api/v1/files/sign` — assina em lote, só ids que existem no banco.
  `original` = uma chamada `createSignedUrls`; `thumb` = Image Transformations
  (400px, ~19 KB vs ~240 KB). Desliga com `FILES_THUMBNAILS=off`.
- `POST /api/v1/files/files/bulk` — mover/excluir em lote (antes: 1 request por
  arquivo + reindexação da pasta inteira).
- Mutações devolvem só a entidade alterada. `finalize` valida que o path veio do
  `prepare` daquela pasta; `prepare` valida a pasta.
- Removidos: `GET /folders`, `GET /folders/[id]`, upload multipart
  `POST /folders/[id]/files` (caminho de upload redundante).
- `listSignedFolderFiles`/`signPreviewUrlsByFileIds` (vendedor/catálogo) também
  passaram a assinar em lote.

**Cliente** (`components/files/explorer/**`)
- Índice em memória (cache de módulo + revalidação em segundo plano guardada
  contra mutações em voo). Entrar/sair de pasta e buscar = zero rede
  (~80–100 ms medidos em modo dev).
- UI estilo Windows Explorer: voltar/avançar/subir, breadcrumb com menus de
  subpastas, árvore, Detalhes/Lista/Ícones médios/grandes (preferência por tipo
  de pasta), painel de detalhes com preview, visualizador em tela cheia,
  seleção Ctrl/Shift/teclado, F2, Del, Ctrl+X/V, Ctrl+A, Backspace, Alt+←/→,
  Ctrl+F, Ctrl+Shift+N, menu de contexto, arrastar (mover/reordenar/enviar),
  colar arquivos do sistema, busca global por caminho e nome.
- Mutações otimistas com rollback. Upload: fila única com prepare em lote, PUT
  com progresso real (XHR), finalize agrupado e serializado.
- Slots de documento removidos; pastas de documentos usam só o formulário de
  classificação (agora marca os tipos já anexados).
- Pastas gerenciadas pela automação não podem ser movidas/renomeadas à mão;
  repositórios não podem ser excluídos (a automação recolocaria tudo).

## Riscos / notas

- Image Transformations é cobrado por imagem de origem/mês no plano do Supabase.
- `tests/e2e/visual/arquivos*.spec.ts` (artefatos de polish) referenciam a UI
  antiga e não foram atualizados.
- Fases seguintes: (2) regras de pastas de veículo customizáveis; (3) console de
  OCR com templates por arquivo de exemplo.

## Evidência

- `npm run test:unit` 590/590; `tests/e2e/files.spec.ts` 5/5; lint/tsc/build ok.
- Índice real: 373 pastas, 1.099 arquivos, ~1 s no dev server aquecido.
