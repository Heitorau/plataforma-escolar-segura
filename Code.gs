/**
 * Plataforma Escolar Segura - Google Apps Script backend/API
 * Segurança aplicada:
 * - Nenhum ID de planilha no frontend.
 * - Frontend chama somente esta API.
 * - ID da planilha e pepper ficam em Script Properties.
 * - Controle de perfil, validação por allowlist, logs e exclusão lógica.
 * - Dashboard público retorna apenas dados agregados.
 *
 * Como instalar:
 * 1. Apps Script > cole este arquivo.
 * 2. Execute setup() uma vez e autorize.
 * 3. Implante como Web App: Executar como "Eu"; acesso "Qualquer pessoa".
 * 4. Copie a URL /exec para API_URL no app.js.
 */

const APP_VERSION = "1.0.0";
const SHEETS = {
  SETTINGS: "SETTINGS",
  USERS: "USERS",
  ROLES: "ROLES",
  CLASSES: "CLASSES",
  LOOKUPS: "LOOKUPS",
  SUPPORT_MOCK: "SUPPORT_MOCK",
  PUBLIC_CACHE: "PUBLIC_CACHE",
  AUDIT_LOG: "AUDIT_LOG"
};

const HEADERS = {
  SETTINGS: ["chave", "valor", "descricao", "data_atualizacao"],
  USERS: ["id_usuario", "username", "display_name", "role", "salt", "password_hash", "ativo", "data_cadastro", "data_atualizacao"],
  ROLES: ["role", "descricao", "permissoes", "ativo"],
  CLASSES: ["id_turma", "segmento", "serie", "turma", "ativo", "data_cadastro", "data_atualizacao"],
  LOOKUPS: ["id_lookup", "tipo", "valor", "ativo", "data_cadastro", "data_atualizacao"],
  SUPPORT_MOCK: [
    "id_registro", "segmento", "serie", "turma", "categoria_suporte", "nivel_suporte",
    "necessita_auxiliar", "necessita_prova_adaptada", "necessita_adaptacao_curricular",
    "necessita_adaptacao_mecanica", "possui_documentacao", "status_acompanhamento",
    "ativo", "data_cadastro", "data_atualizacao"
  ],
  PUBLIC_CACHE: ["cache_key", "json", "updated_at"],
  AUDIT_LOG: ["id_log", "timestamp", "username", "role", "action", "entity", "entity_id", "ip_hash", "details"]
};

const ALLOWED = {
  categoria_suporte: ["Atenção", "Comunicação", "Aprendizagem", "Mobilidade", "Comportamento", "Altas habilidades", "Outro"],
  nivel_suporte: ["Baixo", "Médio", "Alto"],
  status_acompanhamento: ["Em análise", "Ativo", "Revisar", "Encerrado"],
  boolText: ["Sim", "Não"],
  roles: ["coordenador", "professor", "visualizador"],
  lookupTypes: ["categoria_suporte", "nivel_suporte", "status_acompanhamento"]
};

const PERMISSIONS = {
  coordenador: ["createClass", "createUser", "createLookup", "createRecord", "listRecords", "deleteRecord", "refreshCache"],
  professor: ["createRecord", "listRecords"],
  visualizador: ["listRecords"]
};

function setup() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty("SPREADSHEET_ID");
  let ss;
  if (spreadsheetId) {
    ss = SpreadsheetApp.openById(spreadsheetId);
  } else {
    ss = SpreadsheetApp.create("Plataforma Escolar Segura - Banco Fictício");
    props.setProperty("SPREADSHEET_ID", ss.getId());
  }
  if (!props.getProperty("AUTH_PEPPER")) props.setProperty("AUTH_PEPPER", Utilities.getUuid() + Utilities.getUuid());

  Object.keys(SHEETS).forEach(key => ensureSheet_(ss, SHEETS[key], HEADERS[key]));
  seedRoles_();
  seedLookups_();
  seedClasses_();
  seedAdminUser_();
  seedMockRecords_();
  refreshPublicCache_();
  setSetting_("app_version", APP_VERSION, "Versão do backend");
  setSetting_("privacy_notice", "USAR SOMENTE DADOS FICTÍCIOS", "Aviso de privacidade obrigatório");
  return "Setup concluído. Usuário inicial: coord_demo / Demo@12345. Planilha: " + ss.getUrl();
}

