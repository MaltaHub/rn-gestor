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
    ["finalizados", "id", "id,placa,modelo,ano_fab,ano_mod,hodometro,cor,chassi,renavam,ano_ipva_pago,data_venda,data_entrega,vendedor,valor_venda,valor_seguro,seguradora,valor_financiamento,banco_financiamento,valor_entrada,finalizado_em,created_at,updated_at"],
    ["grupos_repetidos", "grupo_id", "grupo_id,modelo_id,cor,ano_mod,preco_original,preco_min,preco_max,hodometro_min,hodometro_max,qtde,atualizado_em,created_at,updated_at,ano_fab,caracteristicas_visuais_ids,caracteristicas_visuais_resumo"],
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
    .addItem("🖨️ Barra de Impressão", "uiOpenPrintSidebar")
    .addItem("📥 Importar CSV (backup manual)", "uiOpenImportSidebar")
    .addSeparator()
    .addItem("🧩 Grid manual (CRUD + FKs)", "uiOpenManualGrid")
    .addItem("🧾 Gerar SQL das alterações manuais", "uiGenerateManualSql")
    .addItem("📌 Ativar rastreio de edições diretas", "uiInstallEditTracker")
    .addSeparator()
    .addItem("🧱 Inicializar / Validar Abas de Backup", "uiBackupBootstrap")
    .addToUi();
}

function uiOpenManualGrid() {
  var html = HtmlService.createHtmlOutputFromFile("grid-sidebar")
    .setWidth(1180).setHeight(760).setTitle("Grid manual (CRUD + FKs)");
  SpreadsheetApp.getUi().showModalDialog(html, "Grid manual — CRUD + FKs");
}

function uiGenerateManualSql() {
  var html = HtmlService.createHtmlOutputFromFile("sql-sidebar")
    .setWidth(900).setHeight(700).setTitle("SQL das alterações manuais");
  SpreadsheetApp.getUi().showModalDialog(html, "SQL das alterações manuais (backup reverso)");
}

/** Instala um gatilho onEdit (installable) que rastreia edições DIRETAS de célula
 *  nas abas de tabela (as escritas do backup via script NÃO disparam onEdit, então
 *  isso separa "manual" de "backup" automaticamente). */
function uiInstallEditTracker() {
  var ss = SpreadsheetApp.getActive();
  var already = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === "backupOnEditManual";
  });
  if (already) {
    SpreadsheetApp.getUi().alert("Rastreio de edições diretas já está ativo. ✅");
    return;
  }
  ScriptApp.newTrigger("backupOnEditManual").forSpreadsheet(ss).onEdit().create();
  SpreadsheetApp.getUi().alert(
    "Rastreio de edições diretas ATIVADO ✅\n\nA partir de agora, toda edição manual de célula numa aba de tabela vira uma alteração rastreada em " +
    MANUAL.TAB + " (as escritas do backup não são afetadas)."
  );
}

function uiOpenPrintSidebar() {
  var html = HtmlService.createHtmlOutputFromFile("print-sidebar").setTitle("Impressao");
  SpreadsheetApp.getUi().showSidebar(html);
}

