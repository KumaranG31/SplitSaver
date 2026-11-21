import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="flex min-h-[calc(100vh-120px)] flex-col items-center justify-center gap-4 p-4 text-center">
      <h2 className="text-2xl font-bold">Page not found</h2>
      <p className="text-app-muted">That step does not exist.</p>
      <Link href="/" className="btn btn-primary">
        Back to home
      </Link>
    </section>
  );
}
