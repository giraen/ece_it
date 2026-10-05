export default function Home() {
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">ECE Review</h1>
      <p className="text-muted">Board exam review.</p>
      <div className="flex gap-2">
        <button className="btn btn-primary">Primary</button>
        <button className="btn">Normal</button>
        <button className="btn btn-danger">Danger</button>
      </div>
      <input className="input" placeholder="A text box" />
      <p className="rounded-md border border-line bg-surface p-3 text-sm">
        A card with a border. <span className="text-good">Good</span> and <span className="text-danger">danger</span> colours.
      </p>
    </div>
  );
}