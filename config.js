/* Ligação com o banco de dados (Supabase).
   Preencha as duas linhas abaixo com os dados de Project Settings > API.
   A chave "anon" é pública por projeto: pode ficar neste arquivo. A proteção
   dos dados está nas regras do banco (supabase/schema.sql), não em segredo.
   NUNCA cole aqui a chave "service_role".
   Deixando em branco, o site roda em modo de teste, salvando só no navegador. */
window.SPC_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: ""
};
