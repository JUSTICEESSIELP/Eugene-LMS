type LogoProps = {
  className?: string;
  markClassName?: string;
  wordmark?: boolean;
};

const Logo = ({
  className = "",
  markClassName = "h-9 w-9",
  wordmark = true,
}: LogoProps) => {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        viewBox="0 0 64 64"
        className={markClassName}
        role="img"
        aria-label="Veya"
      >
        <rect width="64" height="64" rx="16" fill="var(--brand)" />
        <path d="M16 18h9.6l6.4 20.4L38.4 18H48L36.8 50h-9.6L16 18z" fill="var(--cream)" />
        <circle cx="46" cy="20" r="5" fill="var(--cream)" />
      </svg>
      {wordmark && (
        <span className="display-xl text-[1.6rem] leading-none">Veya</span>
      )}
    </span>
  );
};

export default Logo;
