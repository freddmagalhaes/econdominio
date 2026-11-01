import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
// Testa as migrations em um Postgres em memória (PGlite) com um stub do schema auth do Supabase.
import { fileURLToPath } from "node:url";
const M = fileURLToPath(new URL("../migrations/", import.meta.url));
const pg = new PGlite();
const U1 = "11111111-1111-1111-1111-111111111111", U2 = "22222222-2222-2222-2222-222222222222";
const U3 = "33333333-3333-3333-3333-333333333333", U4 = "44444444-4444-4444-4444-444444444444";
await pg.exec(`
 create schema auth;
 create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb not null default '{}'::jsonb, raw_user_meta_data jsonb not null default '{}'::jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
 create role authenticated nologin; create role anon nologin; create role service_role nologin;
 grant usage on schema auth to authenticated;
 insert into auth.users values ('${U1}','u1@x.com'),('${U2}','u2@x.com'),('${U3}','morador@x.com'),('${U4}','outro@x.com');
`);
for (const f of readdirSync(M).filter((x) => x.endsWith(".sql")).sort()) { await pg.exec(readFileSync(M+f,"utf8")); console.log("OK migration", f); }
await pg.exec(`grant usage on schema public to authenticated, service_role; grant all on all tables in schema public to authenticated, service_role; grant usage on all sequences in schema public to authenticated, service_role;`);
// Administradoras de teste: podem criar organização (0015). U3/U4 são moradores e não têm essa permissão.
await pg.exec(`insert into conta_gestora (usuario_id) values ('${U1}'), ('${U2}')`);

const como = async (u) => { await pg.exec(`reset role; select set_config('request.jwt.claim.sub','${u}',false); set role authenticated;`); };
let falhas = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) falhas++; };
const erra = async (fn, m) => { try { await fn(); ok(false, m + " (não errou)"); } catch (e) { ok(true, m + " -> " + e.message.split("\n")[0]); } };

await como(U1);
const org1 = (await pg.query("select criar_organizacao('Adm A') id")).rows[0].id;
const c1 = (await pg.query("insert into condominio(organizacao_id,nome) values ($1,'Cond A') returning id",[org1])).rows[0].id;
await como(U2);
const org2 = (await pg.query("select criar_organizacao('Adm B') id")).rows[0].id;
await pg.query("insert into condominio(organizacao_id,nome) values ($1,'Cond B') returning id",[org2]);

await como(U1);
const linhas = JSON.stringify([
 {bloco:"A",unidade:"101",nome:"Maria",email:"m@x.com"},
 {bloco:"A",unidade:"102",nome:"João"},
 {unidade:"S1",nome:"Ana"},
 {bloco:"A",unidade:"101",nome:"Pedro"}]);
let r = (await pg.query("select importar_unidades($1,$2::jsonb) r",[c1,linhas])).rows[0].r;
ok(r.unidades_novas===3 && r.blocos_novos===1 && r.pessoas_novas===4 && r.vinculos_novos===4, "import 1: "+JSON.stringify(r));
r = (await pg.query("select importar_unidades($1,$2::jsonb) r",[c1,linhas])).rows[0].r;
ok(r.unidades_novas===0 && r.blocos_novos===0 && r.pessoas_novas===0 && r.vinculos_novos===0, "reimport idempotente (inclui unidade sem bloco): "+JSON.stringify(r));
ok((await pg.query("select count(*)::int n from vinculo_unidade where principal")).rows[0].n===3, "1 principal por unidade");

await como(U2);
ok((await pg.query("select count(*)::int n from unidade")).rows[0].n===0, "RLS: U2 não vê unidades de A");
await erra(()=>pg.query("select importar_unidades($1,$2::jsonb)",[c1,linhas]), "RLS: U2 não importa em A");
await erra(()=>pg.query("select gerar_cotas($1,'2026-11-01','2026-11-10',45000)",[c1]), "RLS: U2 não gera cotas em A");

await como(U1);
ok((await pg.query("select gerar_cotas($1,'2026-11-15','2026-11-10',45000) n",[c1])).rows[0].n===3, "gerou 3 cotas (competência normalizada p/ dia 1)");
ok((await pg.query("select gerar_cotas($1,'2026-11-01','2026-11-10',99900) n",[c1])).rows[0].n===0, "gerar de novo não duplica nem altera");
await erra(()=>pg.query("select gerar_cotas($1,'2026-12-01','2026-12-10',0)",[c1]), "valor zero rejeitado");
const cota = (await pg.query("select id from cota limit 1")).rows[0].id;
await pg.query("select registrar_pagamento($1,20000,'2026-11-05')",[cota]);
let v = (await pg.query("select status,valor_pago_centavos::int p from vw_cotas_situacao where id=$1",[cota])).rows[0];
ok(v.status==="aberta" && v.p===20000, "pagamento parcial mantém aberta");
await erra(()=>pg.query("select registrar_pagamento($1,30000,'2026-11-06')",[cota]), "excesso rejeitado");
await pg.query("select registrar_pagamento($1,25000,'2026-11-06','pix','ext-1')",[cota]);
await pg.query("select registrar_pagamento($1,25000,'2026-11-06','pix','ext-1') id",[cota]);
v = (await pg.query("select status,valor_pago_centavos::int p from vw_cotas_situacao where id=$1",[cota])).rows[0];
ok(v.status==="paga" && v.p===45000, "pagamento completo -> paga; webhook repetido idempotente (pago="+v.p+")");
await pg.query("select estornar_ultimo_pagamento($1)",[cota]);
v = (await pg.query("select status,valor_pago_centavos::int p from vw_cotas_situacao where id=$1",[cota])).rows[0];
ok(v.status==="aberta" && v.p===20000, "estorno reabre cota (pago="+v.p+")");
const up = await pg.query("update pagamento set valor_centavos=1");
const dl = await pg.query("delete from pagamento");
ok(up.affectedRows===0 && dl.affectedRows===0, "RLS: usuário não altera/apaga pagamento (0 linhas)");
await pg.exec("reset role");
await erra(()=>pg.query("update pagamento set valor_centavos=1"), "trigger: pagamento imutável mesmo para superusuário");
await erra(()=>pg.query("delete from pagamento"), "trigger: delete bloqueado");
await como(U1);
ok((await pg.query("select count(*)::int n from log_auditoria where condominio_id=$1",[c1])).rows[0].n>0, "auditoria registrada");
await como(U2);
await erra(()=>pg.query("select registrar_pagamento($1,100,'2026-11-06')",[cota]), "RLS: U2 não paga cota de A");

