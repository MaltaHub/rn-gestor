/**
 * ============================================================================
 * BACKUP DE CONTENCAO — MONOLITO Apps Script (sem imports)
 * ----------------------------------------------------------------------------
 * Espelho vivo do Postgres (Supabase) numa Google Spreadsheet: 1 aba por tabela.
 * O BACK-END (trigger Postgres) garante o espelhamento de toda manipulacao de
 * dados; ESTE Apps Script tem TODA a logica de suporte/processamento.
 *
 * LAYOUT PADRAO (por aba):
 *   Linha 1  -> titulo (nome da tabela + ultima sincronizacao)
 *   Linha 2  -> header (nomes das colunas)         [linhas 1-2 congeladas]
 *   Linha 3+ -> dados                              [DATA_START_ROW = 3]
 *
 * CONTRATO DO PAYLOAD (o que o back-end deve enviar p/ o /exec via POST JSON):
 *   {
 *     "token": "<igual a Script Property WEBHOOK_TOKEN>",
 *     "source": "supabase-trigger",            // opcional (auditoria; GAS nao expoe IP)
 *     // 1 operacao:
 *     "table": "carros", "op": "upsert"|"delete", "row": { ...linha completa... }
 *     // OU lote:
 *     "ops": [ { "table": "...", "op": "...", "row": { ... } }, ... ]
 *   }
 *   - op "upsert": casa pela PK (registry); atualiza no lugar ou insere ao fim.
 *   - op "delete": casa pela PK e remove SO aquela linha.
 *   - "row" deve conter a PK. Em upsert deve trazer a linha completa (NEW);
 *     em delete basta a PK (mas a linha completa tambem funciona).
 *
 * SEGURANCA / ESTABILIDADE (PASSO 3):
 *   - Token obrigatorio (Script Property WEBHOOK_TOKEN / ERP_WEBHOOK_TOKEN).
 *   - ScriptLock serializa TODAS as escritas (sem corrida).
 *   - Whitelist de tabelas (registry): tabela desconhecida e rejeitada.
 *   - PK obrigatoria: sem PK, nada e escrito (evita escrita cega).
 *   - Mapeamento SEMPRE por NOME de coluna (nunca por posicao fixa) + auto-grow
 *     do header: coluna nova do schema NAO some, e ordem divergente nao corrompe.
 *   - Update faz MERGE (so sobrescreve as colunas presentes no payload) — nunca
 *     zera o que nao veio.
 *   - NUNCA limpa/replace a aba inteira (a causa antiga de "apagou tudo" foi
 *     removida): so upsert/delete por linha.
 *   - Aba de auditoria __LOG__ (máx 500 linhas, FIFO): data/hora, origem, aba,
 *     op, pk e VALOR ANTERIOR (para update/delete).
 *
 * Observacao: este arquivo e o UNICO .gs de back-end. Se o projeto tiver outros
 * .gs definindo onOpen/doGet/doPost/include/jsonResponse_, remova-os (o Apps
 * Script nao permite funcoes duplicadas no mesmo projeto).
 * ============================================================================
 */

var BACKUP = {
  TOKEN_PROPS: ["WEBHOOK_TOKEN", "ERP_WEBHOOK_TOKEN"],
  LOG_TAB: "__LOG__",
  TITLE_ROW: 1,
  HEADER_ROW: 2,
  DATA_START_ROW: 3,
  LOG_MAX_ROWS: 500,
  LOCK_WAIT_MS: 30000,
  KEY_SEP: "" // separador interno p/ PK composta
};

/**
 * REGISTRY (gerado do schema real public/base tables). Fonte unica da verdade:
 *   table -> { tab, pk:[colunas], cols:[colunas na ordem do banco] }
 * PK = chave primaria do banco. carros usa `id` (imutavel) de proposito.
 * Para tirar/por tabela do backup, comente/adicione a linha aqui.
 */