function uiOpenImportSidebar() {
  var html = HtmlService.createHtmlOutputFromFile("import-sidebar").setTitle("Importar CSV");
  SpreadsheetApp.getUi().showSidebar(html);
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

/* ===========================================================================
 * IMPORTER DE CSV — backup manual (carga inicial dos dados JA existentes).
 * Fluxo: o usuario copia o CSV do Supabase, cola na sidebar, escolhe a tabela
 * e o Apps Script faz UPSERT em LOTE por PK (idempotente: re-colar nao duplica;
 * FK/ordem nao importam — e um espelho flat). Substitui o backfill via trigger,
 * que nao escalava (limite de 6 min/cota do Apps Script). Mantem um painel de
 * controle (aba __BACKUP_STATUS__): o que ja foi, quantas linhas e quando.
 * As funcoes SEM "_" sao chamadas pela sidebar via google.script.run.
 * =========================================================================== */

var IMPORT = { STATUS_TAB: "__BACKUP_STATUS__", MAX_PREVIEW: 5 };

// Contexto p/ a sidebar: lista de tabelas (registry) + status de cada backup.
function importContext() {
  var reg = backupRegistry_();
  var status = importReadStatus_();
  var tables = Object.keys(reg).sort().map(function (key) {
    var def = reg[key];
    var st = status[key] || null;
    return {
      key: key,
      pkLabel: def.pk.join(" + "),
      colCount: def.cols.length,
      done: !!st,
      rows: st ? st.rows : 0,
      when: st ? st.when : "",
      origem: st ? st.origem : ""
    };
  });
  return { tables: tables, total: tables.length, done: tables.filter(function (t) { return t.done; }).length };
}

// Acao principal: recebe a tabela + o texto CSV colado e faz o upsert em lote.
// replace=false (padrao): so upsert por PK, NUNCA apaga (carga aditiva/segura).
// replace=true ("modo substituir"): apos o upsert, REMOVE da aba as linhas cuja
// PK nao esta no CSV — vira espelho exato daquela tabela (formata). Recusa apagar
// tudo se o CSV nao tiver nenhuma PK valida (guarda anti-"apagou a planilha").
function importCsv(tableKey, csvText, replace) {
  var key = String(tableKey || "").trim();
  var doReplace = replace === true || replace === "true";
  var reg = backupRegistry_();
  var def = reg[key];
  if (!def) throw new Error("Tabela desconhecida: " + key);

  var parsed = importParseCsv_(String(csvText || ""));
  if (!parsed.header.length) throw new Error("CSV sem cabeçalho (linha 1 com os nomes das colunas).");
  if (!parsed.rows.length) throw new Error("CSV sem linhas de dados (só o cabeçalho).");

  // valida PK: o CSV precisa trazer todas as colunas da PK
  var pkMissing = def.pk.filter(function (c) { return importHeaderIndex_(parsed.header, c) < 0; });
  if (pkMissing.length) {
    throw new Error("O CSV não tem a(s) coluna(s) de PK: " + pkMissing.join(", ") +
      ". Colunas detectadas: " + parsed.header.join(", "));
  }

  return backupWithLock_(function () {
    var ss = SpreadsheetApp.getActive();
    var sh = backupGetOrCreateTab_(ss, def.tab);

    // header de trabalho: o que ja existe (ou o do registry) + colunas novas do CSV
    var header = backupReadHeader_(sh);
    if (!header.length) header = def.cols.slice();
    var grew = false;
    parsed.header.forEach(function (c) {
      if (c !== "" && backupColIndex_(header, c) < 1) { header.push(c); grew = true; }
    });
    if (grew || backupReadHeader_(sh).length === 0) {
      backupWriteLayout_(sh, def, header);
    }

    // bloco de dados atual -> mapa PK -> indice no bloco (1 leitura)
    var n = backupDataRowCount_(sh);
    var width = header.length;
    var block = n > 0 ? sh.getRange(BACKUP.DATA_START_ROW, 1, n, width).getValues() : [];
    for (var b = 0; b < block.length; b++) { while (block[b].length < width) block[b].push(""); }
    var SEP = ""; // separador interno seguro p/ PK composta (evita colisao do KEY_SEP="")
    var pkIdx = def.pk.map(function (c) { return backupColIndex_(header, c) - 1; });
    var map = {};
    for (var r = 0; r < block.length; r++) {
      var k0 = importPkKeyFromRow_(block[r], pkIdx, SEP);
      if (k0 !== null && !(k0 in map)) map[k0] = r;
    }

    // indices das colunas do CSV no header de trabalho
    var csvToHeader = parsed.header.map(function (c) { return c === "" ? -1 : backupColIndex_(header, c) - 1; });

    var inserted = 0, updated = 0, skipped = 0;
    var csvPkSet = {}; // PKs vistas no CSV (p/ o modo substituir)
    for (var i = 0; i < parsed.rows.length; i++) {
      var src = parsed.rows[i];
      // PK do registro vindo do CSV
      var pkVals = def.pk.map(function (c) {
        var hi = backupColIndex_(header, c) - 1;
        // acha o valor desse PK no src via csvToHeader
        for (var j = 0; j < csvToHeader.length; j++) if (csvToHeader[j] === hi) return src[j];
        return "";
      });
      if (pkVals.some(function (v) { return String(v == null ? "" : v).trim() === ""; })) { skipped++; continue; }
      var pkKey = pkVals.map(function (v) { return backupNormVal_(v); }).join(SEP);
      csvPkSet[pkKey] = true;

      var rowArr;
      if (pkKey in map) { rowArr = block[map[pkKey]]; updated++; }
      else { rowArr = new Array(width); for (var c2 = 0; c2 < width; c2++) rowArr[c2] = ""; block.push(rowArr); map[pkKey] = block.length - 1; inserted++; }

      // aplica os valores presentes no CSV (merge: so as colunas que vieram)
      for (var col = 0; col < csvToHeader.length; col++) {
        var hidx = csvToHeader[col];
        if (hidx >= 0) rowArr[hidx] = src[col];
      }
    }

    // MODO SUBSTITUIR: mantem so as linhas cuja PK veio no CSV (remove as demais).
    var removed = 0;
    if (doReplace) {
      var csvCount = 0; for (var kk in csvPkSet) if (csvPkSet.hasOwnProperty(kk)) csvCount++;
      if (csvCount === 0) throw new Error("Modo substituir abortado: o CSV não tem nenhuma PK válida (recuso apagar a aba inteira).");
      var kept = [];
      for (var rr = 0; rr < block.length; rr++) {
        var pk = importPkKeyFromRow_(block[rr], pkIdx, SEP);
        if (pk !== null && csvPkSet[pk]) kept.push(block[rr]);
        else removed++;
      }
      block = kept;
    }

    // escreve o bloco; no replace, apaga as linhas que sobraram abaixo (encolheu).
    if (block.length) {
      sh.getRange(BACKUP.DATA_START_ROW, 1, block.length, width).setValues(block);
    }
    if (doReplace && n > block.length) {
      sh.deleteRows(BACKUP.DATA_START_ROW + block.length, n - block.length);
    }
    // atualiza titulo (sync) e status
    try { sh.getRange(BACKUP.TITLE_ROW, 1).setValue("📦 " + def.tab + "  ·  PK: " + def.pk.join("+") + "  ·  sync: " + new Date().toISOString()); } catch (e) {}
    importWriteStatus_(ss, key, { rows: block.length, inserted: inserted, updated: updated, skipped: skipped, origem: doReplace ? "import-csv-replace" : "import-csv" });

    return { table: def.tab, csvRows: parsed.rows.length, inserted: inserted, updated: updated, skipped: skipped, removed: removed, replace: doReplace, totalNow: block.length, delimiter: parsed.delimiter };
  });
}

/* ---- helpers do importer (privados) ---- */

// Parser CSV/TSV robusto (RFC4180 + auto-deteccao de delimitador , ; \t).
// Lida com aspas, aspas duplicadas (""), e quebras de linha dentro de aspas.
function importParseCsv_(text) {
  var s = String(text == null ? "" : text).replace(/^﻿/, ""); // remove BOM
  if (s === "") return { header: [], rows: [], delimiter: "," };
  var delim = importSniffDelimiter_(s);

  var records = [];
  var field = "";
  var record = [];
  var inQuotes = false;
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      record.push(field); field = "";
    } else if (ch === "\n") {
      record.push(field); field = ""; records.push(record); record = [];
    } else if (ch === "\r") {
      // ignora; o \n cuida da quebra (CRLF). \r sozinho (raro) trata abaixo.
      if (s[i + 1] !== "\n") { record.push(field); field = ""; records.push(record); record = []; }
    } else { field += ch; }
  }
  // ultimo campo/record
  if (field !== "" || record.length) { record.push(field); records.push(record); }

  // remove records totalmente vazios (linhas em branco)
  records = records.filter(function (rec) { return rec.some(function (c) { return String(c).trim() !== ""; }); });
  if (!records.length) return { header: [], rows: [], delimiter: delim };

  var header = records[0].map(function (c) { return String(c == null ? "" : c).trim(); });
  return { header: header, rows: records.slice(1), delimiter: delim };
}

// Conta candidatos na 1a linha (fora de aspas) e escolhe o mais frequente.
function importSniffDelimiter_(s) {
  var firstLine = "";
  var inQ = false;
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (ch === '"') inQ = !inQ;
    else if ((ch === "\n" || ch === "\r") && !inQ) break;
    firstLine += ch;
  }
  var candidates = [",", "\t", ";"];
  var best = ",", bestN = -1;
  candidates.forEach(function (d) {
    var n = 0, q = false;
    for (var j = 0; j < firstLine.length; j++) {
      var c = firstLine[j];
      if (c === '"') q = !q;
      else if (c === d && !q) n++;
    }
    if (n > bestN) { bestN = n; best = d; }
  });
  return best;
}

// indice (0-based) de uma coluna no header do CSV, por nome normalizado.
function importHeaderIndex_(csvHeader, name) {
  var want = backupNormKey_(name);
  for (var i = 0; i < csvHeader.length; i++) {
    if (backupNormKey_(csvHeader[i]) === want) return i;
  }
  return -1;
}