// ---------------------------------------------------------------- garantidora
await como(U1);
const gar = (await pg.query("insert into garantidora(organizacao_id,nome) values ($1,'Garantidora X') returning id",[org1])).rows[0].id;
const ctr = (await pg.query("insert into contrato_garantidora(condominio_id,garantidora_id,taxa_antecipacao_bps,prazo_repasse_dias,vigencia_inicio) values ($1,$2,250,5,'2026-01-01') returning id",[c1,gar])).rows[0].id;
await pg.query("select gerar_cotas($1,'2027-01-01','2027-01-10',100000)",[c1]);
ok((await pg.query("select antecipar_competencia($1,'2027-01-01','2026-12-20') n",[ctr])).rows[0].n===3, "antecipou 3 cotas de jan/2027");
const ant = (await pg.query("select valor_antecipado_centavos v, taxa_centavos t from antecipacao a join cota c on c.id=a.cota_id where c.competencia='2027-01-01' limit 1")).rows[0];
ok(ant.v===97500 && ant.t===2500, "taxa 2,5% sobre 1.000,00 = 25,00; antecipado 975,00");
ok((await pg.query("select antecipar_competencia($1,'2027-01-01','2026-12-20') n",[ctr])).rows[0].n===0, "antecipar de novo não duplica");
ok((await pg.query("select antecipar_competencia($1,'2026-11-01','2026-12-20') n",[ctr])).rows[0].n===2, "cota de nov com pagamento é excluída (2 de 3)");
await erra(()=>pg.query("select antecipar_competencia($1,'2027-01-01','2025-01-01')",[ctr]), "fora da vigência rejeitado");
const jan = (await pg.query("select id from cota where competencia='2027-01-01' order by id")).rows.map(r=>r.id);
await pg.query("select registrar_pagamento($1,100000,'2027-01-12')",[jan[0]]);
const rep = (await pg.query("select id, valor_centavos v, status, previsto_para::text pp from repasse where status='pendente'")).rows;
ok(rep.length===1 && rep[0].v===100000 && rep[0].pp==="2027-01-17", "pagamento de cota antecipada gera repasse pendente (prazo 5 dias)");
await pg.query("select registrar_pagamento($1,50000,'2027-01-12')",[jan[1]]);
await pg.query("select estornar_ultimo_pagamento($1)",[jan[1]]);
ok((await pg.query("select count(*)::int n from repasse where status='cancelado'")).rows[0].n===1, "estorno cancela o repasse pendente");
let sd = (await pg.query("select * from vw_garantidora_saldo where contrato_id=$1",[ctr])).rows[0];
ok(sd.total_cotas_centavos===390000 && sd.recebido_centavos===100000 && sd.a_repassar_centavos===100000 && sd.em_aberto_centavos===290000 && sd.taxa_centavos===9750,
   "saldo: "+JSON.stringify(sd));
await pg.query("select registrar_repasse($1,'2027-01-18')",[rep[0].id]);
await erra(()=>pg.query("select registrar_repasse($1,'2027-01-18')",[rep[0].id]), "repasse não repete");
await erra(()=>pg.query("select estornar_ultimo_pagamento($1)",[jan[0]]), "estorno bloqueado após repasse efetuado");
sd = (await pg.query("select * from vw_garantidora_saldo where contrato_id=$1",[ctr])).rows[0];
ok(sd.repassado_centavos===100000 && sd.a_repassar_centavos===0, "saldo após repasse");
await como(U2);
await erra(()=>pg.query("select antecipar_competencia($1,'2027-01-01','2026-12-20')",[ctr]), "RLS: U2 não antecipa em A");
ok((await pg.query("select count(*)::int n from repasse")).rows[0].n===0 && (await pg.query("select count(*)::int n from vw_garantidora_saldo")).rows[0].n===0, "RLS: U2 não vê repasses nem saldos de A");


// ---------------------------------------------------------------- relatório consolidado
await como(U1);
await pg.query("select gerar_cotas($1,'2020-01-01','2020-01-10',10000)",[c1]); // 3 cotas vencidas há muito tempo
let rel = (await pg.query("select * from relatorio_consolidado($1,'2027-01-01')",[org1])).rows;
ok(rel.length===1 && rel[0].condominio==="Cond A" && rel[0].unidades===3, "consolidado: 1 condomínio, 3 unidades");
ok(rel[0].cotas===3 && rel[0].previsto_centavos===300000 && rel[0].recebido_centavos===100000, "consolidado: previsto 3.000,00 / recebido 1.000,00 em jan/2027");
ok(rel[0].cotas_em_atraso>=3 && rel[0].em_atraso_centavos>=30000, "consolidado: atraso cumulativo inclui cotas de 2020 ("+rel[0].cotas_em_atraso+" cotas)");
ok(rel[0].a_repassar_centavos===0 && rel[0].antecipado_em_aberto_centavos===290000, "consolidado: garantidora (a repassar 0, antecipado em aberto 2.900,00)");
await como(U2);
ok((await pg.query("select * from relatorio_consolidado($1,'2027-01-01')",[org1])).rows.length===0, "RLS: U2 não vê consolidado da org A");
const relB = (await pg.query("select * from relatorio_consolidado($1,'2027-01-01')",[org2])).rows;
ok(relB.length===1 && relB[0].previsto_centavos===0 && relB[0].unidades===0, "consolidado da org B vazio e isolado");


// ---------------------------------------------------------------- balancete
await como(U1);
const c3 = (await pg.query("insert into condominio(organizacao_id,nome) values ($1,'Cond C') returning id",[org1])).rows[0].id;
ok((await pg.query("select count(*)::int n from conta_contabil where condominio_id=$1",[c3])).rows[0].n===14, "plano de contas padrão criado automaticamente (14 contas)");
await pg.query("select importar_unidades($1,$2::jsonb)",[c3,JSON.stringify([{unidade:"1"},{unidade:"2"}])]);
await pg.query("select gerar_cotas($1,'2027-03-01','2027-03-10',100000)",[c3]);
const [co1, co2] = (await pg.query("select id from cota where condominio_id=$1 order by id",[c3])).rows.map(r=>r.id);
const liq = async (codigo) => (await pg.query("select coalesce(sum(total_centavos),0)::int t from vw_balancete_mensal where condominio_id=$1 and codigo=$2",[c3,codigo])).rows[0].t;

await pg.query("select registrar_pagamento($1,100000,'2027-03-05')",[co1]);
ok((await liq("1.01"))===100000, "pagamento sem antecipação gera receita na conta 1.01");
await pg.query("select estornar_ultimo_pagamento($1)",[co1]);
ok((await liq("1.01"))===0, "estorno do pagamento zera a receita");