var _BACKUP_REGISTRY = null;
function backupRegistry_() {
  if (_BACKUP_REGISTRY) return _BACKUP_REGISTRY;
  var defs = [
    ["anuncios", "id", "id,carro_id,estado_anuncio,valor_anuncio,created_at,updated_at,anuncio_legado,id_anuncio_legado,descricao,no_instagram,placa_anunciado_repetido"],
    ["anuncios_insight_verifications", "anuncio_id,insight_code", "anuncio_id,insight_code,verified_by,verified_at"],
    ["arquivo_automacao_config", "automation_key", "automation_key,repository_folder_id,display_field,enabled,created_at,updated_at,updated_by"],
    ["arquivo_automacao_folders", "id", "id,automation_key,folder_id,carro_id,entity_snapshot,archived_at,created_at,updated_at,automation_paused"],
    ["arquivos_arquivos", "id", "id,pasta_id,bucket_id,storage_path,nome_arquivo,mime_type,tamanho_bytes,sort_order,created_at,updated_at,uploaded_by"],
    ["arquivos_pastas", "id", "id,nome,nome_slug,descricao,created_at,updated_at,created_by,updated_by,parent_folder_id"],
    ["caracteristicas_tecnicas", "id", "id,caracteristica,created_at,updated_at"],
    ["caracteristicas_visuais", "id", "id,caracteristica,created_at,updated_at"],
    ["carro_caracteristicas_tecnicas", "carro_id,caracteristica_id", "carro_id,caracteristica_id,created_at,updated_at"],
    ["carro_caracteristicas_visuais", "carro_id,caracteristica_id", "carro_id,caracteristica_id,created_at,updated_at"],
    ["carros", "id", "id,nome,ano_fab,ano_mod,hodometro,modelo_id,cor,placa,local,em_estoque,estado_venda,estado_veiculo,preco_original,estado_anuncio,ano_ipva_pago,tem_chave_r,tem_manual,chassi,renavam,fotos_pasta_id,foto_capa_id,data_entrada,data_venda,created_at,updated_at,ultima_alteracao,os_supply_appscript_check,tem_fotos,participa_calculos,placa_anunciado_repetido"],
    ["controle_envelopes", "id", "id,carro_id,item,status,usuario_auth_user_id,observacao,retirado_em,devolvido_em,created_at,updated_at"],
    ["documento_templates", "id", "id,titulo,descricao,conteudo,is_active,created_by_user_id,updated_by_user_id,created_at,updated_at"],
    ["documentos", "carro_id", "carro_id,created_at,updated_at,observacao,responsavel_virado,nota_entrada,nota_saida,tipo_de_processo,proposito,chave_reserva,pericia,envelope,estado_transferencia,remetente_id,origem,valor_compra,recibo_compra,envelope_ordem,chave_reserva_domain,envelope_domain,pericia_domain,recibo_compra_domain,estado_transferencia_domain,origem_domain,proposito_domain,tipo_de_processo_domain"],
    ["editor_flow_runs", "id", "id,flow_id,user_id,status,current_node_id,context,paused_reason,error,lock_token,locked_until,started_at,updated_at,completed_at"],
    ["editor_flows", "id", "id,title,description,sheet_key,graph,created_by_user_id,created_at,updated_at"],
    ["editor_user_variables", "user_id,name", "user_id,name,value,type,created_at,updated_at"],
    ["finalizados", "id", "id,placa,modelo,ano_fab,ano_mod,hodometro,cor,chassi,renavam,ano_ipva_pago,data_venda,data_entrega,vendedor,valor_venda,valor_seguro,seguradora,valor_financiamento,banco_financiamento,valor_entrada,finalizado_em,created_at,updated_at"],
    ["grupos_repetidos", "grupo_id", "grupo_id,modelo_id,cor,ano_mod,preco_original,preco_min,preco_max,hodometro_min,hodometro_max,qtde,atualizado_em,created_at,updated_at,ano_fab,caracteristicas_visuais_ids,caracteristicas_visuais_resumo"],
    ["log_alteracoes", "id", "id,data_hora,autor_usuario_id,autor,autor_email,autor_cargo,acao,tabela,pk,em_lote,lote_id,dados_anteriores,dados_novos,detalhes,created_at"],
    ["lookup_announcement_statuses", "code", "code,name,description,is_active,sort_order,created_at,updated_at"],
    ["lookup_audit_actions", "code", "code,name,description,is_active,sort_order,created_at,updated_at"],
    ["lookup_locations", "code", "code,name,description,is_active,sort_order,created_at,updated_at"],
    ["lookup_sale_statuses", "code", "code,name,description,is_active,sort_order,created_at,updated_at"],
    ["lookup_user_roles", "code", "code,name,description,is_active,sort_order,created_at,updated_at"],
    ["lookup_user_statuses", "code", "code,name,description,is_active,sort_order,created_at,updated_at"],
    ["lookup_vehicle_states", "code", "code,name,description,is_active,sort_order,created_at,updated_at"],
    ["lookups", "domain,code", "domain,code,name,description,is_active,sort_order,created_at,updated_at"],
    ["modelos", "id", "id,modelo,created_at,updated_at,codigo_oficial"],
    ["observacoes", "id", "id,carro_id,tipo,texto,status,autor_auth_user_id,resolvido_em,created_at,updated_at,prazo,titulo,feedback_solucao"],
    ["price_change_contexts", "id", "id,table_name,row_id,column_name,old_value,new_value,context,created_by,created_at"],
    ["print_templates", "id", "id,user_id,sheet_key,title,config,anchor_filter,created_at,updated_at"],
    ["remetentes", "id", "id,nome,endereco,cpf_cnpj,is_active,created_at,updated_at"],
    ["repetidos", "carro_id", "carro_id,grupo_id,created_at,updated_at"],
    ["usuarios_acesso", "id", "id,nome,email,foto,cargo,status,criado_em,aprovado_em,ultimo_login,obs,created_at,updated_at,auth_user_id,bio,telefone"],
    ["venda_documentos", "id", "id,venda_id,carro_id,titulo,conteudo,template_id,created_by_user_id,created_at,updated_at"],
    ["venda_entradas", "id", "id,venda_id,tipo,valor,cartao_parcelas_qtde,cartao_parcela_valor,carro_troca_id,descricao,created_at,updated_at"],
    ["vendas", "id", "id,carro_id,vendedor_auth_user_id,data_venda,valor_total,valor_entrada,forma_pagamento,estado_venda,observacao,comprador_nome,comprador_documento,comprador_telefone,comprador_email,comprador_endereco,financ_banco,financ_parcelas_qtde,financ_parcela_valor,financ_taxa_mensal,financ_primeira_em,seguro_seguradora,seguro_apolice,seguro_valor,seguro_validade,created_at,updated_at,created_by_user_id,canal_cliente,data_entrega,financ_valor,cartao_parcelas_qtde,cartao_parcela_valor,desconto,tipo_transferencia,valor_transferencia,comprador_rg,comprador_cep,comprador_cidade_estado,debitos,estagio,canal_cliente_domain"]
  ];
  var reg = {};
  for (var i = 0; i < defs.length; i++) {
    var d = defs[i];
    reg[d[0]] = { tab: d[0], pk: d[1].split(","), cols: d[2].split(",") };
  }
  _BACKUP_REGISTRY = reg;
  return reg;
}