function importPkKeyFromRow_(rowArr, pkIdx, sep) {
  var parts = [];
  for (var i = 0; i < pkIdx.length; i++) {
    if (pkIdx[i] < 0) return null;
    var v = backupNormVal_(rowArr[pkIdx[i]]);
    if (v === "") return null;
    parts.push(v);
  }
  return parts.join(sep == null ? "" : sep);
}

// __BACKUP_STATUS__: 1 linha por tabela (upsert por `tabela`).
function importStatusHeader_() { return ["tabela", "linhas_na_aba", "ultimo_import", "inseridas", "atualizadas", "puladas", "origem"]; }

function importEnsureStatusTab_(ss) {
  var sh = ss.getSheetByName(IMPORT.STATUS_TAB);
  if (!sh) sh = ss.insertSheet(IMPORT.STATUS_TAB);
  var header = backupReadHeader_(sh);
  if (!header.length) {
    backupWriteLayout_(sh, { tab: IMPORT.STATUS_TAB, pk: ["tabela"] }, importStatusHeader_());
  }
  return sh;
}

function importReadStatus_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(IMPORT.STATUS_TAB);
  var out = {};
  if (!sh) return out;
  var n = backupDataRowCount_(sh);
  if (n <= 0) return out;
  var header = backupReadHeader_(sh);
  var ti = backupColIndex_(header, "tabela") - 1;
  var ri = backupColIndex_(header, "linhas_na_aba") - 1;
  var wi = backupColIndex_(header, "ultimo_import") - 1;
  var oi = backupColIndex_(header, "origem") - 1;
  var vals = sh.getRange(BACKUP.DATA_START_ROW, 1, n, header.length).getValues();
  for (var r = 0; r < vals.length; r++) {
    var t = String(vals[r][ti] == null ? "" : vals[r][ti]).trim();
    if (!t) continue;
    out[t] = {
      rows: ri >= 0 ? Number(vals[r][ri] || 0) : 0,
      when: wi >= 0 ? String(vals[r][wi] == null ? "" : vals[r][wi]) : "",
      origem: oi >= 0 ? String(vals[r][oi] == null ? "" : vals[r][oi]) : ""
    };
  }
  return out;
}

function importWriteStatus_(ss, tableKey, info) {
  try {
    var sh = importEnsureStatusTab_(ss);
    var header = backupReadHeader_(sh);
    var n = backupDataRowCount_(sh);
    var ti = backupColIndex_(header, "tabela") - 1;
    var found = -1;
    if (n > 0) {
      var col = sh.getRange(BACKUP.DATA_START_ROW, ti + 1, n, 1).getValues();
      for (var r = 0; r < col.length; r++) {
        if (String(col[r][0] == null ? "" : col[r][0]).trim() === tableKey) { found = BACKUP.DATA_START_ROW + r; break; }
      }
    }
    var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "America/Sao_Paulo", "dd/MM/yyyy HH:mm");
    var row = [tableKey, info.rows, when, info.inserted, info.updated, info.skipped, info.origem];
    var target = found > 0 ? found : Math.max(Number(sh.getLastRow() || 0) + 1, BACKUP.DATA_START_ROW);
    sh.getRange(target, 1, 1, row.length).setValues([row]);
  } catch (e) { /* status e best-effort */ }
}

/* ===========================================================================
 * SIDEBAR DE IMPRESSAO — compositor por aba (colunas/ordem/filtros/sort).
 * Copia o sistema de impressao do projeto (print-composer/print-job), operando
 * sobre a aba ATIVA (header linha 2, dados linha 3+). Memoria por aba.
 * As funcoes chamadas pela sidebar via google.script.run NAO podem ter sufixo
 * "_" (privadas nao sao acessiveis); os helpers tem "_".
 * =========================================================================== */

var PRINT = { CFG_PREFIX: "printcfg::", MAX_FILTER_VALUES: 500 };

// Contexto da aba ativa: nome, header (linha 2), nº de linhas e config salva.
function printContext() {
  var sh = SpreadsheetApp.getActiveSheet();
  var header = backupReadHeader_(sh);
  var tab = sh.getName();
  return {
    tab: tab,
    header: header,
    rowCount: backupDataRowCount_(sh),
    // colunas que tem FK conhecida (a sidebar oferece "expandir" só nelas):
    fkColumns: header.filter(function (c) { return !!printFkRule_(tab, c); }),
    saved: printGetSaved_(tab)
  };
}

// Valores distintos de uma coluna na aba ativa (para o multiselect de filtro).
function printColumnValues(column) {
  var sh = SpreadsheetApp.getActiveSheet();
  var header = backupReadHeader_(sh);
  var idx = backupColIndex_(header, column);
  var out = [];
  if (idx < 1) return out;
  var n = backupDataRowCount_(sh);
  if (n <= 0) return out;
  var vals = sh.getRange(BACKUP.DATA_START_ROW, idx, n, 1).getDisplayValues();
  var seen = {};
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i][0] == null ? "" : vals[i][0]);
    if (v === "" || seen[v]) continue;
    seen[v] = true;
    out.push(v);
    if (out.length >= PRINT.MAX_FILTER_VALUES) break;
  }
  out.sort(function (a, b) { return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }); });
  return out;
}

// Salva a config de impressao da aba ativa (memoria por aba).
function printSaveConfig(config) {
  var sh = SpreadsheetApp.getActiveSheet();
  printPutSaved_(sh.getName(), config);
  return { ok: true, tab: sh.getName() };
}

// Monta o HTML de impressao da aba ativa e abre num modal com botao Imprimir.
function printRun(config) {
  var sh = SpreadsheetApp.getActiveSheet();
  printPutSaved_(sh.getName(), config); // memoriza ao imprimir
  var html = printBuildHtml_(sh, config);
  var out = HtmlService.createHtmlOutput(html).setWidth(920).setHeight(680);
  SpreadsheetApp.getUi().showModalDialog(out, (config && config.title) ? String(config.title) : ("Impressao — " + sh.getName()));
  return { ok: true };
}

/* ---- helpers (privados) ---- */

function printCfgKey_(tab) { return PRINT.CFG_PREFIX + tab; }

