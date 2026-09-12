const NAME = "Knowledge Tree International Institute Ghana";

// Horizontal lockup is ~5:1, and its second line of type is about a quarter
// of the height — below ~40px tall it stops being readable.
const LOCKUP_HEIGHT = {
  sm: "h-10",
  md: "h-11",
  lg: "h-12",
} as const;

type LogoProps = {
  className?: string;
  /** Size of the square mark when `wordmark` is false. */
  markClassName?: string;
  /** Full lockup (mark + name) or the mark alone. */
  wordmark?: boolean;
  size?: keyof typeof LOCKUP_HEIGHT;
  /**
   * What the logo sits on. `auto` follows the app theme; use `light` or
   * `dark` where the surface is fixed regardless of theme (the footer is
   * always dark). The wordmark is navy on light grounds and cream on dark
   * ones — navy on near-black is unreadable.
   */
  tone?: "auto" | "light" | "dark";
};

const Logo = ({
  className = "",
  markClassName = "h-9 w-9",
  wordmark = true,
  size = "md",
  tone = "auto",
}: LogoProps) => {
  if (!wordmark) {
    return (
      <img
        src="/brand/kti-mark.png"
        alt={NAME}
        className={`${markClassName} shrink-0 object-contain ${className}`}
      />
    );
  }

  const height = LOCKUP_HEIGHT[size];
  const img = (src: string, visibility = "") => (
    <img src={src} alt={NAME} className={`${height} w-auto max-w-full ${visibility}`} />
  );

  return (
    <span className={`inline-flex items-center ${className}`}>
      {tone === "light" && img("/brand/kti-logo.png")}
      {tone === "dark" && img("/brand/kti-logo-on-dark.png")}
      {tone === "auto" && (
        <>
          {img("/brand/kti-logo.png", "dark:hidden")}
          {img("/brand/kti-logo-on-dark.png", "hidden dark:block")}
        </>
      )}
    </span>
  );
};

export default Logo;
