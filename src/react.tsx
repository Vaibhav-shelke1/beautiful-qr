import { useEffect, useMemo, useRef, useState } from "react";
import { generate } from "./generate.js";
import type { QRResult } from "./generate.js";
import type { QROptions } from "./options.js";

export interface QRCodeProps extends QROptions {
  className?: string;
  title?: string;
  fallback?: React.ReactNode;
  onReady?: (result: QRResult) => void;
  onError?: (error: Error) => void;
}

export function QRCode({
  className,
  title,
  fallback = null,
  onReady,
  onError,
  ...options
}: QRCodeProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const handlers = useRef({ onReady, onError });
  handlers.current = { onReady, onError };

  const key = useMemo(() => JSON.stringify(serialise(options)), [options]);

  useEffect(() => {
    let active = true;
    setSvg(null);

    generate(options)
      .then((result) => {
        if (!active) return;
        setSvg(result.toSVG());
        handlers.current.onReady?.(result);
      })
      .catch((error: Error) => {
        if (!active) return;
        handlers.current.onError?.(error);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!svg) return <>{fallback}</>;

  return (
    <span
      className={className}
      role="img"
      aria-label={title ?? `QR code for ${options.data}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function serialise(options: QROptions): unknown {
  const logo = options.logo;
  if (logo && typeof logo === "object" && "src" in logo && typeof logo.src !== "string") {
    return { ...options, logo: { ...logo, src: "[binary]" } };
  }
  if (logo && typeof logo !== "string") return { ...options, logo: "[binary]" };
  return options;
}

export default QRCode;
export type { QRResult } from "./generate.js";
export type { QROptions } from "./options.js";
