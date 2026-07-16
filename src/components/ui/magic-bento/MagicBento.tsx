"use client";
import * as React from "react";
import "./MagicBento.css";

type Intensity = "soft" | "normal" | "strong";

export type MagicBentoCardProps = {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  intensity?: Intensity;
  particles?: boolean;
  particleCount?: number;
  clickEffect?: boolean;
  disabled?: boolean;
};

type BentoContextValue = {
  enableBorderGlow: boolean;
  enableStars: boolean;
  particleCount: number;
  clickEffect: boolean;
  disabled: boolean;
  glowColor: string;
  registerCard: (el: HTMLElement) => () => void;
};

const BentoContext = React.createContext<BentoContextValue | null>(null);

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'button, a, input, select, textarea, label, [role="button"], [data-no-ripple]',
      ),
    )
  );
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isCoarse() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(hover: none)").matches ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

export function MagicBentoCard({
  children,
  className,
  intensity = "normal",
  particles: particlesProp,
  particleCount: particleCountProp,
  clickEffect: clickEffectProp,
  disabled: disabledProp,
}: MagicBentoCardProps) {
  const ctx = React.useContext(BentoContext);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const particlesRef = React.useRef<HTMLDivElement | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const particleTimers = React.useRef<number[]>([]);

  const disabled = disabledProp ?? ctx?.disabled ?? false;
  const particlesEnabled =
    (particlesProp ?? (ctx?.enableStars ?? true)) &&
    intensity !== "soft" &&
    !disabled;
  const particleCount =
    particleCountProp ??
    (intensity === "soft" ? 4 : ctx?.particleCount ?? 8);
  const clickEffect = clickEffectProp ?? ctx?.clickEffect ?? false;

  React.useEffect(() => {
    if (!ctx || !ref.current) return;
    return ctx.registerCard(ref.current);
  }, [ctx]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;
    if (isCoarse()) return;

    let x = 0;
    let y = 0;
    let intensityTarget = 0;
    let currentIntensity = 0;
    let cx = 50;
    let cy = 50;

    const tick = () => {
      currentIntensity += (intensityTarget - currentIntensity) * 0.18;
      cx += (x - cx) * 0.25;
      cy += (y - cy) * 0.25;
      el.style.setProperty("--glow-x", `${cx}%`);
      el.style.setProperty("--glow-y", `${cy}%`);
      el.style.setProperty("--glow-intensity", currentIntensity.toFixed(3));
      if (
        Math.abs(intensityTarget - currentIntensity) > 0.001 ||
        Math.abs(x - cx) > 0.1 ||
        Math.abs(y - cy) > 0.1
      ) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    const kick = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      x = ((e.clientX - rect.left) / rect.width) * 100;
      y = ((e.clientY - rect.top) / rect.height) * 100;
      intensityTarget = 1;
      kick();
    };
    const onEnter = () => {
      el.dataset.hovering = "true";
      intensityTarget = 1;
      kick();
      if (particlesEnabled && !prefersReducedMotion()) spawnParticles();
    };
    const onLeave = () => {
      el.dataset.hovering = "false";
      intensityTarget = 0;
      kick();
    };

    const spawnParticles = () => {
      const container = particlesRef.current;
      if (!container) return;
      // Prevent doubling on re-hover
      if (container.childElementCount >= particleCount) return;
      const rect = el.getBoundingClientRect();
      for (let i = 0; i < particleCount; i++) {
        const p = document.createElement("span");
        p.className = "magic-bento-particle";
        const px = Math.random() * rect.width;
        const py = Math.random() * rect.height;
        const dx = (Math.random() - 0.5) * 40;
        const dy = -20 - Math.random() * 30;
        p.style.left = `${px}px`;
        p.style.top = `${py}px`;
        p.style.setProperty("--dx", `${dx}px`);
        p.style.setProperty("--dy", `${dy}px`);
        p.style.animationDelay = `${i * 60}ms`;
        container.appendChild(p);
        const t = window.setTimeout(() => {
          p.remove();
        }, 1500 + i * 60);
        particleTimers.current.push(t);
      }
    };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointermove", onMove);
    return () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointermove", onMove);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      particleTimers.current.forEach((t) => clearTimeout(t));
      particleTimers.current = [];
      if (particlesRef.current) particlesRef.current.innerHTML = "";
    };
  }, [disabled, particlesEnabled, particleCount]);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!clickEffect || disabled) return;
    if (prefersReducedMotion() || isCoarse()) return;
    if (isInteractiveTarget(e.target)) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement("span");
    ripple.className = "magic-bento-ripple";
    ripple.style.left = `${e.clientX - rect.left}px`;
    ripple.style.top = `${e.clientY - rect.top}px`;
    ripple.style.width = `${size * 1.5}px`;
    ripple.style.height = `${size * 1.5}px`;
    el.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 650);
  };

  return (
    <div
      ref={ref}
      className={`magic-bento-card ${className ?? ""}`}
      data-magic-bento-card=""
      data-disabled={disabled ? "true" : "false"}
      onClick={onClick}
      style={{ ["--magic-glow-color" as string]: ctx?.glowColor ?? "132, 0, 255" }}
    >
      <div ref={particlesRef} className="magic-bento-particles" aria-hidden="true" />
      {children}
    </div>
  );
}