function printGetSaved_(tab) {
  try {
    var raw = PropertiesService.getDocumentProperties().getProperty(printCfgKey_(tab));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function printPutSaved_(tab, config) {
  try {
    PropertiesService.getDocumentProperties().setProperty(printCfgKey_(tab), JSON.stringify(config || {}));
  } catch (e) { /* best-effort */ }
}

// Le os dados da aba como array de objetos {coluna: valorExibido}.
function printReadRows_(sh, header) {
  var n = backupDataRowCount_(sh);
  if (n <= 0) return [];
  var width = Math.max(header.length, 1);
  var values = sh.getRange(BACKUP.DATA_START_ROW, 1, n, width).getDisplayValues();
  var rows = [];
  for (var r = 0; r < values.length; r++) {
    var obj = {};
    for (var c = 0; c < header.length; c++) obj[header[c]] = values[r][c] == null ? "" : String(values[r][c]);
    rows.push(obj);
  }
  return rows;
}

// filtros: { coluna: [valores aceitos] } (vazio/ausente = sem filtro na coluna)
function printApplyFilters_(rows, filters) {
  if (!filters) return rows;
  var cols = Object.keys(filters).filter(function (c) { return (filters[c] || []).length > 0; });
  if (cols.length === 0) return rows;
  return rows.filter(function (row) {
    for (var i = 0; i < cols.length; i++) {
      if (filters[cols[i]].indexOf(String(row[cols[i]] == null ? "" : row[cols[i]])) < 0) return false;
    }
    return true;
  });
}

// sortRules: [{column, direction:'asc'|'desc'}] — numerico quando possivel, senao locale.
function printApplySort_(rows, sortRules) {
  if (!sortRules || !sortRules.length) return rows;
  var copy = rows.slice();
  copy.sort(function (a, b) {
    for (var i = 0; i < sortRules.length; i++) {
      var col = sortRules[i].column;
      var dir = sortRules[i].direction === "desc" ? -1 : 1;
      var av = String(a[col] == null ? "" : a[col]);
      var bv = String(b[col] == null ? "" : b[col]);
      var an = parseFloat(av.replace(",", ".")), bn = parseFloat(bv.replace(",", "."));
      var cmp;
      if (!isNaN(an) && !isNaN(bn) && av !== "" && bv !== "") cmp = an - bn;
      else cmp = av.localeCompare(bv, "pt-BR", { numeric: true, sensitivity: "base" });
      if (cmp !== 0) return cmp * dir;
    }
    return 0;
  });
  return copy;
}

function printEscape_(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// "Humaniza" o nome da coluna p/ rotulo (estado_venda -> Estado Venda).
function printLabel_(c) {
  return String(c == null ? "" : c).replace(/_/g, " ").replace(/\b\w/g, function (m) { return m.toUpperCase(); });
}

// Heuristica p/ alinhar numeros a direita.
function printIsNumeric_(v) {
  var s = String(v == null ? "" : v).trim();
  return s !== "" && /\d/.test(s) && /^-?[\d.,]+%?$/.test(s);
}

// Monta o documento de impressao (mesma ideia do print-job.ts do projeto),
// com expansao opcional de FK (config.expand = [colunas]).
function printBuildHtml_(sh, config) {
  config = config || {};
  var tab = sh.getName();
  var ss = sh.getParent();
  var header = backupReadHeader_(sh);
  var cols = (config.columns && config.columns.length ? config.columns : header)
    .filter(function (c) { return backupColIndex_(header, c) >= 1; });
  if (!cols.length) cols = header.slice();

  var rows = printReadRows_(sh, header);
  rows = printApplyFilters_(rows, config.filters);
  rows = printApplySort_(rows, config.sortRules);

  var expand = {};
  (config.expand || []).forEach(function (c) { expand[c] = true; });
  var caches = {};

  var title = printEscape_(config.title || tab);
  var sub = printEscape_(
    "Aba " + tab + " · " + rows.length + " registro(s) · " + cols.length + " coluna(s) · " +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "America/Sao_Paulo", "dd/MM/yyyy HH:mm")
  );

  var th = cols.map(function (c) {
    var fk = expand[c] && printFkRule_(tab, c) ? ' <span class="fk">⮕</span>' : "";
    return "<th>" + printEscape_(printLabel_(c)) + fk + "</th>";
  }).join("");

  var body = rows.map(function (row) {
    return "<tr>" + cols.map(function (c) {
      var val = (expand[c] && printFkRule_(tab, c)) ? printResolveFk_(ss, caches, tab, c, row[c]) : row[c];
      return "<td" + (printIsNumeric_(val) ? ' class="num"' : "") + ">" + printEscape_(val) + "</td>";
    }).join("") + "</tr>";
  }).join("");

  var css = [
    "*{box-sizing:border-box}",
    "body{font-family:'Segoe UI',Roboto,Arial,sans-serif;margin:0;padding:24px;color:#1f2328;background:#fff}",
    ".toolbar{position:sticky;top:0;z-index:5;display:flex;gap:8px;background:#fff;padding:0 0 12px}",
    ".toolbar button{font:inherit;padding:7px 14px;border-radius:6px;border:1px solid #1a73e8;background:#1a73e8;color:#fff;cursor:pointer}",
    ".toolbar button.ghost{background:#fff;color:#1a73e8}",
    "header.doc{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #1a73e8;padding-bottom:8px;margin-bottom:14px}",
    "header.doc h1{font-size:20px;margin:0;font-weight:700;letter-spacing:-.2px}",
    "header.doc .sub{color:#6b7280;font-size:11px;text-align:right}",
    "table{border-collapse:collapse;width:100%;font-size:11.5px}",
    "thead th{background:#1a73e8;color:#fff;font-weight:600;text-align:left;padding:6px 8px;border:1px solid #1558b0;white-space:nowrap}",
    "thead th .fk{opacity:.7;font-weight:400}",
    "tbody td{border:1px solid #e5e7eb;padding:4px 8px;vertical-align:top;word-break:break-word}",
    "tbody td.num{text-align:right;font-variant-numeric:tabular-nums}",
    "tbody tr:nth-child(even) td{background:#f6f8fc}",
    "footer.doc{margin-top:12px;color:#9aa0a6;font-size:10px;text-align:right}",
    "@media print{.toolbar{display:none}body{padding:0}@page{margin:12mm}}"
  ].join("");

  return "" +
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + title + "</title><style>" + css + "</style></head><body>" +
    '<div class="toolbar"><button onclick="window.print()">🖨️ Imprimir</button>' +
    '<button class="ghost" onclick="google.script.host.close()">Fechar</button></div>' +
    '<header class="doc"><h1>' + title + '</h1><div class="sub">' + sub + "</div></header>" +
    "<table><thead><tr>" + th + "</tr></thead><tbody>" + body + "</tbody></table>" +
    '<footer class="doc">rn-gestor · backup</footer>' +
    "</body></html>";
}

/* ---- FK: resolucao de chave estrangeira p/ valor legivel (cross-aba) ---- */

// Resolve o valor bruto de uma coluna FK para o valor de exibicao (ex.: id->placa).
function printResolveFk_(ss, caches, tab, col, raw) {
  var key = String(raw == null ? "" : raw).trim();
  if (key === "") return raw;
  var rule = printFkRule_(tab, col);
  if (!rule) return raw;
  var disp;
  if (rule.domain) {
    disp = printLookupsCache_(ss, caches)[rule.domain + "" + key];
  } else {
    disp = printRefCache_(ss, caches, rule.refTab, rule.by, rule.display)[key];
  }
  return (disp == null || disp === "") ? raw : disp;
}

// Cache (memoizado) de uma aba de referencia: matchValue -> displayValue.
function printRefCache_(ss, caches, refTab, byCol, displayCol) {
  var ck = "ref::" + refTab + "::" + byCol + "::" + displayCol;
  if (caches[ck]) return caches[ck];
  var map = {};
  var sh = ss.getSheetByName(refTab);
  if (sh) {
    var header = backupReadHeader_(sh);
    var bi = backupColIndex_(header, byCol), di = backupColIndex_(header, displayCol);
    var n = backupDataRowCount_(sh);
    if (bi >= 1 && di >= 1 && n > 0) {
      var vals = sh.getRange(BACKUP.DATA_START_ROW, 1, n, header.length).getDisplayValues();
      for (var r = 0; r < vals.length; r++) {
        var k = String(vals[r][bi - 1] == null ? "" : vals[r][bi - 1]).trim();
        if (k !== "" && !(k in map)) map[k] = String(vals[r][di - 1] == null ? "" : vals[r][di - 1]);
      }
    }
  }
  caches[ck] = map;
  return map;
}

// Cache da aba `lookups` (PK composta): "domaincode" -> name.
function printLookupsCache_(ss, caches) {
  if (caches.__lookups) return caches.__lookups;
  var map = {};
  var sh = ss.getSheetByName("lookups");
  if (sh) {
    var header = backupReadHeader_(sh);
    var di = backupColIndex_(header, "domain"), ci = backupColIndex_(header, "code"), ni = backupColIndex_(header, "name");
    var n = backupDataRowCount_(sh);
    if (di >= 1 && ci >= 1 && ni >= 1 && n > 0) {
      var vals = sh.getRange(BACKUP.DATA_START_ROW, 1, n, header.length).getDisplayValues();
      for (var r = 0; r < vals.length; r++) {
        var k = String(vals[r][di - 1] == null ? "" : vals[r][di - 1]).trim() + "" +
                String(vals[r][ci - 1] == null ? "" : vals[r][ci - 1]).trim();
        map[k] = String(vals[r][ni - 1] == null ? "" : vals[r][ni - 1]);
      }
    }
  }
  caches.__lookups = map;
  return map;
}

// Mapa de FK "tab::coluna" -> regra. domain => resolve na aba `lookups` (PK composta).
var _PRINT_FK = null;
function printFkMap_() {
  if (_PRINT_FK) return _PRINT_FK;
  var carro = { refTab: "carros", by: "id", display: "placa" };
  var modelo = { refTab: "modelos", by: "id", display: "modelo" };
  var userById = { refTab: "usuarios_acesso", by: "id", display: "nome" };
  var userByAuth = { refTab: "usuarios_acesso", by: "auth_user_id", display: "nome" };
  var pasta = { refTab: "arquivos_pastas", by: "id", display: "nome" };
  _PRINT_FK = {
    "anuncios::carro_id": carro,
    "anuncios::estado_anuncio": { refTab: "lookup_announcement_statuses", by: "code", display: "name" },
    "anuncios_insight_verifications::verified_by": userById,
    "arquivo_automacao_config::repository_folder_id": pasta,
    "arquivo_automacao_config::updated_by": userById,
    "arquivo_automacao_folders::carro_id": carro,
    "arquivo_automacao_folders::folder_id": pasta,
    "arquivos_arquivos::pasta_id": pasta,
    "arquivos_arquivos::uploaded_by": userById,
    "arquivos_pastas::created_by": userById,
    "arquivos_pastas::updated_by": userById,
    "arquivos_pastas::parent_folder_id": pasta,
    "carro_caracteristicas_tecnicas::carro_id": carro,
    "carro_caracteristicas_tecnicas::caracteristica_id": { refTab: "caracteristicas_tecnicas", by: "id", display: "caracteristica" },
    "carro_caracteristicas_visuais::carro_id": carro,
    "carro_caracteristicas_visuais::caracteristica_id": { refTab: "caracteristicas_visuais", by: "id", display: "caracteristica" },
    "carros::modelo_id": modelo,
    "carros::local": { refTab: "lookup_locations", by: "code", display: "name" },
    "carros::estado_venda": { refTab: "lookup_sale_statuses", by: "code", display: "name" },
    "carros::estado_anuncio": { refTab: "lookup_announcement_statuses", by: "code", display: "name" },
    "carros::estado_veiculo": { refTab: "lookup_vehicle_states", by: "code", display: "name" },
    "controle_envelopes::carro_id": carro,
    "controle_envelopes::usuario_auth_user_id": userByAuth,
    "documento_templates::created_by_user_id": userByAuth,
    "documento_templates::updated_by_user_id": userByAuth,
    "documentos::carro_id": carro,
    "documentos::remetente_id": { refTab: "remetentes", by: "id", display: "nome" },
    "documentos::envelope": { domain: "estados_envelope" },
    "documentos::pericia": { domain: "estados_pericia" },
    "documentos::chave_reserva": { domain: "estados_chave_reserva" },
    "documentos::estado_transferencia": { domain: "estados_transferencia" },
    "documentos::recibo_compra": { domain: "estados_recibo_compra" },
    "documentos::origem": { domain: "origens_veiculo" },
    "documentos::proposito": { domain: "propositos" },
    "documentos::tipo_de_processo": { domain: "tipos_processo" },
    "grupos_repetidos::modelo_id": modelo,
    "observacoes::carro_id": carro,
    "observacoes::autor_auth_user_id": userByAuth,
    "price_change_contexts::created_by": userById,
    "print_templates::user_id": userByAuth,
    "repetidos::carro_id": carro,
    "usuarios_acesso::cargo": { refTab: "lookup_user_roles", by: "code", display: "name" },
    "usuarios_acesso::status": { refTab: "lookup_user_statuses", by: "code", display: "name" },
    "venda_documentos::carro_id": carro,
    "venda_documentos::created_by_user_id": userByAuth,
    "venda_documentos::template_id": { refTab: "documento_templates", by: "id", display: "titulo" },
    "venda_entradas::carro_troca_id": carro,
    "vendas::carro_id": carro,
    "vendas::canal_cliente": { domain: "canais_cliente" },
    "vendas::vendedor_auth_user_id": userByAuth,
    "vendas::created_by_user_id": userByAuth
  };
  return _PRINT_FK;
}

function printFkRule_(tab, col) {
  return printFkMap_()[tab + "::" + col] || null;
}

/* ===========================================================================
 * GRID MANUAL (CRUD + FKs) + RASTREIO DE ALTERACOES MANUAIS + GERADOR DE SQL
 * -----------------------------------------------------------------------------
 * Backup REVERSO (Sheets -> Supabase). O grid opera sobre as MESMAS abas do
 * backup, mas TODA alteracao feita aqui (ou por edicao direta de celula, via o
 * gatilho onEdit installable) e lastreada na aba __MANUAL_CHANGES__ — separada
 * do backup vindo do Supabase (__LOG__). Depois, um botao gera o SQL que aplica
 * essas alteracoes no banco (net por PK: 3 deletes em CARROS = 3 DELETEs, etc.).
 * =========================================================================== */

var MANUAL = {
  TAB: "__MANUAL_CHANGES__",
  HEADER: ["seq", "ts", "tabela", "op", "pk", "dados_json", "origem", "incluido_no_sql"],
  PAGE_SIZE: 100
};

/** FKs por tabela -> col: { table, pk, label }. So o que vale expandir/escolher. */
var _BACKUP_FKS = null;
function backupFks_() {
  if (_BACKUP_FKS) return _BACKUP_FKS;
  var C = { table: "carros", pk: "id", label: "placa" };
  _BACKUP_FKS = {
    anuncios: { carro_id: C },
    arquivo_automacao_folders: { carro_id: C },
    arquivos_arquivos: { pasta_id: { table: "arquivos_pastas", pk: "id", label: "nome" } },
    arquivos_pastas: { parent_folder_id: { table: "arquivos_pastas", pk: "id", label: "nome" } },
    carro_caracteristicas_tecnicas: { carro_id: C, caracteristica_id: { table: "caracteristicas_tecnicas", pk: "id", label: "caracteristica" } },
    carro_caracteristicas_visuais: { carro_id: C, caracteristica_id: { table: "caracteristicas_visuais", pk: "id", label: "caracteristica" } },
    carros: { modelo_id: { table: "modelos", pk: "id", label: "modelo" }, fotos_pasta_id: { table: "arquivos_pastas", pk: "id", label: "nome" }, foto_capa_id: { table: "arquivos_arquivos", pk: "id", label: "nome_arquivo" } },
    controle_envelopes: { carro_id: C },
    documentos: { carro_id: C, remetente_id: { table: "remetentes", pk: "id", label: "nome" } },
    grupos_repetidos: { modelo_id: { table: "modelos", pk: "id", label: "modelo" } },
    observacoes: { carro_id: C },
    repetidos: { carro_id: C, grupo_id: { table: "grupos_repetidos", pk: "grupo_id", label: "grupo_id" } },
    venda_documentos: { venda_id: { table: "vendas", pk: "id", label: "id" }, carro_id: C, template_id: { table: "documento_templates", pk: "id", label: "titulo" } },
    venda_entradas: { venda_id: { table: "vendas", pk: "id", label: "id" }, carro_troca_id: C },
    vendas: { carro_id: C }
  };
  return _BACKUP_FKS;
}

/* ---------- Contexto do grid (chamado pela sidebar) ---------- */
function gridContext() {
  var reg = backupRegistry_();
  var ss = SpreadsheetApp.getActive();
  var activeTab = "";
  try { activeTab = ss.getActiveSheet().getName(); } catch (e) {}
  var tables = Object.keys(reg).sort().map(function (k) {
    var sh = ss.getSheetByName(reg[k].tab);
    return { key: k, pk: reg[k].pk, rows: sh ? backupDataRowCount_(sh) : 0, hasSheet: !!sh };
  });
  return {
    tables: tables,
    active: reg[activeTab] ? activeTab : "",
    manualPending: manualPendingCount_()
  };
}

/** Le uma pagina da aba (com header) + mapas de expansao das FKs + ordem salva. */
function gridReadPage(tableKey, offset, limit) {
  var reg = backupRegistry_();
  var def = reg[tableKey];
  if (!def) throw new Error("Tabela desconhecida: " + tableKey);
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(def.tab);
  var fks = backupFks_()[tableKey] || {};
  if (!sh) {
    return { header: def.cols.slice(), rows: [], total: 0, pk: def.pk, fks: fks, expand: {}, order: gridGetColumnOrder(tableKey) };
  }
  var header = backupReadHeader_(sh);
  if (!header.length) header = def.cols.slice();
  var total = backupDataRowCount_(sh);
  offset = Math.max(0, Number(offset) || 0);
  limit = Math.min(MANUAL.PAGE_SIZE, Math.max(1, Number(limit) || MANUAL.PAGE_SIZE));
  var rows = [];
  if (total > 0 && offset < total) {
    var n = Math.min(limit, total - offset);
    var block = sh.getRange(BACKUP.DATA_START_ROW + offset, 1, n, header.length).getValues();
    for (var r = 0; r < block.length; r++) {
      var arr = [];
      for (var c = 0; c < header.length; c++) arr.push(backupCellOut_(block[r][c]));
      rows.push(arr);
    }
  }
  var expand = {};
  Object.keys(fks).forEach(function (col) { expand[col] = gridFkLabelMap_(ss, fks[col]); });
  return { header: header, rows: rows, total: total, pk: def.pk, fks: fks, expand: expand, order: gridGetColumnOrder(tableKey) };
}

/** Opcoes (id + label) de uma coluna FK, p/ o dropdown do formulario. */
function gridFkOptions(tableKey, column) {
  var fk = (backupFks_()[tableKey] || {})[column];
  if (!fk) return [];
  var map = gridFkLabelMap_(SpreadsheetApp.getActive(), fk);
  return Object.keys(map).map(function (id) { return { id: id, label: map[id] }; })
    .sort(function (a, b) { return String(a.label).localeCompare(String(b.label)); })
    .slice(0, 3000);
}

/** Insert OU update (por PK) + lastro manual. */
function gridSaveRecord(tableKey, rowObj) {
  var reg = backupRegistry_();
  var def = reg[tableKey];
  if (!def) throw new Error("Tabela desconhecida: " + tableKey);
  var pkValues = backupPkValues_(def, rowObj);
  if (!pkValues) throw new Error("Preencha a PK (" + def.pk.join(", ") + ").");
  return backupWithLock_(function () {
    var ss = SpreadsheetApp.getActive();
    var sh = backupGetOrCreateTab_(ss, def.tab);
    var header = backupEnsureHeader_(sh, def);
    var located = backupFindRow_(sh, header, def, pkValues);
    var isUpdate = located.rowIndex > 0;
    backupUpsert_(sh, header, def, rowObj, located);
    manualLogChange_(tableKey, isUpdate ? "UPDATE" : "INSERT", pkValues, rowObj, "grid");
    return { table: tableKey, op: isUpdate ? "UPDATE" : "INSERT", pk: pkValues.join("+") };
  });
}

/** Delete por PK + lastro manual (guarda o snapshot anterior). */
function gridDeleteRecord(tableKey, pkArr) {
  var reg = backupRegistry_();
  var def = reg[tableKey];
  if (!def) throw new Error("Tabela desconhecida: " + tableKey);
  if (!pkArr || pkArr.length !== def.pk.length) throw new Error("PK invalida p/ " + tableKey + ".");
  return backupWithLock_(function () {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(def.tab);
    if (!sh) throw new Error("Aba nao existe: " + def.tab);
    var header = backupReadHeader_(sh);
    var located = backupFindRow_(sh, header, def, pkArr);
    if (located.rowIndex <= 0) throw new Error("Registro nao encontrado.");
    var before = backupRowObject_(header, located.values);
    backupDeleteAt_(sh, located, def, pkArr);
    manualLogChange_(tableKey, "DELETE", pkArr, before, "grid");
    return { table: tableKey, op: "DELETE", pk: pkArr.join("+") };
  });
}

/* ---------- Ordem das colunas (preferencia de visualizacao, por tabela) ---------- */
function gridGetColumnOrder(tableKey) {
  var p = PropertiesService.getDocumentProperties().getProperty("gridorder::" + tableKey);
  if (!p) return null;
  try { return JSON.parse(p); } catch (e) { return null; }
}
function gridSaveColumnOrder(tableKey, order) {
  PropertiesService.getDocumentProperties().setProperty("gridorder::" + tableKey, JSON.stringify(order || []));
  return { ok: true };
}

/* ---------- FK label map (le a aba destino 1x) ---------- */
function gridFkLabelMap_(ss, fk) {
  var def = backupRegistry_()[fk.table];
  if (!def) return {};
  var sh = ss.getSheetByName(def.tab);
  if (!sh) return {};
  var n = backupDataRowCount_(sh);
  if (n <= 0) return {};
  var header = backupReadHeader_(sh);
  var pkCol = backupColIndex_(header, fk.pk);
  var lblCol = backupColIndex_(header, fk.label);
  if (pkCol < 1) return {};
  var width = Math.max(pkCol, lblCol > 0 ? lblCol : pkCol);
  var block = sh.getRange(BACKUP.DATA_START_ROW, 1, n, width).getValues();
  var map = {};
  for (var r = 0; r < block.length; r++) {
    var id = backupNormVal_(block[r][pkCol - 1]);
    if (!id) continue;
    map[id] = lblCol > 0 ? String(block[r][lblCol - 1] || "") : id;
  }
  return map;
}

/* ---------- Aba de rastreio __MANUAL_CHANGES__ ---------- */
function manualEnsureTab_(ss) {
  var sh = ss.getSheetByName(MANUAL.TAB);
  if (!sh) sh = ss.insertSheet(MANUAL.TAB);
  if (!backupReadHeader_(sh).length) {
    backupWriteLayout_(sh, { tab: MANUAL.TAB, pk: ["seq"] }, MANUAL.HEADER);
  }
  return sh;
}

function manualLogChange_(tableKey, op, pkValues, rowObj, origem) {
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = manualEnsureTab_(ss);
    var seq = manualNextSeq_(sh);
    var row = [seq, new Date().toISOString(), tableKey, op, (pkValues || []).join("+"),
      JSON.stringify(rowObj || {}), origem || "grid", ""];
    var target = Math.max(Number(sh.getLastRow() || 0) + 1, BACKUP.DATA_START_ROW);
    sh.getRange(target, 1, 1, row.length).setValues([row]);
  } catch (e) { /* best-effort: nunca derruba a operacao principal */ }
}

function manualNextSeq_(sh) {
  var n = backupDataRowCount_(sh);
  if (n <= 0) return 1;
  var last = Number(sh.getRange(BACKUP.DATA_START_ROW + n - 1, 1).getValue());
  return (isFinite(last) ? last : n) + 1;
}

function manualReadAll_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(MANUAL.TAB);
  if (!sh) return [];
  var n = backupDataRowCount_(sh);
  if (n <= 0) return [];
  var header = backupReadHeader_(sh);
  var idx = {};
  MANUAL.HEADER.forEach(function (h) { idx[h] = backupColIndex_(header, h) - 1; });
  var block = sh.getRange(BACKUP.DATA_START_ROW, 1, n, header.length).getValues();
  var out = [];
  for (var r = 0; r < block.length; r++) {
    var row = block[r];
    var dados = {};
    try { dados = JSON.parse(row[idx.dados_json] || "{}"); } catch (e) { dados = {}; }
    out.push({
      seq: row[idx.seq], ts: String(row[idx.ts] || ""),
      tabela: String(row[idx.tabela] || ""), op: String(row[idx.op] || "").toUpperCase(),
      pk: String(row[idx.pk] || ""), dados: dados,
      origem: String(row[idx.origem] || ""),
      incluido: String(row[idx.incluido_no_sql] || "").trim() !== ""
    });
  }
  return out;
}

