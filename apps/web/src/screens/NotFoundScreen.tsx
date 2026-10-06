// Broken or old links (e.g. a mistyped SMS link) and unexpected screen errors. Resident-first:
// one plain sentence, the empty drop as the picture, and two big ways back (elderly-friendly-ui).
import { isRouteErrorResponse, useRouteError } from "react-router";
import { useCopy } from "../copy/i18n";
import { Button, ButtonLink } from "../ui/Button";
import { DropGauge } from "../ui/Drop";
import { Logo } from "../ui/Logo";

function Frame({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-foam px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
      <Logo height={28} />
      <main className="flex flex-1 flex-col justify-center py-10">
        <div className="flex justify-center">
          <DropGauge look="repair" width={112} />
        </div>
        <h1 className="mt-8 text-center text-[32px] leading-[1.05] tracking-[-0.03em] text-ink">{title}</h1>
        <p className="mx-auto mt-3 max-w-[32ch] text-center text-[18px] text-ink-soft">{body}</p>
        <div className="mt-10 flex flex-col gap-3">{children}</div>
      </main>
    </div>
  );
}

/** Unknown path: the link is old or mistyped. */
export function NotFoundScreen() {
  const { t } = useCopy();
  return (
    <Frame title={t("notfound.title")} body={t("notfound.body")}>
      <ButtonLink to="/" icon="drop" className="w-full">{t("notfound.home")}</ButtonLink>
      <ButtonLink to="/sources" variant="quiet" icon="pin" className="w-full">{t("notfound.sources")}</ButtonLink>
    </Frame>
  );
}

/** Router errorElement: a 404 gets the page above; anything else gets a calm "try again". */
export function RouteErrorScreen() {
  const error = useRouteError();
  const { t } = useCopy();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundScreen />;
  return (
    <Frame title={t("error.title")} body={t("error.body")}>
      <Button icon="drop" className="w-full" onClick={() => window.location.reload()}>{t("app.retry")}</Button>
      <ButtonLink to="/" variant="quiet" className="w-full">{t("notfound.home")}</ButtonLink>
    </Frame>
  );
}
