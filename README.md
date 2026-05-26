# Plataforma Escolar Segura de Acompanhamento Educacional

Projeto escolar fictício feito com GitHub Pages, Google Apps Script e Google Planilhas.

## Entregáveis

- `index.html`: página inicial.
- `dashboard.html`: dashboard público com dados agregados.
- `admin.html`: painel do coordenador.
- `style.css`: layout responsivo e profissional.
- `app.js`: integração do frontend com a API.
- `Code.gs`: backend/API em Google Apps Script.
- `README.md`: instruções do projeto.
- `planilha_modelo_ficticia.xlsx`: modelo das abas e dados fictícios.
- `regras_de_seguranca.md`: explicação curta das regras de segurança.

## Como publicar

### 1. Criar o backend

1. Acesse Google Apps Script.
2. Crie um novo projeto.
3. Cole todo o conteúdo de `Code.gs`.
4. Salve o projeto.
5. Execute a função `setup()` uma vez.
6. Autorize as permissões solicitadas.
7. O Apps Script criará a planilha automaticamente e guardará o ID em `Script Properties`.

Usuário inicial fictício:

```txt
Usuário: coord_demo
Senha: Demo@12345
```

### 2. Implantar como Web App

1. Clique em **Implantar > Nova implantação**.
2. Tipo: **App da Web**.
3. Executar como: **Eu**.
4. Quem pode acessar: **Qualquer pessoa**.
5. Copie a URL terminada em `/exec`.

### 3. Configurar o frontend

Abra `app.js` e troque:

```js
const API_URL = "COLE_AQUI_A_URL_DO_APPS_SCRIPT_WEB_APP_EXEC";
```

pela URL `/exec` do Web App.

### 4. Publicar no GitHub Pages

1. Crie um repositório.
2. Envie `index.html`, `dashboard.html`, `admin.html`, `style.css` e `app.js`.
3. Ative o GitHub Pages em **Settings > Pages**.

## O que o sistema faz

- Página inicial de apresentação.
- Dashboard público com totais agregados.
- Login de usuários fictícios.
- Cadastro de turmas.
- Cadastro de usuários fictícios.
- Cadastro de perfis/listas auxiliares.
- Cadastro de registros fictícios de suporte educacional.
- Listagem com filtros.
- Logs no `AUDIT_LOG`.
- Atualização do cache público.
- Exclusão lógica com `ativo=false`.

## Aviso importante

Este projeto é apenas um protótipo escolar. Não use nomes reais, fotos, documentos reais, dados médicos, CID, laudos, dados familiares ou qualquer informação pessoal.