const gar3 = (await pg.query("insert into garantidora(organizacao_id,nome) values ($1,'Garantidora C') returning id",[org1])).rows[0].id;
const ctr3 = (await pg.query("insert into contrato_garantidora(condominio_id,garantidora_id,taxa_antecipacao_bps,prazo_repasse_dias,vigencia_inicio) values ($1,$2,250,5,'2026-01-01') returning id",[c3,gar3])).rows[0].id;
ok((await pg.query("select antecipar_competencia($1,'2027-03-01','2027-03-02') n",[ctr3])).rows[0].n===1, "antecipou só a cota sem pagamentos");
ok((await liq("1.01"))===100000 && (await liq("2.10"))===2500, "antecipação: receita = valor total da cota (1.000,00) e despesa = taxa (25,00)");
const antesLanc = (await pg.query("select count(*)::int n from lancamento where condominio_id=$1",[c3])).rows[0].n;
await pg.query("select registrar_pagamento($1,100000,'2027-03-08')",[co2]);
ok((await pg.query("select count(*)::int n from lancamento where condominio_id=$1",[c3])).rows[0].n===antesLanc && (await liq("1.01"))===100000,
   "pagamento de cota antecipada NÃO gera nova receita (vai para repasse)");

const contaLuz = (await pg.query("select id from conta_contabil where condominio_id=$1 and codigo='2.03'",[c3])).rows[0].id;
const luz = (await pg.query("insert into lancamento(condominio_id,conta_id,data,valor_centavos,descricao) values ($1,$2,'2027-03-15',30000,'Conta de luz') returning id",[c3,contaLuz])).rows[0].id;
ok((await liq("2.03"))===30000, "despesa manual lançada");
await pg.query("select estornar_lancamento($1)",[luz]);
ok((await liq("2.03"))===0, "estorno de despesa manual");
const contaOutro = (await pg.query("select id from conta_contabil where condominio_id=$1 and codigo='2.03'",[c1])).rows[0].id;
await erra(()=>pg.query("insert into lancamento(condominio_id,conta_id,data,valor_centavos,descricao) values ($1,$2,'2027-03-15',100,'x')",[c3,contaOutro]), "lançamento com conta de outro condomínio rejeitado");
await erra(()=>pg.query("select estornar_lancamento($1)",[luz]), "estorno duplicado rejeitado");
const auto = (await pg.query("select id from lancamento where condominio_id=$1 and pagamento_id is not null and estorno_de is null limit 1",[c3])).rows[0];
if (auto) await erra(()=>pg.query("select estornar_lancamento($1)",[auto.id]), "lançamento automático não é estornável manualmente");
await erra(()=>pg.query("delete from conta_contabil where condominio_id=$1 and sistema='receita_cota'",[c3]), "conta do sistema protegida contra remoção");
await erra(()=>pg.query("update conta_contabil set tipo='despesa' where condominio_id=$1 and sistema='receita_cota'",[c3]), "conta do sistema protegida contra mudança de tipo");
const cVazio = (await pg.query("insert into condominio(organizacao_id,nome) values ($1,'Cond Vazio') returning id",[org1])).rows[0].id;
await pg.query("delete from condominio where id=$1",[cVazio]);
ok((await pg.query("select count(*)::int n from condominio where id=$1",[cVazio])).rows[0].n===0 && (await pg.query("select count(*)::int n from conta_contabil where condominio_id=$1",[cVazio])).rows[0].n===0,
   "condomínio sem movimento pode ser excluído (cascata remove as contas do sistema)");
await como(U2);
ok((await pg.query("select count(*)::int n from vw_balancete_mensal where condominio_id=$1",[c3])).rows[0].n===0, "RLS: U2 não vê balancete de C");


// ---------------------------------------------------------------- portal do morador, convites e comunicados
await como(U1);
const c4 = (await pg.query("insert into condominio(organizacao_id,nome) values ($1,'Cond D') returning id",[org1])).rows[0].id;
await pg.query("select importar_unidades($1,$2::jsonb)",[c4,JSON.stringify([
  {unidade:"1",nome:"Maria",email:"Morador@x.com"},{unidade:"2",nome:"João",email:"joao@x.com"},{unidade:"3",nome:"Sem Email"}])]);
const un = Object.fromEntries((await pg.query("select identificador i, id from unidade where condominio_id=$1",[c4])).rows.map(r=>[r.i,r.id]));
const pe = Object.fromEntries((await pg.query("select nome n, id from pessoa where condominio_id=$1",[c4])).rows.map(r=>[r.n,r.id]));
await pg.query("select gerar_cotas($1,'2027-05-01','2027-05-10',50000)",[c4]);
const cota1 = (await pg.query("select id from cota where unidade_id=$1",[un["1"]])).rows[0].id;
await pg.query("select registrar_pagamento($1,50000,'2027-05-05')",[cota1]);

const cv = (await pg.query("select criar_convite($1,$2,'hash-maria') r",[un["1"],pe["Maria"]])).rows[0].r;
ok(cv.email==="morador@x.com", "convite criado com e-mail normalizado em minúsculas");
await erra(()=>pg.query("select criar_convite($1,$2,'h-sem-email')",[un["3"],pe["Sem Email"]]), "convite exige e-mail da pessoa");
await erra(()=>pg.query("select criar_convite($1,$2,'h-nao-vinc')",[un["1"],pe["João"]]), "convite exige pessoa vinculada à unidade");
await pg.query("select criar_convite($1,$2,'hash-joao')",[un["2"],pe["João"]]);
await pg.query("insert into convite(condominio_id,unidade_id,pessoa_id,email,token_hash,expira_em) values ($1,$2,$3,'outro@x.com','hash-expirado',now() - interval '1 day')",[c4,un["3"],pe["Sem Email"]]);

await como(U3);
const ver = (await pg.query("select ver_convite('hash-maria') r")).rows[0].r;
ok(ver.condominio==="Cond D" && ver.unidade==="1" && ver.email_confere===true, "morador vê o convite e o e-mail confere");
await erra(()=>pg.query("select criar_convite($1,$2,'x')",[un["1"],pe["Maria"]]), "morador não cria convites");
await pg.query("select aceitar_convite('hash-maria')");
await erra(()=>pg.query("select aceitar_convite('hash-maria')"), "convite não pode ser usado duas vezes");
// ---- aceite obrigatório do termo (0012)
ok((await pg.query("select * from portal_cotas($1)",[un["1"]])).rows.length===0
   && (await pg.query("select * from portal_balancete($1,'2027-05-31')",[c4])).rows.length===0
   && (await pg.query("select * from portal_comunicados($1)",[c4])).rows.length===0, "sem aceitar o termo o portal não entrega cotas, balancete nem comunicados");