function manualPendingCount_() {
  try {
    var all = manualReadAll_(), c = 0;
    for (var i = 0; i < all.length; i++) if (!all[i].incluido) c++;
    return c;
  } catch (e) { return 0; }
}

/** Marca as pendentes como incluidas (chamado depois de copiar/aplicar o SQL). */
function manualMarkIncluded() {
  return backupWithLock_(function () {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(MANUAL.TAB);
    if (!sh) return { marked: 0 };
    var n = backupDataRowCount_(sh);
    if (n <= 0) return { marked: 0 };
    var col = backupColIndex_(backupReadHeader_(sh), "incluido_no_sql");
    if (col < 1) return { marked: 0 };
    var range = sh.getRange(BACKUP.DATA_START_ROW, col, n, 1);
    var vals = range.getValues();
    var marked = 0, stamp = new Date().toISOString();
    for (var r = 0; r < vals.length; r++) {
      if (String(vals[r][0] || "").trim() === "") { vals[r][0] = stamp; marked++; }
    }
    if (marked) range.setValues(vals);
    return { marked: marked };
  });
}

/* ---------- Gatilho onEdit (installable): edicoes DIRETAS de celula ---------- */
function backupOnEditManual(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    var tabName = sh.getName();
    if (tabName.indexOf("__") === 0) return; // ignora abas de controle
    var reg = backupRegistry_();
    var def = null, tableKey = "";
    var keys = Object.keys(reg);
    for (var i = 0; i < keys.length; i++) {
      if (reg[keys[i]].tab === tabName) { def = reg[keys[i]]; tableKey = keys[i]; break; }
    }
    if (!def) return; // aba fora do registry
    var rowIdx = e.range.getRow();
    if (rowIdx < BACKUP.DATA_START_ROW) return; // titulo/header
    var header = backupReadHeader_(sh);
    if (!header.length) return;
    var values = sh.getRange(rowIdx, 1, 1, header.length).getValues()[0];
    var rowObj = backupRowObject_(header, values);
    var pkValues = backupPkValues_(def, rowObj);
    if (!pkValues) return; // linha ainda sem PK -> nao rastreia
    manualLogChange_(tableKey, "UPDATE", pkValues, rowObj, "edicao_direta");
  } catch (err) { /* trigger nunca lanca */ }
}