/* ===========================================================================
 * MENU / UI (preservado e consolidado)
 * =========================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🚗 ERP Backup")
    .addItem("🖥️ Abrir Sistema (tela cheia)", "uiOpenSystem")
    .addSeparator()
    .addItem("🧱 Inicializar / Validar Abas de Backup", "uiBackupBootstrap")
    .addToUi();
}

function uiOpenSystem() {
  var url = "https://script.google.com/macros/s/AKfycbxLD13oX5VoR7wBvIM1vmBBWxKpUHx1f72-T75WeMX2/dev";
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial;padding:12px">' +
    '<h3 style="margin:0 0 8px 0">Abrir ERP em tela cheia</h3>' +
    '<p style="margin:0 0 12px 0">Clique no link:</p>' +
    '<a href="' + url + '" target="_blank">' + url + "</a></div>"
  ).setWidth(520).setHeight(220);
  SpreadsheetApp.getUi().showModalDialog(html, "Abrir ERP");
}

function doGet() {
  return HtmlService.createTemplateFromFile("app").evaluate()
    .setTitle("ERP — Backup")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(forcePlain_(obj)))
    .setMimeType(ContentService.MimeType.JSON);
}

function forcePlain_(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ===========================================================================
 * PASSO 1 — INICIALIZADOR DE ABAS (1 por tabela, no padrao linha 3)
 * =========================================================================== */