const dt0 = (await pg.query("select * from portal_dados_termo()")).rows;
ok(dt0.length===1 && dt0[0].aceito_em===null && dt0[0].pessoa_nome==="Maria" && dt0[0].tipo==="proprietario", "dados do termo mostram o titular e aceite pendente");
const vigente = (await pg.query("select termo_vigente() v")).rows[0].v;
await erra(()=>pg.query("select aceitar_termo('versao-antiga',true,false,null,null)"), "aceite de versão desatualizada é recusado");
await erra(()=>pg.query("select aceitar_termo($1,true,false,null,null)",[vigente]), "aceite exige o CPF/CNPJ no cadastro (documento_ausente)");
await como(U1);
await pg.query("update pessoa set documento='123.456.789-00' where id=$1",[pe["Maria"]]);
await como(U3);
await erra(()=>pg.query("select aceitar_termo($1,true,true,null,null)",[vigente]), "WhatsApp exige telefone cadastrado");
const quando = (await pg.query("select aceitar_termo($1,true,false,'203.0.113.9','Mozilla/5.0 (teste)') q",[vigente])).rows[0].q;
const ac = (await pg.query("select aceito_em, versao_termo, ip, user_agent, titular, extract(epoch from (now() - aceito_em))::float seg from aceite_termo")).rows;
ok(ac.length===1 && ac[0].versao_termo===vigente && ac[0].ip==="203.0.113.9" && ac[0].user_agent.includes("Mozilla") && ac[0].seg>=0 && ac[0].seg<120,
   "aceite gravado com data/hora, versão, IP e navegador: "+JSON.stringify({aceito_em: ac[0]?.aceito_em, v: ac[0]?.versao_termo}));
ok(ac[0].titular.nome==="Maria" && ac[0].titular.documento==="123.456.789-00" && ac[0].titular.vinculos[0].tipo==="proprietario" && ac[0].titular.vinculos[0].unidade==="1" && ac[0].titular.condominio==="Cond D",
   "aceite guarda a cópia do titular (nome, CPF/CNPJ, unidade, vínculo): "+JSON.stringify(ac[0].titular));
const quando2 = (await pg.query("select aceitar_termo($1,true,false,'198.51.100.1','Outro') q",[vigente])).rows[0].q;
ok((await pg.query("select count(*)::int n from aceite_termo")).rows[0].n===1 && String(quando2)===String(quando), "aceitar de novo não duplica nem muda a data/hora original");
await erra(()=>pg.query("insert into aceite_termo(condominio_id,unidade_id,usuario_id,versao_termo,titular) values ($1,$2,$3,$4,'{}')",[c4,un["2"],U3,vigente]), "morador não grava aceite direto na tabela");
const upA = await pg.query("update aceite_termo set aceito_em = now() - interval '10 years'");
const dlA = await pg.query("delete from aceite_termo");
ok(upA.affectedRows===0 && dlA.affectedRows===0, "morador não altera nem apaga o próprio aceite");
ok((await pg.query("select * from portal_dados_termo()")).rows[0].aceito_em!==null, "dados do termo passam a mostrar a data do aceite");
const mu = (await pg.query("select * from portal_minhas_unidades()")).rows;
ok(mu.length===1 && mu[0].condominio==="Cond D" && mu[0].unidade==="1", "portal: lista só a unidade do morador");
const pc = (await pg.query("select * from portal_cotas($1)",[un["1"]])).rows;
ok(pc.length===1 && pc[0].valor_pago_centavos===50000 && pc[0].status==="paga", "portal: cotas da própria unidade");
ok((await pg.query("select * from portal_cotas($1)",[un["2"]])).rows.length===0, "portal: cotas de outra unidade não aparecem");
const pb = (await pg.query("select * from portal_balancete($1,'2027-05-31')",[c4])).rows;
ok(pb.length===1 && pb[0].codigo==="1.01" && pb[0].total_centavos===50000, "portal: balancete agregado do condomínio");
ok((await pg.query("select * from portal_balancete($1,'2027-05-31')",[c1])).rows.length===0, "portal: balancete de condomínio sem acesso vem vazio");
const bloqueio = await Promise.all(["pagamento","pessoa","unidade","lancamento","cota","condominio"].map(async (t)=>[t,(await pg.query(`select count(*)::int n from ${t}`)).rows[0].n]));
ok(bloqueio.every(([,n])=>n===0), "morador não lê tabelas diretamente (RLS): "+JSON.stringify(Object.fromEntries(bloqueio)));
ok((await pg.query("select count(*)::int n from acesso_unidade")).rows[0].n===1, "morador enxerga apenas o próprio acesso");

await como(U1);
const pub = (await pg.query("select publicar_comunicado($1,'aviso','Manutenção do elevador','Dia 10, das 8h às 12h.',null,null) r",[c4])).rows[0].r;
ok(pub.destinatarios===2, "comunicado enfileirado para 2 destinatários (quem não tem e-mail fica de fora)");
await erra(()=>pg.query("select publicar_comunicado($1,'reuniao','Assembleia','Pauta',null,null)",[c4]), "reunião exige data");
const pub2 = (await pg.query("select publicar_comunicado($1,'reuniao','Assembleia','Pauta','2027-06-01T19:00:00-03:00','Salão',) r".replace(",)",")"),[c4])).rows[0].r;
ok(pub2.destinatarios===2, "reunião com data e local enfileirada");
await pg.query("update pessoa set aceita_email=false where id=$1",[pe["João"]]);
ok((await pg.query("select publicar_comunicado($1,'aviso','Aviso 3','x',null,null) r",[c4])).rows[0].r.destinatarios===1, "quem não aceita e-mail é respeitado");

await como(U3);
ok((await pg.query("select * from portal_comunicados($1)",[c4])).rows.length===3, "portal: morador vê os comunicados do condomínio");
ok((await pg.query("select * from portal_comunicados($1)",[c1])).rows.length===0, "portal: comunicados de outro condomínio não aparecem");

await como(U4);
await erra(()=>pg.query("select aceitar_convite('hash-joao')"), "convite de outro e-mail é recusado");
await erra(()=>pg.query("select aceitar_convite('hash-expirado')"), "convite expirado é recusado");
await erra(()=>pg.query("select aceitar_convite('hash-inexistente')"), "convite inexistente é recusado");

await como(U1);
await erra(()=>pg.query("select criar_convite($1,$2,'hash-2')",[un["1"],pe["Maria"]]), "unidade com acesso ativo não recebe novo convite");
await pg.query("select revogar_acesso_unidade($1)",[un["1"]]);
await como(U3);
ok((await pg.query("select * from portal_minhas_unidades()")).rows.length===0 && (await pg.query("select * from portal_cotas($1)",[un["1"]])).rows.length===0 && (await pg.query("select * from portal_comunicados($1)",[c4])).rows.length===0,
   "acesso revogado: o morador perde tudo imediatamente");
await como(U1);
await pg.query("select criar_convite($1,$2,'hash-novo')",[un["1"],pe["Maria"]]);
await como(U3);
await pg.query("select aceitar_convite('hash-novo')");
ok((await pg.query("select * from portal_minhas_unidades()")).rows.length===1, "novo convite após revogação funciona");


// ---------------------------------------------------------------- edição de pessoas e consentimento
await como(U1);
const pid = pe["Maria"];
const maria = async () => (await pg.query("select nome, email, telefone, aceita_email, aceita_whatsapp from pessoa where id=$1",[pid])).rows[0];
const consent = async () => (await pg.query("select canal, aceito, versao_termo, destino from consentimento_comunicacao where pessoa_id=$1 order by registrado_em, id",[pid])).rows;
const at = (nome, doc, email, tel, ae, aw, termo) => pg.query("select atualizar_pessoa($1,$2,$3,$4,$5,$6,$7,$8)",[pid,nome,doc,email,tel,ae,aw,termo]);

