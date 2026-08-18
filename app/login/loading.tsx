export default function LoginLoading() {
  return (
    <div className="fixed inset-0 bg-[#fbfcfb] flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4">
        <div className="w-9 h-9 rounded-full border-[3px] border-ys-border border-t-ys-green animate-spin" />
        <div className="text-sm font-semibold text-ys-muted">Redirigiendo a Iniciar sesión...</div>
      </div>
    </div>
  );
}
