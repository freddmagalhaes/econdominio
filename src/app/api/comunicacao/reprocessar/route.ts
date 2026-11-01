import { timingSafeEqual } from "node:crypto";
import { enviarPendentes } from "@/lib/comunicacao/enviar-pendentes";
import { enviarWhatsappPendentes } from "@/lib/comunicacao/enviar-whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";

// O WhatsApp é enviado com pausa entre mensagens: dê tempo à função (o plano pode limitar o máximo).
export const maxDuration = 60;

// Reprocessa e-mails e WhatsApp pendentes/falhos de todos os condomínios. Chamado por um agendador
// (Vercel Cron ou outro) com "Authorization: Bearer <CRON_SECRET>". Não usa sessão de usuário (ver proxy).
// Para esvaziar uma fila grande de WhatsApp, agende esta rota com frequência (ex.: a cada 5 minutos).
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return new Response("CRON_SECRET não configurado", { status: 503 });

  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
    return new Response("Não autorizado", { status: 401 });
  }

  const admin = createAdminClient();
  const email = await enviarPendentes(admin, { limite: 300 });
  const whatsapp = await enviarWhatsappPendentes(admin, { limite: 100, orcamentoMs: 45_000 });
  return Response.json({ email, whatsapp }, { headers: { "Cache-Control": "no-store" } });
}