ok((await maria()).aceita_whatsapp===false, "aceita_whatsapp nasce desligado (opt-in)");
await erra(()=>at("Maria","","morador@x.com","", true, true, "v1"), "WhatsApp exige telefone");
await erra(()=>at("Maria","","morador@x.com","1198100", true, false, "v1"), "telefone inválido rejeitado");
await erra(()=>at("Maria","","sem-arroba","", true, false, "v1"), "e-mail inválido rejeitado");
await erra(()=>at("M","","morador@x.com","", true, false, "v1"), "nome muito curto rejeitado");
await erra(()=>at("Maria","","morador@x.com","(11) 98100-0000", true, true, null), "liberar WhatsApp exige aceite do termo");
ok((await consent()).length===0 && (await maria()).aceita_whatsapp===false, "falha de validação não altera nada nem registra consentimento");

await at("Maria Souza","123.456.789-00","Morador@X.com"," (11) 98100-0000 ", true, true, "2026-11-01");
let m = await maria();
ok(m.nome==="Maria Souza" && m.email==="morador@x.com" && m.telefone==="11981000000" && m.aceita_whatsapp===true, "dados normalizados (e-mail minúsculo, telefone só dígitos): "+JSON.stringify(m));
let cs = await consent();
ok(cs.length===1 && cs[0].canal==="whatsapp" && cs[0].aceito===true && cs[0].versao_termo==="2026-11-01" && cs[0].destino==="11981000000", "consentimento de WhatsApp registrado com versão do termo e contato");

await at("Maria Souza","123.456.789-00","morador@x.com","+55 11 98100-0000", true, true, null);
ok((await consent()).length===1 && (await maria()).telefone==="11981000000", "salvar sem mudar canais não duplica consentimento e aceita +55");
await erra(()=>at("Maria Souza","","morador@x.com","11 97777-1111", true, true, null), "trocar o telefone de um canal liberado exige novo aceite");
await at("Maria Souza","123.456.789-00","morador@x.com","11 97777-1111", true, true, "2026-11-01");
ok((await consent()).length===2 && (await consent())[1].destino==="11977771111", "novo telefone gera novo registro de consentimento");

await at("Maria Souza","","morador@x.com","11 97777-1111", true, false, null);
cs = await consent();
ok(cs.length===3 && cs[2].canal==="whatsapp" && cs[2].aceito===false && cs[2].versao_termo==="revogacao" && (await maria()).aceita_whatsapp===false, "revogar não exige termo e fica registrado");
await at("Maria Souza","","","11 97777-1111", false, false, null);
ok((await maria()).email===null && (await maria()).aceita_email===false && (await consent()).some(x=>x.canal==="email"&&x.aceito===false), "revogar e-mail e remover o endereço");
await erra(()=>at("Maria Souza","","","11 97777-1111", true, false, "2026-11-01"), "liberar e-mail exige e-mail preenchido");

await como(U2);
await erra(()=>at("Hacker","","h@x.com","", false, false, null), "RLS: outra administradora não edita a pessoa");
await como(U3);
await erra(()=>at("Hacker","","h@x.com","", false, false, null), "morador não edita pessoas");
await erra(()=>pg.query("insert into consentimento_comunicacao(condominio_id,pessoa_id,canal,aceito,versao_termo) values ($1,$2,'email',true,'x')",[c4,pid]), "morador não forja consentimento");
await como(U1);
const upd = await pg.query("update consentimento_comunicacao set aceito=true where pessoa_id=$1",[pid]);
const del = await pg.query("delete from consentimento_comunicacao where pessoa_id=$1",[pid]);
ok(upd.affectedRows===0 && del.affectedRows===0, "gestor não altera nem apaga registros de consentimento");
await at("Maria Souza","123.456.789-00","morador@x.com","11 97777-1111", true, false, "2026-11-01");
await pg.query("update pessoa set aceita_email=true where id=$1",[pe["João"]]);
const pubWa = (await pg.query("select publicar_comunicado($1,'aviso','Aviso e-mail','x',null,null) r",[c4])).rows[0].r;
ok(pubWa.destinatarios===2, "comunicados continuam respeitando aceita_email");


// ---------------------------------------------------------------- termo identifica o titular; proprietário/inquilino
await como(U1);
await erra(()=>at("Maria Souza","","morador@x.com","11 97777-1111", true, true, "2026-11-01-v2"), "liberar canal exige CPF/CNPJ preenchido");
const vin = (await pg.query("select v.id, v.tipo from vinculo_unidade v where v.pessoa_id=$1",[pid])).rows;
ok(vin.length===1 && vin[0].tipo==="proprietario", "vínculo importado sem tipo vira proprietário");
await pg.query("select atualizar_vinculo($1,'inquilino')",[vin[0].id]);
await at("Maria Souza","123.456.789-00","morador@x.com","11 97777-1111", true, true, "2026-11-01-v2");
const ultimo = (await pg.query("select titular from consentimento_comunicacao where pessoa_id=$1 order by registrado_em desc, id desc limit 1",[pid])).rows[0].titular;
ok(ultimo.nome==="Maria Souza" && ultimo.documento==="123.456.789-00" && ultimo.vinculos.length===1 && ultimo.vinculos[0].tipo==="inquilino" && ultimo.vinculos[0].unidade==="1",
   "consentimento guarda a foto do titular (nome, documento, unidade, inquilino): "+JSON.stringify(ultimo));
await erra(()=>pg.query("select atualizar_vinculo($1,'morador')",[vin[0].id]), "tipo de vínculo inválido rejeitado");
await como(U2);
await erra(()=>pg.query("select atualizar_vinculo($1,'proprietario')",[vin[0].id]), "RLS: outra administradora não altera o vínculo");
await como(U3);
await erra(()=>pg.query("select atualizar_vinculo($1,'proprietario')",[vin[0].id]), "morador não altera o próprio vínculo");