export type MagicBentoProps = {
  children: React.ReactNode;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  textAutoHide?: boolean;
  enableStars?: boolean;
  enableSpotlight?: boolean;
  enableBorderGlow?: boolean;
  disableAnimations?: boolean;
  spotlightRadius?: number;
  particleCount?: number;
  enableTilt?: boolean;
  glowColor?: string;
  clickEffect?: boolean;
  enableMagnetism?: boolean;
  autoWrapChildren?: boolean;
};

export function MagicBento({
  children,
  className,
  as: As = "div",
  enableStars = true,
  enableSpotlight = true,
  enableBorderGlow = true,
  disableAnimations = false,
  spotlightRadius = 400,
  particleCount = 12,
  glowColor = "132, 0, 255",
  clickEffect = true,
  autoWrapChildren = true,
}: MagicBentoProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const spotlightRef = React.useRef<HTMLDivElement | null>(null);
  const cardsRef = React.useRef<Set<HTMLElement>>(new Set());

  const registerCard = React.useCallback((el: HTMLElement) => {
    cardsRef.current.add(el);
    return () => {
      cardsRef.current.delete(el);
    };
  }, []);

  React.useEffect(() => {
    if (disableAnimations || !enableSpotlight) return;
    const root = rootRef.current;
    const spot = spotlightRef.current;
    if (!root || !spot) return;
    if (isCoarse()) return;

    const onMove = (e: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      spot.style.setProperty("--spotlight-x", `${x}%`);
      spot.style.setProperty("--spotlight-y", `${y}%`);
    };
    const onEnter = () => {
      root.dataset.spotlight = "true";
    };
    const onLeave = () => {
      root.dataset.spotlight = "false";
      cardsRef.current.forEach((el) => {
        el.dataset.hovering = "false";
        el.style.setProperty("--glow-intensity", "0");
      });
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerenter", onEnter);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerenter", onEnter);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, [disableAnimations, enableSpotlight]);

  const ctxValue: BentoContextValue = React.useMemo(
    () => ({
      enableBorderGlow,
      enableStars,
      particleCount,
      clickEffect,
      disabled: disableAnimations,
      glowColor,
      registerCard,
    }),
    [enableBorderGlow, enableStars, particleCount, clickEffect, disableAnimations, glowColor, registerCard],
  );

  const wrapped = React.useMemo(() => {
    if (!autoWrapChildren) return children;
    return React.Children.map(children, (child) => {
      if (!React.isValidElement(child)) return child;
      if ((child.type as { displayName?: string } | undefined)?.displayName === "MagicBentoCard") {
        return child;
      }
      return <MagicBentoCard>{child}</MagicBentoCard>;
    });
  }, [children, autoWrapChildren]);

  return (
    <BentoContext.Provider value={ctxValue}>
      <As
        // @ts-expect-error dynamic element ref
        ref={rootRef}
        className={`magic-bento-root ${className ?? ""}`}
        style={{
          ["--magic-glow-color" as string]: glowColor,
          ["--spotlight-radius" as string]: `${spotlightRadius}px`,
        }}
      >
        {enableSpotlight && !disableAnimations && (
          <div ref={spotlightRef} className="magic-bento-spotlight" aria-hidden="true" />
        )}
        {wrapped}
      </As>
    </BentoContext.Provider>
  );
}

(MagicBentoCard as unknown as { displayName?: string }).displayName = "MagicBentoCard";

export default MagicBento;
