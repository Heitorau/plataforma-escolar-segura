# Regras de segurança usadas no projeto

## 1. Nenhum dado real

O sistema foi projetado para usar somente dados fictícios. Não devem ser cadastrados nomes reais de alunos, fotos, laudos, CID, informações médicas, dados familiares ou observações pessoais.

## 2. A planilha não é acessada pelo frontend

O HTML, CSS e JavaScript publicados no GitHub Pages não acessam o Google Planilhas diretamente. Todas as ações passam pelo Google Apps Script.

## 3. ID da planilha protegido

O ID da planilha fica salvo no `Script Properties` do Apps Script. Ele não aparece no `app.js`, no HTML ou no GitHub.

## 4. Controle de perfil

O backend possui perfis fictícios:

- `coordenador`: pode criar turmas, usuários, listas, registros, excluir logicamente e atualizar o cache.
- `professor`: pode criar e listar registros fictícios.
- `visualizador`: pode apenas listar registros fictícios.

## 5. Sessão temporária

Após login, o Apps Script cria uma sessão temporária no `CacheService`. A sessão expira automaticamente.

## 6. Senhas fictícias com hash

As senhas fictícias não são salvas em texto puro. O backend salva `salt` e `password_hash` usando SHA-256 com pepper guardado no `Script Properties`.

## 7. Validação por allowlist

O backend só aceita ações conhecidas e campos permitidos. Categorias, status, níveis, perfis e respostas sim/não são validados por listas permitidas.

## 8. Proteção contra fórmula maliciosa

Textos iniciados com `=`, `+`, `-` ou `@` são neutralizados antes de serem gravados na planilha.

## 9. Exclusão lógica

Nenhum registro é apagado definitivamente pela interface. A exclusão altera `ativo=false`, mantendo histórico para auditoria.

## 10. Logs de auditoria

Criações, login, exclusões lógicas e atualização de cache são registrados na aba `AUDIT_LOG`.

## 11. Dashboard público agregado

O dashboard público usa a aba `PUBLIC_CACHE`, que contém apenas totais por segmento, série, turma e categoria. Ele não exibe identificação de pessoas.

## 12. Limitação importante do protótipo

Como o frontend roda no GitHub Pages e o Apps Script usa JSONP para evitar CORS, este projeto não deve ser usado com dados reais. Para produção real, seria necessário autenticação institucional, HTTPS com POST normal, controle de domínio, regras LGPD completas, revisão profissional de segurança e backend dedicado.