await como(U1);
const linhasTipo = JSON.stringify([{unidade:"7",nome:"Paulo Dono",documento:"111",tipo:"proprietario"},{unidade:"7",nome:"Rita Inquilina",documento:"222",tipo:"Inquilino"}]);
const imp1 = (await pg.query("select importar_unidades($1,$2::jsonb) r",[c4,linhasTipo])).rows[0].r;
const tipos = (await pg.query("select p.nome, v.tipo, v.principal from vinculo_unidade v join pessoa p on p.id=v.pessoa_id join unidade u on u.id=v.unidade_id where u.condominio_id=$1 and u.identificador='7' order by p.nome",[c4])).rows;
ok(imp1.vinculos_novos===2 && tipos.length===2, "importação com coluna tipo cria 2 vínculos: "+JSON.stringify(tipos));
ok(tipos.find(t=>t.nome==="Paulo Dono").tipo==="proprietario" && tipos.find(t=>t.nome==="Rita Inquilina").tipo==="inquilino", "tipos corretos (proprietário e inquilino) e 1 principal");
const trocado = JSON.stringify([{unidade:"7",nome:"Paulo Dono",documento:"111",tipo:"inquilino"},{unidade:"7",nome:"Rita Inquilina",documento:"222",tipo:"inquilino"}]);
const imp2 = (await pg.query("select importar_unidades($1,$2::jsonb) r",[c4,trocado])).rows[0].r;
const apos = (await pg.query("select count(*)::int n, count(*) filter (where tipo='inquilino')::int inq from vinculo_unidade v join unidade u on u.id=v.unidade_id where u.condominio_id=$1 and u.identificador='7'",[c4])).rows[0];
ok(imp2.vinculos_novos===0 && apos.n===2 && apos.inq===2, "reimportar com outro tipo atualiza o vínculo, sem duplicar");
await erra(()=>pg.query("select importar_unidades($1,$2::jsonb)",[c4,JSON.stringify([{unidade:"8",nome:"X Y",tipo:"sindico"}])]), "tipo inválido na importação é rejeitado");


// ---------------------------------------------------------------- aceite do termo: visão do gestor, canais e nova versão
await pg.exec("reset role");
const constApp = readFileSync(new URL("../../src/lib/consentimento.ts", import.meta.url), "utf8").match(/VERSAO_TERMO = "([^"]+)"/)[1];
ok((await pg.query("select versao from termo_versao where vigente")).rows[0].versao===constApp, "versão vigente no banco = VERSAO_TERMO do app ("+constApp+")");
await como(U1);
const veAceite = (await pg.query("select aceito_em, ip from aceite_termo where condominio_id=$1",[c4])).rows;
ok(veAceite.length===1 && veAceite[0].aceito_em!==null, "gestor enxerga a data/hora do aceite dos moradores do condomínio");
await como(U2);
ok((await pg.query("select count(*)::int n from aceite_termo")).rows[0].n===0, "RLS: outra administradora não vê os aceites");

await como(U3);
await como(U1);
const wa0 = (await pg.query("select aceita_whatsapp w from pessoa where id=$1",[pe["Maria"]])).rows[0].w;
ok(wa0===true, "pré-condição: WhatsApp da Maria estava liberado");
await como(U3);
await pg.query("select aceitar_termo($1,true,false,'203.0.113.9','Mozilla/5.0 (teste)')",[vigente]);
await como(U1);
const flags = (await pg.query("select aceita_email e, aceita_whatsapp w from pessoa where id=$1",[pe["Maria"]])).rows[0];
const logWa = (await pg.query("select aceito, versao_termo, titular->>'origem' o from consentimento_comunicacao where pessoa_id=$1 and canal='whatsapp' order by registrado_em desc, id desc limit 1",[pe["Maria"]])).rows[0];
ok(flags.e===true && flags.w===false && logWa.aceito===false && logWa.versao_termo===vigente && logWa.o==="portal", "o morador desliga o WhatsApp no portal e a revogação fica registrada (origem portal)");

// nova versão do termo: todos precisam aceitar de novo
await pg.exec("reset role");
await pg.exec("update termo_versao set vigente=false where vigente; insert into termo_versao (versao, vigente) values ('2027-01-01-v3', true)");
await como(U3);
ok((await pg.query("select * from portal_cotas($1)",[un["1"]])).rows.length===0, "nova versão do termo: o portal volta a bloquear até aceitar de novo");
await erra(()=>pg.query("select aceitar_termo($1,true,false,null,null)",[vigente]), "aceitar a versão antiga não vale mais");
await pg.query("select aceitar_termo('2027-01-01-v3',true,false,'203.0.113.9','Mozilla/5.0 (teste)')");
ok((await pg.query("select * from portal_cotas($1)",[un["1"]])).rows.length===1 && (await pg.query("select count(*)::int n from aceite_termo where unidade_id=$1",[un["1"]])).rows[0].n===2,
   "após aceitar a nova versão o portal libera e os dois aceites ficam guardados");


// ---------------------------------------------------------------- fila de WhatsApp (0013)
await pg.exec("reset role");
await como(U1);
await pg.query("update pessoa set aceita_whatsapp=true, telefone='(11) 98888-7777' where id=$1",[pe["João"]]);
await pg.query("update pessoa set aceita_whatsapp=true, telefone='+55 11 97777-1111' where id=$1",[pe["Maria"]]);
await pg.query("update pessoa set aceita_whatsapp=true, telefone=null where condominio_id=$1 and nome='Sem Email'",[c4]);
const semWa = (await pg.query("select publicar_comunicado($1,'aviso','Sem WhatsApp','x',null,null) r",[c4])).rows[0].r;
ok(semWa.destinatarios_whatsapp===0 && (await pg.query("select count(*)::int n from envio_comunicacao where comunicado_id=$1 and canal='whatsapp'",[semWa.comunicado_id])).rows[0].n===0,
   "sem pedir WhatsApp, nenhuma linha de WhatsApp é enfileirada");
const comWa = (await pg.query("select publicar_comunicado($1,'aviso','Com WhatsApp','x',null,null,true) r",[c4])).rows[0].r;
const destinos = (await pg.query("select destino from envio_comunicacao where comunicado_id=$1 and canal='whatsapp' order by destino",[comWa.comunicado_id])).rows.map(r=>r.destino);
ok(comWa.destinatarios_whatsapp===2 && destinos.join(",")==="5511977771111,5511988887777", "WhatsApp: só quem autorizou e tem telefone, no formato 55+DDD+número: "+destinos.join(","));
ok((await pg.query("select count(*)::int n from envio_comunicacao where comunicado_id=$1 and canal='whatsapp' and status='pendente'",[comWa.comunicado_id])).rows[0].n===2, "linhas de WhatsApp entram como pendentes");
await pg.query("update pessoa set aceita_whatsapp=false where id=$1",[pe["João"]]);
ok((await pg.query("select publicar_comunicado($1,'aviso','Sem João','x',null,null,true) r",[c4])).rows[0].r.destinatarios_whatsapp===1, "quem desligou o WhatsApp deixa de receber");
await como(U2);
await erra(()=>pg.query("select publicar_comunicado($1,'aviso','x','y',null,null,true)",[c4]), "RLS: outra administradora não publica no condomínio");


// ---------------------------------------------------------------- valor da cota por unidade (0014)
await pg.exec("reset role");
await como(U1);
const c5 = (await pg.query("insert into condominio(organizacao_id,nome) values ($1,'Cond E') returning id",[org1])).rows[0].id;
await pg.query("select importar_unidades($1,$2::jsonb)",[c5,JSON.stringify([
  {unidade:"1",valor_cota_centavos:"40000"},{unidade:"2",valor_cota_centavos:"55000"},{unidade:"3"}])]);
