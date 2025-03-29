export default function DynamicPagePart() {
  return (
    <h2 className="text-2xl font-bold">
      Dynamic Page Part {new Date().toLocaleString()}
    </h2>
  );
}
