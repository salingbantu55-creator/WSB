// ============================================================
// FILANTROPI MANAGEMENT SYSTEM — EDGE FUNCTION: payment-webhook
// ============================================================
// Satu-satunya jalur resmi status pembayaran menjadi "berhasil"
// di produksi. Memverifikasi signature provider SEBELUM update.
//
// Mendukung:
//   • Midtrans  (header X-Signature = sha512(order_id+status_code+gross_amount+serverKey))
//   • Xendit    (header x-callback-token vs secret XENDIT_CALLBACK_TOKEN)
//
// Deploy:
//   supabase functions deploy payment-webhook --no-verify-jwt
//   supabase secrets set MIDTRANS_SERVER_KEY=... XENDIT_CALLBACK_TOKEN=...
//
// URL webhook di dashboard provider:
//   https://<project>.supabase.co/functions/v1/payment-webhook
//
// PENTING: order_id / external_id pada provider = donation_code.
// Fungsi RPC `webhook_finalize_payment` (lihat schema.sql bagian bawah
// atau catatan di MIGRASI-SUPABASE.md) melakukan finalisasi atomik.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha512(text: string) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-512', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider') === 'xendit' ? 'xendit' : 'midtrans';
    const body = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role: bypass RLS
    );

    let orderCode = '', providerRef = '', ok = false, failMsg = '';

    if (provider === 'midtrans') {
      const { order_id, status_code, gross_amount, signature_key, transaction_status, transaction_id } = body;
      const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY');
      if (!serverKey) return json({ ok: false, error: 'MIDTRANS_SERVER_KEY belum diset sebagai secret' }, 500);
      const valid = signature_key === await sha512(order_id + status_code + gross_amount + serverKey);
      if (!valid) return json({ ok: false, error: 'Signature Midtrans TIDAK VALID — request diabaikan' }, 401);
      orderCode = order_id;
      providerRef = transaction_id || '';
      ok = ['capture', 'settlement'].includes(transaction_status);
      if (!ok) failMsg = `Status Midtrans: ${transaction_status}`;
    } else {
      const token = req.headers.get('x-callback-token') || '';
      const expected = Deno.env.get('XENDIT_CALLBACK_TOKEN');
      if (!expected || token !== expected) return json({ ok: false, error: 'Callback token Xendit tidak valid' }, 401);
      const { external_id, status, id } = body;
      orderCode = external_id;
      providerRef = id || '';
      ok = ['PAID', 'SETTLED', 'SUCCEEDED'].includes(status);
      if (!ok) failMsg = `Status Xendit: ${status}`;
    }

    // Finalisasi atomik server-side: donasi + transaksi + kuitansi + jurnal + notifikasi.
    // Untuk kegagalan pembayaran (ok=false), transaksi ditandai gagal oleh RPC.
    const { data, error } = await supabase.rpc('webhook_finalize_payment', {
      p_code: orderCode,
      p_provider_ref: 'WH-' + provider.toUpperCase() + '-' + (providerRef || 'REF'),
      p_note: 'Webhook terverifikasi signature (' + provider + ')' + (ok ? '' : ' — ' + failMsg),
      p_success: ok,
    });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json(data);
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