/* ---------- Gerador de SQL (backup reverso) ---------- */
function manualSqlContext() {
  var all = manualReadAll_();
  var pending = all.filter(function (c) { return !c.incluido; });
  var summary = {};
  pending.forEach(function (c) {
    if (!summary[c.tabela]) summary[c.tabela] = { INSERT: 0, UPDATE: 0, DELETE: 0 };
    summary[c.tabela][c.op] = (summary[c.tabela][c.op] || 0) + 1;
  });
  return { pending: pending.length, total: all.length, summary: summary };
}

/**
 * Gera o SQL "na forca bruta". NET por (tabela, pk): a ultima operacao vence.
 * DELETE final -> DELETE; caso contrario -> UPSERT (INSERT ON CONFLICT DO UPDATE)
 * com o ultimo snapshot conhecido. Ex.: 3 deletes em CARROS -> 3 DELETEs.
 */
function manualGenerateSql(includeApplied) {
  var all = manualReadAll_();
  var use = includeApplied ? all : all.filter(function (c) { return !c.incluido; });
  var net = {}, order = [];
  use.forEach(function (c) {
    var key = c.tabela + "" + c.pk;
    if (!net[key]) { net[key] = { tabela: c.tabela, pk: c.pk, op: null, dados: null }; order.push(key); }
    net[key].op = (c.op === "DELETE") ? "DELETE" : "UPSERT";
    net[key].dados = c.dados;
  });
  var reg = backupRegistry_();
  var byTable = {};
  order.forEach(function (key) {
    var n = net[key], def = reg[n.tabela];
    if (!def) return;
    if (!byTable[n.tabela]) byTable[n.tabela] = [];
    byTable[n.tabela].push(n.op === "DELETE" ? sqlDelete_(def, n) : sqlUpsert_(def, n));
  });
  var out = ["-- Backup reverso (Sheets -> Supabase) · " + new Date().toISOString(),
    "-- " + use.length + " alteracao(oes) manual(is) -> " + order.length + " statement(s) (net por PK).",
    "-- Revise antes de rodar no Supabase. Literais sao quotados (o Postgres faz o cast).",
    "BEGIN;"];
  Object.keys(byTable).sort().forEach(function (t) {
    out.push("");
    out.push("-- ===== " + t + " (" + byTable[t].length + ") =====");
    byTable[t].forEach(function (s) { out.push(s); });
  });
  out.push("");
  out.push("COMMIT;");
  return { sql: out.join("\n"), statements: order.length, changes: use.length };
}

