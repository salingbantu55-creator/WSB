// ============================================================
// FILANTROPI MANAGEMENT SYSTEM — EDGE FUNCTION: whatsapp-send
// ============================================================
// Kirim pesan WhatsApp / Email melalui provider yang dikonfigurasi.
// TOKEN API disimpan sebagai secret server — TIDAK PERNAH di frontend.
//
// Deploy:
//   supabase functions deploy whatsapp-send
//   supabase secrets set WA_PROVIDER=fonnte WA_TOKEN=<token>
//   (opsional kirim email kuitansi: RESEND_API_KEY=... EMAIL_FROM=...)
//
// Body: { to: "62812…", message: "teks", channel?: "whatsapp"|"email",
//         subject?: "…", ref?: "DN…" }
// Autentikasi: JWT pengguna (admin) melalui header Authorization.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendWhatsApp(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const provider = (Deno.env.get('WA_PROVIDER') || 'fonnte').toLowerCase();
  const token = Deno.env.get('WA_TOKEN');
  if (!token) return { ok: false, error: 'WA_TOKEN belum diset sebagai secret Edge Function' };

  if (provider === 'fonnte') {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: to, message }),
    });
    return res.ok ? { ok: true } : { ok: false, error: 'Fonnte HTTP ' + res.status + ': ' + (await res.text()).slice(0, 200) };
  }
  if (provider === 'wablas') {
    const domain = Deno.env.get('WA_WABLAS_DOMAIN') || 'https://console.wablas.com';
    const res = await fetch(domain + '/api/send-message', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: to, message }),
    });
    return res.ok ? { ok: true } : { ok: false, error: 'Wablas HTTP ' + res.status };
  }
  if (provider === 'twilio') {
    const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const from = Deno.env.get('TWILIO_WHATSAPP_FROM');
    if (!sid || !from) return { ok: false, error: 'TWILIO_ACCOUNT_SID / TWILIO_WHATSAPP_FROM belum diset' };
    const form = new URLSearchParams({ To: 'whatsapp:+' + to, From: from, Body: message });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(sid + ':' + token),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    return res.ok ? { ok: true } : { ok: false, error: 'Twilio HTTP ' + res.status };
  }
  if (provider === 'meta') {
    const phoneId = Deno.env.get('META_PHONE_NUMBER_ID');
    if (!phoneId) return { ok: false, error: 'META_PHONE_NUMBER_ID belum diset' };
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'text',
        text: { preview_url: true, body: message },
      }),
    });
    return res.ok ? { ok: true } : { ok: false, error: 'Meta Cloud API HTTP ' + res.status };
  }
  return { ok: false, error: 'Provider WhatsApp tidak dikenal: ' + provider };
}

async function sendEmail(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') || 'Filantropi <onboarding@resend.dev>';
  if (!key) return { ok: false, error: 'RESEND_API_KEY belum diset sebagai secret' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  return res.ok ? { ok: true } : { ok: false, error: 'Resend HTTP ' + res.status };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // autentikasi: hanya pengguna terautentikasi (admin) yang boleh memicu kirim
    const authHeader = req.headers.get('Authorization') || '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return json({ ok: false, error: 'Tidak diizinkan — login admin diperlukan' }, 401);

    const { to, message, channel, subject } = await req.json();
    if (!to || !message) return json({ ok: false, error: 'Field `to` dan `message` wajib' }, 400);

    const isEmail = channel === 'email' || (!channel && to.includes('@'));
    const result = isEmail ? await sendEmail(to, subject || 'Kuitansi Donasi', message) : await sendWhatsApp(to, message);
    return json(result, result.ok ? 200 : 502);
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