function uiBackupBootstrap() {
  var r = backupBootstrap_();
  var msg = "Backup bootstrap OK ✅";
  if (r.created.length) msg += "\n\n🆕 Abas criadas:\n" + r.created.join(", ");
  if (r.headerWritten.length) msg += "\n\n🧱 Header escrito:\n" + r.headerWritten.join(", ");
  if (r.ok.length) msg += "\n\n✔️ Ja conformes: " + r.ok.length + " abas";
  if (r.mismatches.length) {
    msg += "\n\n⚠️ HEADER DIVERGENTE (nada alterado p/ evitar perda):\n" +
      r.mismatches.map(function (m) { return m.tab + " — esperado [" + m.expected.join(",") + "] / achou [" + m.found.join(",") + "]"; }).join("\n");
  }
  SpreadsheetApp.getUi().alert(msg);
}

/** Cria/valida 1 aba por tabela + a aba __LOG__. NUNCA apaga dados. */
function backupBootstrap_() {
  var ss = SpreadsheetApp.getActive();
  var reg = backupRegistry_();
  var out = { created: [], headerWritten: [], ok: [], mismatches: [] };

  Object.keys(reg).forEach(function (table) {
    var def = reg[table];
    var existed = ss.getSheetByName(def.tab) != null;
    var sh = backupGetOrCreateTab_(ss, def.tab);
    if (!existed) out.created.push(def.tab);

    var current = backupReadHeader_(sh);
    if (!current.length) {
      backupWriteLayout_(sh, def, def.cols);
      out.headerWritten.push(def.tab);
    } else if (backupHeaderMatches_(current, def.cols)) {
      out.ok.push(def.tab);
    } else {
      // Header existe e diverge: NAO mexe (mapeamento por nome no CRUD cobre
      // ordem diferente; aqui so reportamos divergencia "estranha").
      out.mismatches.push({ tab: def.tab, expected: def.cols, found: current });
    }
  });

  backupEnsureLogTab_(ss);
  return out;
}

function backupGetOrCreateTab_(ss, tabName) {
  var sh = ss.getSheetByName(tabName);
  if (!sh) sh = ss.insertSheet(tabName);
  return sh;
}

function backupReadHeader_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  var values = sh.getRange(BACKUP.HEADER_ROW, 1, 1, lastCol).getValues()[0];
  var header = [];
  for (var i = 0; i < values.length; i++) {
    header.push(String(values[i] == null ? "" : values[i]).trim());
  }
  while (header.length && header[header.length - 1] === "") header.pop();
  return header;
}

function backupHeaderMatches_(current, expected) {
  if (current.length !== expected.length) return false;
  for (var i = 0; i < expected.length; i++) {
    if (backupNormKey_(current[i]) !== backupNormKey_(expected[i])) return false;
  }
  return true;
}

/** Escreve titulo (linha 1) + header (linha 2) e congela as 2 primeiras linhas. */
function backupWriteLayout_(sh, def, header) {
  sh.getRange(BACKUP.TITLE_ROW, 1).setValue("📦 " + def.tab + "  ·  PK: " + def.pk.join("+") + "  ·  sync: " + new Date().toISOString());
  if (header.length) {
    sh.getRange(BACKUP.HEADER_ROW, 1, 1, header.length).setValues([header]);
  }
  try {
    sh.getRange(BACKUP.HEADER_ROW, 1, 1, Math.max(header.length, 1)).setFontWeight("bold");
    sh.setFrozenRows(BACKUP.HEADER_ROW);
  } catch (e) { /* formatacao e best-effort */ }
}

