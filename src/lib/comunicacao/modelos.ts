export type Mensagem = { assunto: string; html: string; texto: string };

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const paragrafos = (texto: string) => escaparHtml(texto).replace(/\r?\n/g, "<br>");
const semQuebras = (texto: string) => texto.replace(/[\r\n]+/g, " ").trim();

function moldura(titulo: string, corpoHtml: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#18181b">
<p style="margin:0 0 20px;font-size:15px;font-weight:800;letter-spacing:3px;color:#18181b"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#4f46e5;margin-right:8px"></span>E<span style="color:#4f46e5">CONDOMINIO</span></p>
<h2 style="font-size:18px;margin:0 0 16px">${escaparHtml(titulo)}</h2>
${corpoHtml}
<hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0">
<p style="font-size:12px;color:#71717a;margin:0">Mensagem enviada pelo ECONDOMINIO.</p>
</div>`;
}

export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "full",
    timeStyle: "short",
  });
}

export function emailConvite(d: {
  condominio: string;
  unidade: string;
  bloco?: string | null;
  link: string;
}): Mensagem {
  const local = `${d.bloco ? `bloco ${d.bloco}, ` : ""}unidade ${d.unidade}`;
  const assunto = semQuebras(`Convite para o portal do ${d.condominio}`);
  const html = moldura(
    "Você foi convidado para o portal do condomínio",
    `<p>Você pode acompanhar as cotas, o balancete e os comunicados do <strong>${escaparHtml(d.condominio)}</strong> (${escaparHtml(local)}).</p>
<p><a href="${escaparHtml(d.link)}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Aceitar convite</a></p>
<p style="font-size:13px;color:#52525b">Use este mesmo e-mail para entrar ou criar sua conta. O link vale por 7 dias e só pode ser usado uma vez.</p>`,
  );
  const texto = `Você foi convidado para o portal do ${d.condominio} (${local}).\n\nAceite o convite: ${d.link}\n\nUse este mesmo e-mail para entrar ou criar sua conta. O link vale por 7 dias.`;
  return { assunto, html, texto };
}

export function emailComunicado(d: {
  condominio: string;
  tipo: "aviso" | "reuniao";
  titulo: string;
  corpo: string;
  dataReuniao?: string | null;
  local?: string | null;
}): Mensagem {
  const reuniao = d.tipo === "reuniao" && !!d.dataReuniao;
  const quando = reuniao ? formatarDataHora(d.dataReuniao as string) : null;
  const assunto = semQuebras(`${reuniao ? "Reunião: " : ""}${d.titulo} - ${d.condominio}`);
  const detalhes = reuniao
    ? `<p style="background:#f4f4f5;padding:12px;border-radius:6px"><strong>Quando:</strong> ${escaparHtml(quando!)}${
        d.local ? `<br><strong>Onde:</strong> ${escaparHtml(d.local)}` : ""
      }</p>`
    : "";
  const html = moldura(
    d.titulo,
    `<p style="margin:0 0 12px;color:#52525b">${escaparHtml(d.condominio)}</p>${detalhes}<p>${paragrafos(d.corpo)}</p>`,
  );
  const linhas = [d.condominio, "", d.titulo];
  if (reuniao) linhas.push(`Quando: ${quando}${d.local ? `\nOnde: ${d.local}` : ""}`);
  linhas.push("", d.corpo);
  return { assunto, html, texto: linhas.join("\n") };
}

/** Texto simples para WhatsApp (negrito com *...*). Inclui como deixar de receber, para reduzir denúncias. */
export function textoWhatsappComunicado(d: {
  condominio: string;
  tipo: "aviso" | "reuniao";
  titulo: string;
  corpo: string;
  dataReuniao?: string | null;
  local?: string | null;
}): string {
  const titulo = d.titulo.replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
  const linhas = [`*${titulo}*`, d.condominio];
  if (d.tipo === "reuniao" && d.dataReuniao) {
    linhas.push("", `Quando: ${formatarDataHora(d.dataReuniao)}`);
    if (d.local) linhas.push(`Onde: ${d.local}`);
  }
  linhas.push(
    "",
    d.corpo.trim(),
    "",
    "_Para deixar de receber estes avisos, ajuste sua autorização no portal ou fale com a administração._",
  );
  return linhas.join("\n").slice(0, 3900);
}