function doGet(e) {
  const callback = safeCallback_(e && e.parameter && e.parameter.callback);
  try {
    const action = clean_(e.parameter.action || "");
    const payload = parsePayload_(e.parameter.payload);
    const session = clean_(e.parameter.session || "");
    const result = route_(action, payload, session, e);
    return jsonp_(callback, { ok: true, data: result });
  } catch (err) {
    return jsonp_(callback, { ok: false, error: safeError_(err) });
  }
}

function route_(action, payload, session, e) {
  const publicActions = ["publicDashboard", "login"];
  if (publicActions.indexOf(action) !== -1) {
    if (action === "publicDashboard") return getPublicDashboard_();
    if (action === "login") return login_(payload, e);
  }

  const user = requireSession_(session);
  requirePermission_(user.role, action);

  if (action === "createClass") return createClass_(payload, user, e);
  if (action === "createUser") return createUser_(payload, user, e);
  if (action === "createLookup") return createLookup_(payload, user, e);
  if (action === "createRecord") return createRecord_(payload, user, e);
  if (action === "listRecords") return listRecords_(payload, user);
  if (action === "deleteRecord") return deleteRecord_(payload, user, e);
  if (action === "refreshCache") {
    refreshPublicCache_();
    audit_(user, "refreshCache", "PUBLIC_CACHE", "dashboard", e, "Cache público atualizado");
    return { updated: true };
  }
  throw new Error("Ação não permitida.");
}

function login_(payload, e) {
  const username = clean_(payload.username || "").toLowerCase();
  const password = String(payload.password || "");
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) throw new Error("Usuário inválido.");
  if (password.length < 8 || password.length > 100) throw new Error("Senha inválida.");

  const rows = getRows_(SHEETS.USERS);
  const user = rows.find(r => r.username === username && String(r.ativo) === "true");
  Utilities.sleep(250); // reduz ataques por tentativa em massa
  if (!user) throw new Error("Login não autorizado.");

  const expected = hashPassword_(password, user.salt);
  if (expected !== user.password_hash) throw new Error("Login não autorizado.");

  const session = Utilities.getUuid() + Utilities.getUuid();
  const sessionData = { username: user.username, role: user.role, display_name: user.display_name, createdAt: new Date().toISOString() };
  CacheService.getScriptCache().put("sess_" + session, JSON.stringify(sessionData), 21600);
  audit_(sessionData, "login", "USERS", user.username, e, "Login fictício realizado");
  return { session, username: user.username, role: user.role, display_name: user.display_name };
}

function createClass_(payload, user, e) {
  const obj = {
    id_turma: "TUR-" + Utilities.getUuid().slice(0, 8),
    segmento: limit_(payload.segmento, 40),
    serie: limit_(payload.serie, 40),
    turma: limit_(payload.turma, 20),
    ativo: true,
    data_cadastro: now_(),
    data_atualizacao: now_()
  };
  requireText_(obj.segmento, "segmento");
  requireText_(obj.serie, "serie");
  requireText_(obj.turma, "turma");
  appendObject_(SHEETS.CLASSES, obj);
  audit_(user, "createClass", "CLASSES", obj.id_turma, e, JSON.stringify({ segmento: obj.segmento, serie: obj.serie, turma: obj.turma }));
  return obj;
}

function createUser_(payload, user, e) {
  const username = clean_(payload.username || "").toLowerCase();
  const password = String(payload.password || "");
  const role = clean_(payload.role || "");
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) throw new Error("Nome de usuário fictício inválido.");
  if (ALLOWED.roles.indexOf(role) === -1) throw new Error("Perfil inválido.");
  if (password.length < 8 || password.length > 100) throw new Error("Senha fictícia precisa ter pelo menos 8 caracteres.");
  if (getRows_(SHEETS.USERS).some(r => r.username === username && String(r.ativo) === "true")) throw new Error("Usuário já existe.");

  const salt = Utilities.getUuid();
  const obj = {
    id_usuario: "USR-" + Utilities.getUuid().slice(0, 8),
    username,
    display_name: limit_(payload.display_name, 60),
    role,
    salt,
    password_hash: hashPassword_(password, salt),
    ativo: true,
    data_cadastro: now_(),
    data_atualizacao: now_()
  };
  requireText_(obj.display_name, "nome exibido");
  appendObject_(SHEETS.USERS, obj);
  audit_(user, "createUser", "USERS", obj.username, e, JSON.stringify({ username: obj.username, role: obj.role }));
  return { id_usuario: obj.id_usuario, username: obj.username, role: obj.role };
}

