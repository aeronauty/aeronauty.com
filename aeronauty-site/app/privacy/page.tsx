import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <article className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm font-semibold text-blue-300 hover:text-blue-200">
          Aeronauty
        </Link>

        <h1 className="mt-10 text-4xl font-bold tracking-tight">Privacy notice</h1>
        <p className="mt-4 text-sm text-gray-500">Last updated: 3 May 2026</p>

        <div className="mt-10 space-y-8 text-gray-300">
          <section>
            <h2 className="text-xl font-semibold text-white">What I collect</h2>
            <p className="mt-3 leading-8">
              If you accept analytics, Aeronauty records first-party page views: the page path,
              page title, referrer, browser user agent, approximate country/region/city from
              Vercel geolocation headers, Vercel execution region, viewport size, a timestamp, and
              a short HMAC hash of your IP address. I do not store the raw IP address.
            </p>
            <p className="mt-3 leading-8">
              If you log into the private lab, I also record the email address you used, whether
              you used Google SSO or a magic link, and which private lab pages you open.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Why I collect it</h2>
            <p className="mt-3 leading-8">
              I use this to understand which private drafts, demos, and articles people actually
              use, where performance problems show up, and which parts of the site are worth more
              server time. The site is small, but the server still costs money.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Consent</h2>
            <p className="mt-3 leading-8">
              Analytics page views are only sent after you accept the notice. Your choice is stored
              in your browser local storage. You can clear site data in your browser to reset it.
              Essential authentication cookies for the private lab are used when you sign in, and
              private lab access is logged as part of providing gated access.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Who sees it</h2>
            <p className="mt-3 leading-8">
              The activity log is for me. Infrastructure providers such as Vercel, Upstash, Resend,
              and Google may process data as part of hosting, storage, email delivery, and SSO.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Retention</h2>
            <p className="mt-3 leading-8">
              The first-party activity log keeps a rolling set of recent events rather than an
              indefinite archive. Current implementation keeps up to 5,000 recent events.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Contact</h2>
            <p className="mt-3 leading-8">
              If you want me to remove activity tied to your email address, contact me directly.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
