export type ResultadoEnvio = { ok: true } | { ok: false; erro: string };

/** O envio por e-mail só funciona com a chave do Resend e um remetente de domínio verificado. */
export function emailConfigurado(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_REMETENTE;
}

type Email = { para: string; assunto: string; html: string; texto: string; idempotencia?: string };

/** Envia por Resend (API REST). Precisa de RESEND_API_KEY e EMAIL_REMETENTE (domínio verificado). */
export async function enviarEmail(msg: Email): Promise<ResultadoEnvio> {
  const chave = process.env.RESEND_API_KEY;
  const remetente = process.env.EMAIL_REMETENTE;
  if (!chave || !remetente) {
    return { ok: false, erro: "E-mail não configurado (RESEND_API_KEY / EMAIL_REMETENTE)" };
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        ...(msg.idempotencia ? { "Idempotency-Key": msg.idempotencia } : {}),
      },
      body: JSON.stringify({
        from: remetente,
        to: [msg.para],
        subject: msg.assunto,
        html: msg.html,
        text: msg.texto,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (r.ok) return { ok: true };
    const detalhe = (await r.text().catch(() => "")).slice(0, 200);
    return { ok: false, erro: `Resend ${r.status}: ${detalhe}` };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha de rede ao enviar e-mail" };
  }
}
