/**
 * Destino del link del mail de acceso (login y registro).
 *
 * No entra solo: muestra un botón. Así, si el programa de mail o un antivirus
 * abre el link para "revisarlo" antes que la persona, no gasta el link (es de
 * un solo uso). El canje real lo hace /auth/confirm/verificar por POST.
 */
export default async function ConfirmarAccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;
  const valido = Boolean(tokenHash);

  return (
    <main className="min-h-screen bg-ys-bg flex items-center justify-center px-4">
      <div className="w-full max-w-[420px] bg-ys-card border border-ys-border rounded-[18px] p-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-login.png" alt="YamaSend" className="h-10 mx-auto mb-6" />
        {valido ? (
          <>
            <h1 className="text-[20px] font-extrabold text-ys-text mb-2">Entrá a tu cuenta</h1>
            <p className="text-[14px] text-ys-muted mb-6">
              Tocá el botón para ingresar a YamaSend. El link sirve una sola vez.
            </p>
            <form action="/auth/confirm/verificar" method="post">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type ?? "email"} />
              <button
                type="submit"
                className="w-full text-[14px] font-bold text-white bg-ys-green rounded-[12px] py-3 cursor-pointer transition-colors hover:bg-ys-green-hover"
              >
                Entrar a YamaSend
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-[20px] font-extrabold text-ys-text mb-2">El link no es válido</h1>
            <p className="text-[14px] text-ys-muted mb-6">Pedí uno nuevo desde la pantalla de ingreso.</p>
            <a
              href="/login"
              className="inline-block w-full text-[14px] font-bold text-white bg-ys-green rounded-[12px] py-3"
            >
              Ir al ingreso
            </a>
          </>
        )}
      </div>
    </main>
  );
}