function createLookup_(payload, user, e) {
  const tipo = clean_(payload.tipo || "");
  const valor = limit_(payload.valor, 50);
  if (ALLOWED.lookupTypes.indexOf(tipo) === -1) throw new Error("Tipo de lista inválido.");
  requireText_(valor, "valor");
  const obj = { id_lookup: "LKP-" + Utilities.getUuid().slice(0, 8), tipo, valor, ativo: true, data_cadastro: now_(), data_atualizacao: now_() };
  appendObject_(SHEETS.LOOKUPS, obj);
  audit_(user, "createLookup", "LOOKUPS", obj.id_lookup, e, JSON.stringify({ tipo, valor }));
  return obj;
}

function createRecord_(payload, user, e) {
  const obj = {
    id_registro: "REG-" + Utilities.getUuid().slice(0, 8),
    segmento: limit_(payload.segmento, 40),
    serie: limit_(payload.serie, 40),
    turma: limit_(payload.turma, 20),
    categoria_suporte: enum_(payload.categoria_suporte, ALLOWED.categoria_suporte, "categoria"),
    nivel_suporte: enum_(payload.nivel_suporte, ALLOWED.nivel_suporte, "nível"),
    necessita_auxiliar: enum_(payload.necessita_auxiliar || "Não", ALLOWED.boolText, "auxiliar"),
    necessita_prova_adaptada: enum_(payload.necessita_prova_adaptada || "Não", ALLOWED.boolText, "prova adaptada"),
    necessita_adaptacao_curricular: enum_(payload.necessita_adaptacao_curricular || "Não", ALLOWED.boolText, "adaptação curricular"),
    necessita_adaptacao_mecanica: enum_(payload.necessita_adaptacao_mecanica || "Não", ALLOWED.boolText, "adaptação mecânica"),
    possui_documentacao: enum_(payload.possui_documentacao || "Não", ALLOWED.boolText, "documentação"),
    status_acompanhamento: enum_(payload.status_acompanhamento, ALLOWED.status_acompanhamento, "status"),
    ativo: true,
    data_cadastro: now_(),
    data_atualizacao: now_()
  };
  ["segmento", "serie", "turma"].forEach(k => requireText_(obj[k], k));
  appendObject_(SHEETS.SUPPORT_MOCK, obj);
  audit_(user, "createRecord", "SUPPORT_MOCK", obj.id_registro, e, "Registro fictício criado");
  return obj;
}

function listRecords_(payload, user) {
  const filters = {
    segmento: clean_(payload.segmento || "").toLowerCase(),
    serie: clean_(payload.serie || "").toLowerCase(),
    turma: clean_(payload.turma || "").toLowerCase(),
    status_acompanhamento: clean_(payload.status_acompanhamento || "")
  };
  return getRows_(SHEETS.SUPPORT_MOCK)
    .filter(r => String(r.ativo) === "true")
    .filter(r => !filters.segmento || String(r.segmento).toLowerCase().indexOf(filters.segmento) !== -1)
    .filter(r => !filters.serie || String(r.serie).toLowerCase().indexOf(filters.serie) !== -1)
    .filter(r => !filters.turma || String(r.turma).toLowerCase().indexOf(filters.turma) !== -1)
    .filter(r => !filters.status_acompanhamento || r.status_acompanhamento === filters.status_acompanhamento)
    .map(r => pick_(r, HEADERS.SUPPORT_MOCK));
}

function deleteRecord_(payload, user, e) {
  const id = clean_(payload.id_registro || "");
  if (!/^REG-[a-zA-Z0-9-]{4,}$/.test(id)) throw new Error("ID inválido.");
  const sh = sheet_(SHEETS.SUPPORT_MOCK);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf("id_registro");
  const ativoCol = headers.indexOf("ativo");
  const updCol = headers.indexOf("data_atualizacao");
  for (let i = 1; i < values.length; i++) {
    if (values[i][idCol] === id && String(values[i][ativoCol]) === "true") {
      sh.getRange(i + 1, ativoCol + 1).setValue(false);
      sh.getRange(i + 1, updCol + 1).setValue(now_());
      audit_(user, "deleteRecord", "SUPPORT_MOCK", id, e, "Exclusão lógica: ativo=false");
      return { deleted: true };
    }
  }
  throw new Error("Registro não encontrado.");
}

