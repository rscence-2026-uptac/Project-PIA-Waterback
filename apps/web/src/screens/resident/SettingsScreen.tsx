// Choose barangay (asked once, remembered on this phone) and language (spec 08: Waray / Filipino / English).
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { setLanguage, useCopy } from "../../copy/i18n";
import { setBarangay, useBarangay } from "../../lib/barangay";
import { BarangayCombobox } from "../../ui/BarangayCombobox";
import { Button } from "../../ui/Button";
import { Logo } from "../../ui/Logo";
import { Icon } from "../../ui/Icon";

export function SettingsScreen() {
  const { t, language, languages } = useCopy();
  const current = useBarangay();
  const navigate = useNavigate();
  const [choice, setChoice] = useState(current?.barangay_id ?? null);

  return (
    <>
      {current ? (
        <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 font-bold text-tide">
          <Icon name="chevronLeft" size={18} />
          {t("app.back")}
        </Link>
      ) : (
        <Logo height={28} className="min-h-11" />
      )}

      <h1 className="mt-4 text-[32px] leading-tight">{t("settings.title")}</h1>
      <p className="mt-1 text-ink-soft">{t("settings.sub")}</p>

      <BarangayCombobox value={choice} onChange={setChoice} />

      <fieldset className="mt-8">
        <legend className="text-[14px] font-bold">{t("settings.language")}</legend>
        <div className="mt-2 grid grid-cols-3 gap-2 rounded-md bg-mist p-1.5">
          {languages.map((lang) => (
            <label
              key={lang}
              className={`press flex min-h-11 cursor-pointer items-center justify-center rounded-sm text-[15px] font-bold ${language === lang ? "bg-tide text-foam" : "bg-foam text-ink"}`}
            >
              <input
                type="radio"
                name="language"
                value={lang}
                checked={language === lang}
                onChange={() => setLanguage(lang)}
                className="sr-only"
              />
              {t(`lang.${lang}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <Button
        className="mt-8 w-full"
        disabled={!choice}
        onClick={() => {
          if (!choice) return;
          setBarangay(choice);
          navigate("/");
        }}
      >
        {t("settings.save")}
      </Button>
    </>
  );
}
