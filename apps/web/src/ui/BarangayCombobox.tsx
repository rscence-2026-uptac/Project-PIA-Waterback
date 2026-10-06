// Searchable dropdown for picking a barangay (onboarding, spec 05/08).
// Tap to open the full list of 57 Catbalogan barangays, or type to filter it. Matches official
// names, numbers and common spellings (data/barangays.ts). Follows the WAI-ARIA combobox pattern:
// arrow keys move, Enter picks, Escape closes; every option is a 56px tap target.
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useCopy } from "../copy/i18n";
import { CATBALOGAN_BARANGAYS, searchBarangays, type CatbaloganBarangay } from "../data/barangays";
import { Icon } from "./Icon";

export function BarangayCombobox({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const { t } = useCopy();
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const chosen = CATBALOGAN_BARANGAYS.find((b) => b.barangay_id === value) ?? null;
  const options: CatbaloganBarangay[] = query.trim() === "" ? CATBALOGAN_BARANGAYS : searchBarangays(query);

  function openList() {
    setOpen(true);
    setQuery("");
    const index = chosen ? CATBALOGAN_BARANGAYS.indexOf(chosen) : 0;
    setActive(Math.max(index, 0));
    requestAnimationFrame(() => scrollToOption(Math.max(index, 0)));
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  function pick(brgy: CatbaloganBarangay) {
    onChange(brgy.barangay_id);
    close();
  }

  function scrollToOption(index: number) {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function move(delta: number) {
    if (!open) return openList();
    const next = Math.min(Math.max(active + delta, 0), options.length - 1);
    setActive(next);
    scrollToOption(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Enter" && open && options[active]) { event.preventDefault(); pick(options[active]); }
    else if (event.key === "Escape") { close(); }
  }

  return (
    <div className="mt-5">
      <label htmlFor={inputId} className="text-[14px] font-bold">{t("settings.search_label")}</label>
      <p id={`${id}-scope`} className="text-[14px] text-ink-soft">{t("settings.search_scope")}</p>

      <div className="relative mt-2">
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${id}-opt-${options[active].barangay_id}` : undefined}
          aria-describedby={`${id}-scope`}
          type="text"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={open ? query : chosen?.name ?? ""}
          placeholder={t("settings.search_placeholder")}
          onFocus={openList}
          onClick={() => !open && openList()}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
            listRef.current?.scrollTo({ top: 0 });
          }}
          onKeyDown={onKeyDown}
          onBlur={close}
          className={`h-14 w-full rounded-md border-[1.5px] bg-foam pl-12 pr-14 text-[17px] ${open ? "border-tide" : "border-haze"} ${!open && chosen ? "font-bold" : ""}`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={t(open ? "settings.close_list" : "settings.open_list")}
          // Keep focus on the input so the list doesn't close before the toggle runs.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (open) close();
            else inputRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-sm text-ink"
        >
          <Icon name={open ? "chevronUp" : "chevronDown"} />
        </button>

        {open && (
          <div
            className="panel-in absolute inset-x-0 top-full z-30 mt-2 rounded-md bg-foam p-1.5"
            style={{ boxShadow: "0 12px 28px -10px rgba(13, 46, 66, 0.5)" }}
          >
            {options.length === 0 ? (
              <p role="status" className="p-3">{t("settings.no_match", { query: query.trim() })}</p>
            ) : (
              <ul ref={listRef} id={listId} role="listbox" aria-label={t("settings.search_label")} className="max-h-[min(360px,50dvh)] overflow-y-auto overscroll-contain">
                {options.map((brgy, index) => {
                  const selected = brgy.barangay_id === value;
                  const isActive = index === active;
                  return (
                    <li
                      key={brgy.barangay_id}
                      id={`${id}-opt-${brgy.barangay_id}`}
                      data-index={index}
                      role="option"
                      aria-selected={selected}
                      // mousedown, not click: picks before the input's blur closes the list.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(brgy);
                      }}
                      onMouseMove={() => setActive(index)}
                      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-sm px-3 text-[17px] ${selected ? "font-bold" : ""} ${isActive ? "bg-mist" : ""}`}
                    >
                      <Icon name={selected ? "check" : "pin"} className={selected ? "text-tide" : "text-ink-soft"} />
                      {brgy.name}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