function getPublicDashboard_() {
  const rows = getRows_(SHEETS.PUBLIC_CACHE);
  const item = rows.find(r => r.cache_key === "dashboard");
  if (!item) {
    refreshPublicCache_();
    return getPublicDashboard_();
  }
  return JSON.parse(item.json || "{}");
}

function refreshPublicCache_() {
  const rows = getRows_(SHEETS.SUPPORT_MOCK).filter(r => String(r.ativo) === "true");
  const byClassMap = {};
  const byCatMap = {};
  const segmentos = {};
  const turmas = {};
  rows.forEach(r => {
    const key = [r.segmento, r.serie, r.turma].join("||");
    byClassMap[key] = byClassMap[key] || { segmento: r.segmento, serie: r.serie, turma: r.turma, total: 0 };
    byClassMap[key].total++;
    byCatMap[r.categoria_suporte] = (byCatMap[r.categoria_suporte] || 0) + 1;
    segmentos[r.segmento] = true;
    turmas[key] = true;
  });
  const data = {
    totalAtivo: rows.length,
    segmentos: Object.keys(segmentos).length,
    turmas: Object.keys(turmas).length,
    updatedAt: new Date().toISOString(),
    byClass: Object.keys(byClassMap).sort().map(k => byClassMap[k]),
    byCategory: Object.keys(byCatMap).sort().map(k => ({ categoria: k, total: byCatMap[k] }))
  };

  const sh = sheet_(SHEETS.PUBLIC_CACHE);
  sh.clear();
  sh.appendRow(HEADERS.PUBLIC_CACHE);
  sh.appendRow(["dashboard", JSON.stringify(data), now_()]);
  return data;
}

function seedRoles_() {
  const existing = getRows_(SHEETS.ROLES).map(r => r.role);
  [
    ["coordenador", "Acesso administrativo completo", "createClass,createUser,createLookup,createRecord,listRecords,deleteRecord,refreshCache", true],
    ["professor", "Cria e lista registros fictícios", "createRecord,listRecords", true],
    ["visualizador", "Lista registros fictícios", "listRecords", true]
  ].forEach(r => { if (existing.indexOf(r[0]) === -1) sheet_(SHEETS.ROLES).appendRow(r); });
}

function seedLookups_() {
  const sh = sheet_(SHEETS.LOOKUPS);
  const existing = getRows_(SHEETS.LOOKUPS).map(r => r.tipo + "|" + r.valor);
  function add(tipo, valor) {
    if (existing.indexOf(tipo + "|" + valor) === -1) sh.appendRow(["LKP-" + Utilities.getUuid().slice(0,8), tipo, valor, true, now_(), now_()]);
  }
  ALLOWED.categoria_suporte.forEach(v => add("categoria_suporte", v));
  ALLOWED.nivel_suporte.forEach(v => add("nivel_suporte", v));
  ALLOWED.status_acompanhamento.forEach(v => add("status_acompanhamento", v));
}

function seedClasses_() {
  if (getRows_(SHEETS.CLASSES).length) return;
  [["Fundamental I","5º Ano","A"],["Fundamental II","8º Ano","B"],["Ensino Médio","2ª Série","A"]]
    .forEach(c => sheet_(SHEETS.CLASSES).appendRow(["TUR-" + Utilities.getUuid().slice(0,8), c[0], c[1], c[2], true, now_(), now_()]));
}

function seedAdminUser_() {
  if (getRows_(SHEETS.USERS).some(r => r.username === "coord_demo")) return;
  const salt = Utilities.getUuid();
  sheet_(SHEETS.USERS).appendRow(["USR-" + Utilities.getUuid().slice(0,8), "coord_demo", "Coordenador Fictício", "coordenador", salt, hashPassword_("Demo@12345", salt), true, now_(), now_()]);
}

