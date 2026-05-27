import { Search } from "lucide-react";
import { getCategories } from "@/lib/search";

export function SearchForm({
  defaultValues = {}
}: {
  defaultValues?: Record<string, string | string[] | undefined>;
}) {
  const categories = getCategories();

  return (
    <form action="/domains" className="grid gap-3 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_auto]">
      <label className="grid gap-1 text-sm font-medium">
        Keyword
        <input
          className="focus-ring h-11 rounded-md border border-line px-3"
          name="q"
          placeholder="AI, trust, ledger"
          defaultValue={valueOf(defaultValues.q)}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        TLD
        <select className="focus-ring h-11 rounded-md border border-line px-3" name="tld" defaultValue={valueOf(defaultValues.tld) || "any"}>
          <option value="any">Any</option>
          <option value="com">.com</option>
          <option value="org">.org</option>
          <option value="ai">.ai</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Max price
        <input className="focus-ring h-11 rounded-md border border-line px-3" name="maxPrice" inputMode="numeric" placeholder="10000" defaultValue={valueOf(defaultValues.maxPrice)} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Category
        <select className="focus-ring h-11 rounded-md border border-line px-3" name="category" defaultValue={valueOf(defaultValues.category) || "any"}>
          <option value="any">Any</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>
      <button className="focus-ring mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white hover:bg-mint">
        <Search size={16} aria-hidden="true" />
        Search
      </button>
    </form>
  );
}

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
