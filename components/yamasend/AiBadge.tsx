/**
 * Cuadrado con la estrellita: la marca de todo lo que es IA / Asistente en la
 * app. Una sola paleta (verde de marca) para que se reconozca en el menú, en
 * los títulos y en el chat.
 */
export default function AiBadge({ size = 28, animated = false }: { size?: number; animated?: boolean }) {
  const icon = Math.round(size * 0.57);
  return (
    <span
      className="flex-none rounded-lg bg-ys-green-bg flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 16 16"
        fill="none"
        style={animated ? { animation: "ys-spark 3.2s ease-in-out infinite" } : undefined}
      >
        <path
          d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z"
          stroke="#12B76A"
          fill="#12B76A"
          fillOpacity={0.25}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