function backupEnsureLogTab_(ss) {
  var sh = ss.getSheetByName(BACKUP.LOG_TAB);
  if (!sh) sh = ss.insertSheet(BACKUP.LOG_TAB);
  var header = backupReadHeader_(sh);
  if (!header.length) {
    backupWriteLayout_(sh, { tab: BACKUP.LOG_TAB, pk: ["data_hora"] },
      ["data_hora", "origem", "aba", "op", "pk", "valor_anterior"]);
  }
  return sh;
}

/* ===========================================================================
 * PASSO 2 — CRUD GENERICO (doPost). Upsert/Delete por PK, via registry.
 * =========================================================================== */

function doPost(e) {
  try {
    var req = backupParseRequest_(e);
    backupAuthorize_(req);

    var result = backupWithLock_(function () {
      var ss = SpreadsheetApp.getActive();
      var results = [];
      for (var i = 0; i < req.ops.length; i++) {
        results.push(backupApplyOp_(ss, req.ops[i], req.source));
      }
      return results;
    });

    return jsonResponse_({ ok: true, count: result.length, results: result });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function backupParseRequest_(e) {
  var raw = e && e.postData && typeof e.postData.contents === "string" ? String(e.postData.contents).trim() : "";
  var body;
  try { body = raw ? JSON.parse(raw) : {}; }
  catch (err) { throw new Error("BACKUP_INVALID_JSON"); }

  var params = (e && e.parameter) || {};
  var token = String((body && body.token) || params.token || (body && body.auth && body.auth.token) || "").trim();
  var source = String((body && body.source) || params.source || "").trim() || "desconhecido";

  var rawOps = [];
  if (Array.isArray(body.ops)) {
    rawOps = body.ops;
  } else if (body && body.table) {
    rawOps = [{ table: body.table, op: body.op || body.action, row: body.row || body.data || body }];
  } else {
    throw new Error("BACKUP_MISSING_TABLE"); // sem `table`/`ops`: rejeita (contrato novo)
  }

  var ops = rawOps.map(function (o) {
    return {
      table: String((o && o.table) || "").trim(),
      op: backupNormOp_(o && (o.op || o.action)),
      row: (o && (o.row || o.data)) && typeof (o.row || o.data) === "object" ? (o.row || o.data) : (o && typeof o === "object" ? o : {})
    };
  });
  return { token: token, source: source, ops: ops };
}

function backupNormOp_(value) {
  var v = backupNormKey_(value);
  if (v === "delete" || v === "del" || v === "remove" || v === "remover" || v === "excluir" || v === "deleted") return "delete";
  return "upsert";
}

function backupAuthorize_(req) {
  var props = PropertiesService.getScriptProperties();
  var expected = "";
  for (var i = 0; i < BACKUP.TOKEN_PROPS.length && !expected; i++) {
    expected = String(props.getProperty(BACKUP.TOKEN_PROPS[i]) || "").trim();
  }
  if (!expected) throw new Error("BACKUP_TOKEN_NOT_CONFIGURED");
  if (!req || !req.token || req.token !== expected) throw new Error("BACKUP_UNAUTHORIZED");
}

function backupWithLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(BACKUP.LOCK_WAIT_MS)) throw new Error("BACKUP_LOCK_TIMEOUT");
  try { return fn(); } finally { lock.releaseLock(); }
}