const u5 = Object.fromEntries((await pg.query("select identificador i, id, valor_cota_centavos v from unidade where condominio_id=$1",[c5])).rows.map(r=>[r.i,r]));
ok(u5["1"].v===40000 && u5["2"].v===55000 && u5["3"].v===null, "importação define o valor da cota por unidade (ou deixa vazio)");
await erra(()=>pg.query("select importar_unidades($1,$2::jsonb)",[c5,JSON.stringify([{unidade:"9",valor_cota_centavos:"-5"}])]), "valor de cota inválido na importação é rejeitado");
await pg.query("select importar_unidades($1,$2::jsonb)",[c5,JSON.stringify([{unidade:"1",valor_cota_centavos:"41000"}])]);
ok((await pg.query("select valor_cota_centavos v from unidade where id=$1",[u5["1"].id])).rows[0].v===41000, "reimportar atualiza o valor da cota da unidade existente");

ok((await pg.query("select gerar_cotas($1,'2027-08-01','2027-08-10',null) n",[c5])).rows[0].n===2, "gerar usando o valor de cada unidade ignora quem não tem valor cadastrado");
const vals = (await pg.query("select u.identificador i, c.valor_centavos v from cota c join unidade u on u.id=c.unidade_id where c.condominio_id=$1 order by 1",[c5])).rows;
ok(vals.length===2 && vals[0].v===41000 && vals[1].v===55000, "cada unidade recebe o seu próprio valor: "+JSON.stringify(vals));
await pg.query("update unidade set valor_cota_centavos=60000 where id=$1",[u5["3"].id]);
ok((await pg.query("select gerar_cotas($1,'2027-08-01','2027-08-10',null) n",[c5])).rows[0].n===1, "gerar de novo cria só a que faltava e não altera as existentes");
ok((await pg.query("select gerar_cotas($1,'2027-09-01','2027-09-10',30000) n",[c5])).rows[0].n===3 && (await pg.query("select count(distinct valor_centavos)::int n from cota where competencia='2027-09-01' and condominio_id=$1",[c5])).rows[0].n===1, "com valor informado, todas as unidades recebem o mesmo valor");
await erra(()=>pg.query("select gerar_cotas($1,'2027-10-01','2027-10-10',0)",[c5]), "valor zero continua rejeitado");

const cotaE = (await pg.query("select c.id from cota c where c.unidade_id=$1 and c.competencia='2027-08-01'",[u5["2"].id])).rows[0].id;
await pg.query("select editar_cota($1,58000,'2027-08-15')",[cotaE]);
const ed = (await pg.query("select valor_centavos v, vencimento::text d from cota where id=$1",[cotaE])).rows[0];
ok(ed.v===58000 && ed.d==="2027-08-15", "editar valor e vencimento de uma cota aberta");
ok((await pg.query("select count(*)::int n from log_auditoria where tabela='cota' and registro_id=$1 and acao='UPDATE'",[cotaE])).rows[0].n===1, "a edição fica na auditoria");
await erra(()=>pg.query("select editar_cota($1,0,null)",[cotaE]), "editar para valor zero é rejeitado");
await pg.query("select registrar_pagamento($1,1000,'2027-08-05')",[cotaE]);
await erra(()=>pg.query("select editar_cota($1,59000,null)",[cotaE]), "cota com pagamento não pode ser editada");
await erra(()=>pg.query("select cancelar_cota($1)",[cotaE]), "cota com pagamento não pode ser cancelada");
await pg.query("select estornar_ultimo_pagamento($1)",[cotaE]);
await erra(()=>pg.query("select editar_cota($1,59000,null)",[cotaE]), "após estorno o histórico continua e a edição segue bloqueada");

const cotaF = (await pg.query("select c.id from cota c where c.unidade_id=$1 and c.competencia='2027-08-01'",[u5["1"].id])).rows[0].id;
await pg.query("select cancelar_cota($1)",[cotaF]);
ok((await pg.query("select status from cota where id=$1",[cotaF])).rows[0].status==="cancelada", "cota aberta pode ser cancelada");
await erra(()=>pg.query("select editar_cota($1,45000,null)",[cotaF]), "cota cancelada não é editável");
ok((await pg.query("select gerar_cotas($1,'2027-08-01','2027-08-10',null) n",[c5])).rows[0].n===0, "cota cancelada não é recriada ao gerar de novo");

const gar5 = (await pg.query("insert into garantidora(organizacao_id,nome) values ($1,'Garantidora E') returning id",[org1])).rows[0].id;
const ctr5 = (await pg.query("insert into contrato_garantidora(condominio_id,garantidora_id,taxa_antecipacao_bps,prazo_repasse_dias,vigencia_inicio) values ($1,$2,250,5,'2026-01-01') returning id",[c5,gar5])).rows[0].id;
await pg.query("select antecipar_competencia($1,'2027-09-01','2027-09-02')",[ctr5]);
const cotaG = (await pg.query("select c.id from cota c where c.unidade_id=$1 and c.competencia='2027-09-01'",[u5["1"].id])).rows[0].id;
await erra(()=>pg.query("select editar_cota($1,45000,null)",[cotaG]), "cota antecipada pela garantidora não pode ser editada");
await como(U2);
await erra(()=>pg.query("select editar_cota($1,45000,null)",[cotaG]), "RLS: outra administradora não edita cotas");
await erra(()=>pg.query("select gerar_cotas($1,'2027-11-01','2027-11-10',null)",[c5]), "RLS: outra administradora não gera cotas");


// ---------------------------------------------------------------- cadastro somente por convite (0015)
await pg.exec("reset role");
const NG = "66666666-6666-6666-6666-666666666666", UA = "77777777-7777-7777-7777-777777777777", UN = "88888888-8888-8888-8888-888888888888";
const hashN = (n) => createHash("sha256").update(n).digest("hex");
// Como o servidor do app: registra a autorização (service_role) e só então cria o usuário levando o código secreto.
const autorizar = async (email, origem, nonce) => {
  await pg.exec("reset role; set role service_role");
  await pg.query("select autorizar_cadastro($1,$2,$3)", [email, origem, hashN(nonce)]);
  await pg.exec("reset role");
};
const inserir = (id, email, nonce, extra = "{}") =>
  pg.query("insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values ($1,$2,$3::jsonb,$4::jsonb)", [id, email, JSON.stringify(nonce ? { autorizacao: nonce } : {}), extra]);

