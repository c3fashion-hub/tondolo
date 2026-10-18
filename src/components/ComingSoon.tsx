// Holds the place of a tab that a later build stage fills in.
export function ComingSoon({ title, what }: { title: string; what: string }) {
  return (
    <>
      <h1 className="tn-title">{title}</h1>
      <div className="tn-card">
        <p>{what}</p>
        <p className="tn-muted">We&rsquo;re still building this part of Tondolo.</p>
      </div>
    </>
  );
}
