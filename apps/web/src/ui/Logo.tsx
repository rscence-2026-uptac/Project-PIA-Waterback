// The Project PIA logo (src/assets/Project PIA Logo.png, cropped to logo-mark.png).
// Its curved "WATERBACK" lettering is too small to read at header size, so the name is
// also set in type beside it; the image itself is decorative for screen readers.
import { useCopy } from "../copy/i18n";
import logoMark from "../assets/logo-mark.png";

export function Logo({ height = 36, showName = true, className = "" }: {
  height?: number;
  showName?: boolean;
  className?: string;
}) {
  const { t } = useCopy();
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <img src={logoMark} alt="" height={height} width={Math.round((height * 355) / 160)} className="shrink-0" />
      {showName && <span className="whitespace-nowrap font-display text-[19px] text-ink">{t("app.name")}</span>}
    </span>
  );
}
