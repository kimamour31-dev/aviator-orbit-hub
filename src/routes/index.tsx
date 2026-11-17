
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OMUH 360 — Tunafanya Maboresho" },
      {
        name: "description",
        content:
          "OMUH 360 inafanyiwa maboresho kwa sasa. Tutakujulisha huduma zitakaporejea.",
      },
      {
        property: "og:title",
        content: "OMUH 360 — Tunafanya Maboresho",
      },
      {
        property: "og:description",
        content:
          "Tunafanya maboresho ili kukupa huduma bora zaidi. Tutarudi hivi karibuni!",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">

      {/* Background decoration */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />

      <main className="relative z-10 w-full max-w-xl">

        <div className="rounded-3xl border bg-card/90 p-6 text-center shadow-2xl backdrop-blur-md sm:p-10">

          {/* Logo / Brand */}
          <div className="mb-8">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-4xl">
              ✈️
            </div>

            <h2 className="text-2xl font-black tracking-wider">
              OMUH <span className="text-primary">360</span>
            </h2>

            <p className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Aviator Experience
            </p>
          </div>

          {/* Maintenance icon */}
          <div className="mb-6 text-6xl">
            🚧
          </div>

          {/* Main heading */}
          <h1 className="mb-4 text-3xl font-extrabold leading-tight sm:text-4xl">
            Tunafanya Maboresho!
          </h1>

          <p className="mx-auto mb-8 max-w-md text-base leading-relaxed text-muted-foreground">
            Habari! Kwa sasa tovuti ya OMUH 360 inafanyiwa
            matengenezo na maboresho ya mfumo ili kukupa
            huduma bora, salama na yenye ubora zaidi.
          </p>

          {/* Status */}
          <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">

            <div className="mb-3 flex items-center justify-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
              </span>

              <span className="text-sm font-semibold">
                Matengenezo yanaendelea
              </span>
            </div>

            <h2 className="mb-2 text-lg font-bold">
              Tutarudi Hivi Karibuni!
            </h2>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Usijali, hatujakusahau. Mara tu maboresho
              yatakapokamilika, tutakupa taarifa rasmi
              kupitia njia zetu za mawasiliano.
            </p>
          </div>

          {/* Notice */}
          <div className="space-y-2 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">
                Tafadhali subiri.
              </strong>
            </p>

            <p>
              Kwa sasa huduma za kucheza na kuweka dau
              hazipatikani. Tunakushukuru kwa uvumilivu wako.
            </p>
          </div>

          {/* Footer */}
          <div className="mt-8 border-t pt-5">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} OMUH 360.
              Haki zote zimehifadhiwa.
            </p>

            <p className="mt-2 text-xs text-muted-foreground">
              Asante kwa kuwa sehemu ya OMUH 360 
            </p>
          </div>

        </div>

      </main>
    </div>
  );
}