await erra(()=>inserir(UN,"invasor@x.com",null), "cadastro público (sem código de autorização) é recusado pelo banco");
await erra(()=>inserir(UN,"invasor@x.com",null,'{"origem":"gestora"}'), "escrever a origem no app_metadata não adianta");
await erra(()=>inserir(UN,"invasor@x.com","chute"), "código de autorização inventado é recusado");
await autorizar("nova@adm.com","gestora","nonce-ng");
await erra(()=>inserir(UN,"outro@x.com","nonce-ng"), "o código só vale para o e-mail autorizado");
await erra(()=>inserir(UN,"nova@adm.com","nonce-errado"), "e-mail autorizado com código errado é recusado");
await inserir(NG,"nova@adm.com","nonce-ng");
const criada = (await pg.query("select raw_app_meta_data->>'origem' o, raw_user_meta_data ? 'autorizacao' t from auth.users where id=$1",[NG])).rows[0];
ok(criada.o==="gestora" && criada.t===false, "com autorização válida a conta nasce; o banco grava a origem e descarta o código");
await erra(()=>inserir(UN,"nova@adm.com","nonce-ng"), "autorização é de uso único");
await autorizar("exp@x.com","convite","nonce-exp");
await pg.exec("update autorizacao_cadastro set expira_em = now() - interval '1 minute' where nonce_hash = '"+hashN("nonce-exp")+"'");
await erra(()=>inserir(UN,"exp@x.com","nonce-exp"), "autorização expirada (2 min) é recusada");
await autorizar("plataforma@x.com","plataforma","nonce-ua");
await inserir(UA,"plataforma@x.com","nonce-ua");
ok((await pg.query("select count(*)::int n from auth.users where id in ($1,$2)",[NG,UA])).rows[0].n===2, "contas criadas pelo servidor (com autorização) existem");
await como(U1);
await erra(()=>pg.query("select autorizar_cadastro('x@x.com','gestora',$1)",[hashN("a")]), "usuário comum não registra autorização");
ok((await pg.query("select count(*)::int n from autorizacao_cadastro")).rows[0].n===0, "RLS: ninguém lê as autorizações pela API");
await pg.exec("reset role; set role anon");
await erra(()=>pg.query("select autorizar_cadastro('x@x.com','gestora',$1)",[hashN("a")]), "anônimo também não");
await pg.exec("reset role");
await erra(()=>{ return pg.exec("reset role; set role service_role").then(()=>pg.query("select autorizar_cadastro('x@x.com','invalida',$1)",[hashN("a")])); }, "origem desconhecida é recusada");
await pg.exec("reset role");
await pg.query("insert into administrador_plataforma(usuario_id) values ($1)",[UA]);

// permissão para criar organização
await como(U3);
await erra(()=>pg.query("select criar_organizacao('Org do morador')"), "morador (sem conta gestora) não cria organização");
ok((await pg.query("select pode_criar_organizacao() p")).rows[0].p===false, "pode_criar_organizacao() é falso para morador");
await como(NG);
await erra(()=>pg.query("select criar_organizacao('Org sem convite aceito')"), "conta ainda sem permissão não cria organização");

// convite de administradora: só o administrador da plataforma
await como(U1);
await erra(()=>pg.query("select criar_convite_gestora('x@y.com','h')"), "administradora comum não convida outras contas");
ok((await pg.query("select eh_admin_plataforma() e")).rows[0].e===false, "eh_admin_plataforma() é falso para quem não é");
await como(UA);
ok((await pg.query("select eh_admin_plataforma() e")).rows[0].e===true, "administrador da plataforma é reconhecido");
const cg = (await pg.query("select criar_convite_gestora('  Nova@Adm.com ','hash-gestora') r")).rows[0].r;
ok(cg.email==="nova@adm.com", "convite de administradora com e-mail normalizado");
await erra(()=>pg.query("select criar_convite_gestora('sem-arroba','h2')"), "e-mail inválido é rejeitado");
await erra(()=>pg.query("select criar_convite_gestora('u1@x.com','h3')"), "quem já é administradora não recebe novo convite");
ok((await pg.query("select count(*)::int n from convite_gestora")).rows[0].n===1, "administrador vê os convites enviados");
await como(U1);
ok((await pg.query("select count(*)::int n from convite_gestora")).rows[0].n===0, "RLS: outras contas não enxergam os convites de administradora");

// funções exclusivas do servidor (service_role)
await erra(()=>pg.query("select convite_gestora_para_cadastro('hash-gestora')"), "usuário logado não chama a validação do servidor");
await pg.exec("reset role; set role anon");
await erra(()=>pg.query("select convite_gestora_para_cadastro('hash-gestora')"), "anônimo também não");
await pg.exec("reset role; set role service_role");
ok((await pg.query("select convite_gestora_para_cadastro('hash-gestora') r")).rows[0].r.email==="nova@adm.com", "servidor valida o token e recebe o e-mail convidado");
ok((await pg.query("select convite_gestora_para_cadastro('token-inexistente') r")).rows[0].r===null, "token inexistente não devolve nada");
await erra(()=>pg.query("select concluir_cadastro_gestora('hash-gestora',$1)",[UA]), "concluir exige que a conta tenha o e-mail do convite");
await pg.query("select concluir_cadastro_gestora('hash-gestora',$1)",[NG]);
await erra(()=>pg.query("select concluir_cadastro_gestora('hash-gestora',$1)",[NG]), "convite de administradora não pode ser reutilizado");
ok((await pg.query("select convite_gestora_para_cadastro('hash-gestora') r")).rows[0].r===null, "convite usado deixa de ser válido");
await como(NG);
const orgNG = (await pg.query("select criar_organizacao('Administradora Nova') id")).rows[0].id;
ok(!!orgNG && (await pg.query("select pode_criar_organizacao() p")).rows[0].p===true, "após concluir o cadastro a administradora cria a organização");

// convite expirado e revogado
await como(UA);
await pg.query("select criar_convite_gestora('outra@adm.com','hash-exp')");
await pg.query("select criar_convite_gestora('revogar@adm.com','hash-rev')");
const idRev = (await pg.query("select id from convite_gestora where token_hash='hash-rev'")).rows[0].id;
await pg.query("select revogar_convite_gestora($1)",[idRev]);
await pg.exec("reset role");
await pg.exec("update convite_gestora set expira_em = now() - interval '1 day' where token_hash='hash-exp'");
await pg.exec("set role service_role");
ok((await pg.query("select convite_gestora_para_cadastro('hash-exp') r")).rows[0].r===null && (await pg.query("select convite_gestora_para_cadastro('hash-rev') r")).rows[0].r===null, "convite expirado e convite revogado não valem");

// convite de morador: validação feita pelo servidor antes de criar a conta
await pg.exec("reset role");
await como(U1);
await pg.query("select criar_convite($1,$2,'hash-cadastro-morador')",[un["2"],pe["João"]]);
await pg.exec("reset role; set role service_role");
const cm = (await pg.query("select convite_para_cadastro('hash-cadastro-morador') r")).rows[0].r;
ok(cm.email==="joao@x.com" && cm.condominio==="Cond D" && cm.unidade==="2", "servidor lê e-mail, condomínio e unidade do convite de morador: "+JSON.stringify(cm));
ok((await pg.query("select convite_para_cadastro('hash-inexistente') r")).rows[0].r===null, "token de morador inexistente não devolve nada");
await pg.exec("reset role");

if (falhas) process.exitCode = 1;
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTODOS OS TESTES PASSARAM");
