// Supabase Edge Function — send-checkin-reminder
// Enviá emails de recordatorio a jugadores que no hicieron check-in hoy.
// Se invoca manualmente desde la app O automáticamente por pg_cron.
//
// Secrets necesarios en Supabase Dashboard > Settings > Edge Functions > Secrets:
//   BREVO_API_KEY  — tu API key de Brevo (brevo.com, gratis hasta 300/día)
//   FROM_EMAIL     — el email verificado en Brevo (ej: guido.anfuso97@gmail.com)
//   APP_URL        — https://guidoanfuso97-code.github.io/ctsantiagofleitas/

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const BREVO_KEY = Deno.env.get("BREVO_API_KEY")!;
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "guido.anfuso97@gmail.com";
    const APP_URL = Deno.env.get("APP_URL") || "https://guidoanfuso97-code.github.io/ctsantiagofleitas/";

    // Cuerpo de la request (puede venir de la app o del cron)
    let body: { team_id?: string; today?: string; submitted?: number[] } = {};
    try { body = await req.json(); } catch { /**/ }

    const today = body.today || new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    });

    // Traer equipos
    const teamsQuery = supabase.from("teams").select("*");
    if (body.team_id) teamsQuery.eq("id", body.team_id);
    const { data: teams, error: tErr } = await teamsQuery;
    if (tErr) throw tErr;

    let sent = 0;
    const errors: string[] = [];

    for (const team of teams || []) {
      // Jugadores que ya hicieron check-in hoy
      let submittedIdxs: number[] = body.submitted || [];
      if (!body.submitted) {
        const { data: ws } = await supabase
          .from("wellness")
          .select("player_idx")
          .eq("team_id", team.id)
          .eq("date", today);
        submittedIdxs = (ws || []).map((r: { player_idx: number }) => r.player_idx);
      }

      const players: Array<{ name: string; email?: string; num?: number }> = team.players || [];

      for (let i = 0; i < players.length; i++) {
        const player = players[i];
        if (!player.email || submittedIdxs.includes(i)) continue;

        const firstName = player.name.split(" ").pop() || player.name;

        const emailBody = {
          sender: { name: "ATLAS · " + team.name, email: FROM_EMAIL },
          to: [{ email: player.email, name: player.name }],
          subject: "📊 Check-in ATLAS de hoy — " + today,
          htmlContent: `
            <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc">
              <div style="background:#0f172a;border-radius:12px;padding:20px 24px;margin-bottom:16px">
                <span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-.5px">ATL<span style="color:#06d6a0">A</span>S</span>
              </div>
              <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
                <h2 style="margin:0 0 12px;font-size:18px;color:#0f172a">Hola ${firstName}!</h2>
                <p style="color:#475569;margin:0 0 20px;line-height:1.6">
                  Acordate de completar tu <strong>check-in de bienestar</strong> de hoy.<br>
                  Solo tarda 1 minuto y ayuda a Guido a cuidar tu rendimiento.
                </p>
                <a href="${APP_URL}" style="display:inline-block;background:#06d6a0;color:#0f172a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
                  ✅ Hacer check-in ahora →
                </a>
              </div>
              <p style="font-size:11px;color:#94a3b8;margin-top:16px;text-align:center">
                ${team.name} · Temporada 2026 · ATLAS
              </p>
            </div>
          `,
        };

        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": BREVO_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(emailBody),
        });

        if (res.ok) {
          sent++;
        } else {
          const err = await res.text();
          errors.push(`${player.email}: ${err}`);
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent, date: today, errors }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
