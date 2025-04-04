export default function StaticPagePart() {
  return (
    <h2 className="text-2xl font-bold">
      Static Page Part {new Date().toISOString()}
    </h2>
  );
}