function backupApplyOp_(ss, op, source) {
  var reg = backupRegistry_();
  var def = reg[op.table];
  if (!def) throw new Error("BACKUP_UNKNOWN_TABLE:" + op.table); // whitelist

  var pkValues = backupPkValues_(def, op.row);
  if (!pkValues) throw new Error("BACKUP_MISSING_PK:" + op.table); // sem PK, nao escreve

  var sh = backupGetOrCreateTab_(ss, def.tab);
  var header = backupEnsureHeader_(sh, def); // mapeia por nome; cria header se vazio

  var located = backupFindRow_(sh, header, def, pkValues);
  var before = located.rowIndex > 0 ? backupRowObject_(header, located.values) : null;

  var res;
  if (op.op === "delete") {
    res = backupDeleteAt_(sh, located, def, pkValues);
  } else {
    res = backupUpsert_(sh, header, def, op.row, located);
    // se o upsert cresceu o header, registra de novo (best-effort).
  }

  backupLog_(ss, {
    origem: source, aba: def.tab, op: op.op,
    pk: pkValues.join("+"),
    valor_anterior: before ? JSON.stringify(before) : ""
  });

  res.table = def.tab;
  res.op = op.op;
  res.pk = pkValues.join("+");
  return res;
}

/** Garante header na linha 2 (cria pelo registry se vazio). Retorna o header atual. */
function backupEnsureHeader_(sh, def) {
  var header = backupReadHeader_(sh);
  if (!header.length) {
    backupWriteLayout_(sh, def, def.cols);
    return def.cols.slice();
  }
  return header;
}

/** Acha a linha (3+) cuja PK casa. Le so as colunas da PK p/ eficiencia. */
function backupFindRow_(sh, header, def, pkValues) {
  var n = backupDataRowCount_(sh);
  if (n <= 0) return { rowIndex: -1, values: null };

  // indices (1-based de coluna) de cada coluna da PK no header atual
  var pkIdx = def.pk.map(function (c) { return backupColIndex_(header, c); });
  for (var k = 0; k < pkIdx.length; k++) {
    if (pkIdx[k] < 1) return { rowIndex: -1, values: null }; // PK ainda nao existe no header
  }

  var width = sh.getLastColumn();
  var block = sh.getRange(BACKUP.DATA_START_ROW, 1, n, width).getValues();
  for (var r = 0; r < block.length; r++) {
    var match = true;
    for (var j = 0; j < pkIdx.length; j++) {
      var cell = block[r][pkIdx[j] - 1];
      if (backupNormVal_(cell) !== backupNormVal_(pkValues[j])) { match = false; break; }
    }
    if (match) return { rowIndex: BACKUP.DATA_START_ROW + r, values: block[r] };
  }
  return { rowIndex: -1, values: null };
}

/**
 * Upsert seguro:
 *  - encontrado: MERGE (le a linha atual, sobrescreve SO as colunas presentes
 *    no payload, mantem o resto) -> nunca zera o que nao veio.
 *  - novo: monta linha do tamanho do header (vazios) com os valores presentes
 *    e adiciona ao fim. Colunas novas no payload sao anexadas ao header.
 */
function backupUpsert_(sh, header, def, rowObj, located) {
  var work = header.slice();
  var keys = Object.keys(rowObj || {});

  // auto-grow: chaves do payload que ainda nao estao no header
  var grew = false;
  for (var i = 0; i < keys.length; i++) {
    if (backupColIndex_(work, keys[i]) < 1) { work.push(keys[i]); grew = true; }
  }
  if (grew) {
    sh.getRange(BACKUP.HEADER_ROW, 1, 1, work.length).setValues([work]);
    try { sh.getRange(BACKUP.HEADER_ROW, 1, 1, work.length).setFontWeight("bold"); } catch (e) {}
  }

  if (located.rowIndex > 0) {
    // MERGE com a linha existente
    var existing = located.values.slice();
    while (existing.length < work.length) existing.push("");
    for (var k = 0; k < keys.length; k++) {
      var ci = backupColIndex_(work, keys[k]);
      if (ci >= 1) existing[ci - 1] = backupCell_(rowObj[keys[k]]);
    }
    sh.getRange(located.rowIndex, 1, 1, work.length).setValues([existing]);
    return { found: true, updated: true, created: false, removed: false };
  }

  // INSERT
  var fresh = [];
  for (var c = 0; c < work.length; c++) fresh.push("");
  for (var m = 0; m < keys.length; m++) {
    var idx = backupColIndex_(work, keys[m]);
    if (idx >= 1) fresh[idx - 1] = backupCell_(rowObj[keys[m]]);
  }
  var target = Math.max(Number(sh.getLastRow() || 0) + 1, BACKUP.DATA_START_ROW);
  sh.getRange(target, 1, 1, work.length).setValues([fresh]);
  return { found: false, updated: false, created: true, removed: false };
}