function sqlUpsert_(def, net) {
  var data = net.dados || {};
  // Só inclui colunas com valor (vazio -> omite, p/ deixar o default/trigger do
  // banco agir e evitar quebrar NOT NULL em INSERT de registro novo).
  var cols = [], vals = [], updates = [];
  def.cols.forEach(function (col) {
    if (!Object.prototype.hasOwnProperty.call(data, col)) return;
    if (sqlIsEmpty_(data[col])) return;
    cols.push(sqlIdent_(col));
    vals.push(sqlLiteral_(data[col]));
    if (def.pk.indexOf(col) < 0) updates.push(sqlIdent_(col) + " = EXCLUDED." + sqlIdent_(col));
  });
  if (!cols.length) return "-- (sem colunas p/ " + def.tab + " pk=" + net.pk + ")";
  var s = "INSERT INTO public." + sqlIdent_(def.tab) + " (" + cols.join(", ") + ")\n" +
    "  VALUES (" + vals.join(", ") + ")\n" +
    "  ON CONFLICT (" + def.pk.map(sqlIdent_).join(", ") + ") DO ";
  s += updates.length ? ("UPDATE SET " + updates.join(", ") + ";") : "NOTHING;";
  return s;
}

function sqlDelete_(def, net) {
  var data = net.dados || {};
  var parts = String(net.pk).split("+"), conds = [];
  for (var i = 0; i < def.pk.length; i++) {
    var col = def.pk[i];
    var v = Object.prototype.hasOwnProperty.call(data, col) ? data[col] : parts[i];
    conds.push(sqlIdent_(col) + " = " + sqlLiteral_(v));
  }
  return "DELETE FROM public." + sqlIdent_(def.tab) + " WHERE " + conds.join(" AND ") + ";";
}

function sqlIdent_(name) { return '"' + String(name).replace(/"/g, '""') + '"'; }

function sqlIsEmpty_(v) {
  if (v === null || v === undefined) return true;
  return (typeof v !== "object") && String(v) === "";
}

/** Literal "forca bruta": tudo vira STRING quotada (o Postgres casta o literal
 *  'unknown' p/ o tipo da coluna: '123'->int, 'true'->bool, uuid, timestamptz,
 *  jsonb...). Vazio -> NULL. Isso evita o erro int->text de "numero cru". */
function sqlLiteral_(v) {
  if (sqlIsEmpty_(v)) return "NULL";
  var s = (typeof v === "object") ? JSON.stringify(v) : String(v);
  return "'" + s.replace(/'/g, "''") + "'";
}

/** Valor de celula -> string p/ o cliente (Date -> ISO). */
function backupCellOut_(v) {
  if (v === null || v === undefined) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") return v.toISOString();
  return String(v);
}
