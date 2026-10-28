const colors = { blue: "var(--kms-route-blue)", sky: "var(--kms-route-sky)", purple: "var(--kms-route-purple)", orange: "var(--kms-route-orange)", gold: "var(--kms-gold-500)" };
const layouts = {
  corner: { viewBox: "0 0 620 220", aspect: "xMaxYMin meet", paths: [["blue", "M0 62h130l52 48h150l62-58h226"], ["purple", "M70 25h145l95 100h310"], ["orange", "M0 158h330l62 50h228"], ["sky", "M458 0v80l70 74v66"]], nodes: [[130, 62, "blue"], [394, 52, "blue"], [458, 80, "sky"], [250, 158, "orange"]] },
  baseline: { viewBox: "0 0 1440 64", aspect: "xMinYMax slice", paths: [["white", "M-20 16H330L346 4H700"], ["gold", "M-20 34H470L494 14H1040"], ["sky", "M-20 52H650L672 34H1460"]], nodes: [[470, 34, "gold"], [650, 52, "sky"], [1040, 14, "gold"]] },
  bandStart: { viewBox: "0 0 640 64", aspect: "xMinYMax meet", paths: [["blue", "M-20 18H250L266 32H470"], ["sky", "M-20 44H340L356 54H560"]], nodes: [[470, 32, "blue"], [560, 54, "sky"]] },
  bandEnd: { viewBox: "0 0 560 52", aspect: "xMaxYMin meet", paths: [["orange", "M580 14H380L362 30H190"], ["purple", "M580 32H440L424 44H290"]], nodes: [[190, 30, "orange"], [290, 44, "purple"]] },
  ring: { viewBox: "0 0 100 100", aspect: "xMidYMid meet", paths: [["orange", "M 54 7 A 43 43 0 0 1 93 46"], ["sky", "M 93 54 A 43 43 0 0 1 54 93"], ["purple", "M 46 93 A 43 43 0 0 1 7 54"], ["blue", "M 7 46 A 43 43 0 0 1 46 7"]], nodes: [] },
};
const modeColors = { laut: "blue", udara: "sky", darat: "orange", kereta: "purple", umum: "blue" };

export default function PublicRouteArt({ variant = "corner", mode, className = "" }) {
  const layout = layouts[variant] || layouts.corner;
  const emphasis = modeColors[mode];
  return <svg className={`kms-route-art kms-route-art--${variant} ${className}`.trim()} viewBox={layout.viewBox} preserveAspectRatio={layout.aspect} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {layout.paths.map(([color, d]) => <path key={color} d={d} stroke={colors[color] || "rgb(255 255 255 / .22)"} strokeWidth={variant === "ring" ? 7 : variant === "corner" ? emphasis === color ? 6 : 4 : color === "white" ? 2 : 3.5} className={emphasis && emphasis !== color ? "is-muted" : undefined} />)}
    {layout.nodes.map(([cx, cy, color]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={variant === "corner" ? 8 : 5.5} fill={variant === "baseline" ? "var(--kms-home-brand)" : "var(--kms-route-node)"} stroke={colors[color]} strokeWidth={variant === "corner" ? 4 : 3} className={emphasis && emphasis !== color ? "is-muted" : undefined} />)}
  </svg>;
}
