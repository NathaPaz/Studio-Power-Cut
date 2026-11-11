# Studio Power Cut: site de agendamento

Site para celular com apresentação da barbearia, novidades, produtos, curso em destaque, agendamento online para clientes e painel do dono.

- **Site**: pasta `site/` (HTML, CSS e JavaScript puros, sem build).
- **Banco de dados**: Supabase (Postgres + login + armazenamento de fotos). Esquema em `supabase/schema.sql`.
- **Hospedagem**: qualquer hospedagem de site estático (Netlify ou Cloudflare Pages, abaixo).

Sem configurar nada, o site abre em **modo de teste**: tudo é salvo só no navegador e o painel aceita qualquer e-mail e senha. Serve para ver e mostrar. Para valer de verdade, siga os passos.

## Colocando no ar

### 1. Criar o projeto no Supabase
1. Crie uma conta em supabase.com e um projeto novo (escolha a região mais próxima, por exemplo São Paulo).
2. Guarde a senha do banco em local seguro.

### 2. Criar as tabelas
1. No Supabase, abra **SQL Editor > New query**.
2. Cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Pode rodar de novo sem problema; os dados iniciais só entram se o banco estiver vazio.

### 3. Cadastrar o dono
1. **Authentication > Users > Add user**: informe o e-mail e a senha do dono (marque a confirmação automática do e-mail).
2. No **SQL Editor**, rode, trocando o e-mail:
   ```sql
   insert into public.owners (user_id)
   select id from auth.users where email = 'EMAIL_DO_DONO';
   ```
3. **Authentication > Sign In / Providers**: desligue o cadastro público de novos usuários ("Allow new users to sign up"). Mesmo que alguém criasse conta, só quem está na tabela `owners` acessa o painel, mas desligar evita lixo.

### 4. Ligar o site ao banco
1. **Project Settings > API**: copie a **Project URL** e a chave **anon public**.
2. Abra `site/config.js` e preencha:
   ```js
   window.SPC_CONFIG = {
     supabaseUrl: "https://SEU-PROJETO.supabase.co",
     supabaseAnonKey: "SUA_CHAVE_ANON"
   };
   ```
3. A chave anon é pública por natureza. **Nunca** use a chave `service_role` aqui.

### 5. Testar no seu computador (opcional)
```bash
cd site
python3 -m http.server 8080
```
Abra http://localhost:8080 e entre em `#painel` com o e-mail e senha do dono.

### 6. Publicar
**Netlify** (mais simples): em app.netlify.com, **Add new site > Deploy manually** e arraste a pasta `site/`.

**Cloudflare Pages**: **Create project > Direct Upload** e envie a pasta `site/`.

Os dois leem o arquivo `site/_headers`, que já traz cabeçalhos de segurança (incluindo a política que só permite scripts do próprio site e conexões com o Supabase).

### 7. Domínio próprio
Nas configurações do site na hospedagem, adicione o domínio (por exemplo `agenda.studiopowercut.com.br`) e siga as instruções de DNS. Depois, em `site/index.html`, troque o `og:image` por um endereço completo (`https://seu-dominio/assets/cover.jpg`) para a prévia ao compartilhar no WhatsApp.

### 8. Divulgar
- Link na bio do Instagram: `https://seu-dominio/`
- Link direto para marcar horário: `https://seu-dominio/#agendar`
- No painel, em **Ajustes > Link para clientes**, há os dois links e uma mensagem pronta.

## Teste rápido depois de publicar
1. Abra o site no celular, marque um horário como cliente.
2. Entre em `/#painel`, confira se o horário aparece em **Hoje** ou **Agenda**.
3. Volte ao link do cliente: o horário marcado deve aparecer indisponível.
4. Em **Ajustes**, troque uma foto e salve; recarregue e confira.

## Como os dados são protegidos
- O cliente (sem login) só consegue ler a vitrine e **quais horários estão ocupados**. Não lê nome nem telefone de ninguém.
- Para marcar, o site chama a função `create_booking`, que confere tudo no servidor: horário dentro do expediente, barbeiro e serviços existentes, preço e duração (vêm da vitrine, não do navegador), conflito de horário e limite de 3 horários futuros por telefone.
- Só o dono logado lê e altera agenda, clientes e vitrine (regras RLS do banco).
- Fotos enviadas pelo painel vão para o Storage (`media`), com leitura pública e escrita só do dono.

## Pontos de atenção
- **Plano gratuito do Supabase**: projetos sem uso podem ser pausados. Confira as regras atuais no site deles e, se a agenda for usada todo dia, avalie um plano pago.
- **LGPD**: o site guarda nome e WhatsApp dos clientes. A tela de dados avisa a finalidade. Vale ter uma política de privacidade simples e apagar dados quando o cliente pedir (o dono pode excluir pela agenda).
- **Fotos antigas**: ao trocar uma foto, a anterior continua no Storage. Pode apagar pelo painel do Supabase quando quiser.
- **Agendamento manual do dono**: o painel avisa se há conflito, mas o banco só bloqueia conflito nos agendamentos feitos pelos clientes.
- **Avisos**: não há e-mail nem SMS. Ao concluir, o cliente vê um botão para avisar a barbearia pelo WhatsApp.
- **Atualizar a agenda**: o painel recarrega a cada 60 segundos enquanto aberto em Hoje ou Agenda.

## Estrutura
```
site/
  index.html   config.js   app.js   styles.css   _headers
  assets/      imagens (logo, capa, equipe, produtos)
  vendor/      supabase.js (cliente do Supabase, versão 2.45.4)
supabase/
  schema.sql   tabelas, regras de acesso, funções e dados iniciais
```
