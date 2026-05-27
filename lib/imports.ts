export interface ImportedDomainRow {
  domain: string;
  price?: number;
  minimumOffer?: number;
  registrar?: string;
  category?: string;
}

export function parsePortfolioCsv(csv: string): ImportedDomainRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));

    return {
      domain: row.domain,
      price: row.price ? Number(row.price) : undefined,
      minimumOffer: row.minimumoffer || row["minimum offer"] ? Number(row.minimumoffer || row["minimum offer"]) : undefined,
      registrar: row.registrar,
      category: row.category
    };
  });
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}