function seedMockRecords_() {
  if (getRows_(SHEETS.SUPPORT_MOCK).length) return;
  [
    ["Fundamental I","5º Ano","A","Aprendizagem","Baixo","Não","Sim","Não","Não","Não","Em análise"],
    ["Fundamental II","8º Ano","B","Comunicação","Médio","Não","Não","Sim","Não","Sim","Ativo"],
    ["Ensino Médio","2ª Série","A","Altas habilidades","Alto","Não","Não","Sim","Não","Não","Revisar"],
    ["Fundamental II","8º Ano","B","Atenção","Baixo","Sim","Não","Não","Não","Não","Ativo"]
  ].forEach(r => sheet_(SHEETS.SUPPORT_MOCK).appendRow(["REG-" + Utilities.getUuid().slice(0,8)].concat(r).concat([true, now_(), now_()])));
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  const first = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  if (first.join("|") !== headers.join("|")) {
    sh.clear();
    sh.appendRow(headers);
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#0f766e").setFontColor("#ffffff");
  sh.autoResizeColumns(1, headers.length);
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw new Error("Execute setup() antes de usar a API.");
  return SpreadsheetApp.openById(id);
}
function sheet_(name) { return spreadsheet_().getSheetByName(name); }

function getRows_(sheetName) {
  const sh = sheet_(sheetName);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(row => row.some(v => v !== "")).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function appendObject_(sheetName, obj) {
  const headers = HEADERS[sheetName];
  sheet_(sheetName).appendRow(headers.map(h => safeCell_(obj[h])));
}

function setSetting_(chave, valor, descricao) {
  const sh = sheet_(SHEETS.SETTINGS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === chave) {
      sh.getRange(i + 1, 2, 1, 3).setValues([[valor, descricao, now_()]]);
      return;
    }
  }
  sh.appendRow([chave, valor, descricao, now_()]);
}

function requireSession_(session) {
  if (!session || !/^[a-f0-9-]{60,80}$/i.test(session)) throw new Error("Sessão inválida.");
  const raw = CacheService.getScriptCache().get("sess_" + session);
  if (!raw) throw new Error("Sessão expirada. Faça login novamente.");
  return JSON.parse(raw);
}

function requirePermission_(role, action) {
  if (!PERMISSIONS[role] || PERMISSIONS[role].indexOf(action) === -1) throw new Error("Perfil sem permissão para esta ação.");
}

function audit_(user, action, entity, entityId, e, details) {
  try {
    sheet_(SHEETS.AUDIT_LOG).appendRow([
      "LOG-" + Utilities.getUuid().slice(0, 8),
      now_(),
      clean_(user.username || "public"),
      clean_(user.role || "public"),
      clean_(action),
      clean_(entity),
      clean_(entityId),
      hashIp_(e),
      limit_(details || "", 500)
    ]);
  } catch (err) {}
}

function hashPassword_(password, salt) {
  const pepper = PropertiesService.getScriptProperties().getProperty("AUTH_PEPPER") || "";
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + password + pepper, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function hashIp_(e) {
  const raw = JSON.stringify(e && e.parameters ? e.parameters : {}) + new Date().toDateString();
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes).slice(0, 18);
}

function parsePayload_(payload) {
  if (!payload) return {};
  if (payload.length > 12000) throw new Error("Payload grande demais.");
  return JSON.parse(payload);
}

function safeCallback_(cb) {
  cb = String(cb || "callback");
  if (!/^[A-Za-z_$][0-9A-Za-z_$]{0,40}$/.test(cb)) throw new Error("Callback inválido.");
  return cb;
}

function jsonp_(callback, obj) {
  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(obj) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function clean_(v) {
  return String(v ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function limit_(v, max) {
  const s = clean_(v);
  if (s.length > max) throw new Error("Campo ultrapassa o limite de " + max + " caracteres.");
  return s;
}

function requireText_(v, field) {
  if (!v || String(v).trim().length < 1) throw new Error("Campo obrigatório: " + field);
}

function enum_(v, allowed, label) {
  const s = clean_(v);
  if (allowed.indexOf(s) === -1) throw new Error("Valor inválido em " + label + ".");
  return s;
}

function safeCell_(v) {
  if (typeof v === "string" && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function pick_(obj, keys) {
  const out = {};
  keys.forEach(k => out[k] = obj[k]);
  return out;
}

function safeError_(err) {
  return clean_(err && err.message ? err.message : "Erro interno.").slice(0, 180);
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}