/** Delete seguro: remove SO a linha encontrada (nunca um range). */
function backupDeleteAt_(sh, located, def, pkValues) {
  if (located.rowIndex > 0) {
    sh.deleteRow(located.rowIndex);
    return { found: true, updated: false, created: false, removed: true };
  }
  return { found: false, updated: false, created: false, removed: false };
}

/* ===========================================================================
 * PASSO 3 — AUDITORIA (__LOG__): append + cap 500 FIFO
 * =========================================================================== */

function backupLog_(ss, entry) {
  try {
    var sh = backupEnsureLogTab_(ss);
    var header = backupReadHeader_(sh); // [data_hora, origem, aba, op, pk, valor_anterior]
    var row = [
      new Date().toISOString(),
      entry.origem || "",
      entry.aba || "",
      entry.op || "",
      entry.pk || "",
      entry.valor_anterior || ""
    ];
    var target = Math.max(Number(sh.getLastRow() || 0) + 1, BACKUP.DATA_START_ROW);
    sh.getRange(target, 1, 1, row.length).setValues([row]);

    // FIFO: mantem no maximo LOG_MAX_ROWS linhas de dados (apaga as mais antigas)
    var n = backupDataRowCount_(sh);
    if (n > BACKUP.LOG_MAX_ROWS) {
      sh.deleteRows(BACKUP.DATA_START_ROW, n - BACKUP.LOG_MAX_ROWS);
    }
  } catch (e) {
    // log e best-effort: nunca derruba a operacao principal.
  }
}

/* ===========================================================================
 * HELPERS
 * =========================================================================== */

function backupDataRowCount_(sh) {
  var last = Number(sh.getLastRow() || 0);
  return Math.max(last - (BACKUP.DATA_START_ROW - 1), 0);
}

/** indice 1-based da coluna `name` no header (por nome normalizado); -1 se ausente. */
function backupColIndex_(header, name) {
  var want = backupNormKey_(name);
  for (var i = 0; i < header.length; i++) {
    if (backupNormKey_(header[i]) === want) return i + 1;
  }
  return -1;
}

function backupPkValues_(def, rowObj) {
  if (!rowObj || typeof rowObj !== "object") return null;
  var values = [];
  for (var i = 0; i < def.pk.length; i++) {
    var v = backupLookupKey_(rowObj, def.pk[i]);
    if (v === null || v === undefined || String(v).trim() === "") return null; // PK incompleta
    values.push(v);
  }
  return values;
}

/** Busca uma chave no objeto por nome exato OU normalizado (tolerante). */
function backupLookupKey_(obj, key) {
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  var want = backupNormKey_(key);
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    if (backupNormKey_(keys[i]) === want) return obj[keys[i]];
  }
  return null;
}

function backupRowObject_(header, values) {
  var obj = {};
  for (var i = 0; i < header.length; i++) {
    if (!header[i]) continue;
    obj[header[i]] = values && i < values.length ? values[i] : "";
  }
  return obj;
}

/** Valor p/ celula: escalar como-esta; objeto/array -> JSON; null -> "". */
function backupCell_(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

/** Normaliza valor p/ COMPARACAO de PK (string, trim). */
function backupNormVal_(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).trim();
}

/** Normaliza NOME de coluna/op: minusculo, sem acento, nao-alfanumerico -> _. */
function backupNormKey_(value) {
  return String(value == null ? "" : value)
    .trim().toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
