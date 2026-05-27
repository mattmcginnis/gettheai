import Image from "next/image";

export function MarketVisual() {
  return (
    <div className="market-grid relative overflow-hidden rounded-md border border-line bg-white p-4 shadow-panel">
      <Image
        src="/getthe-market-map.svg"
        alt="GetThe marketplace showing .com, .org, and .ai inventory flowing into one search and escrow workflow."
        width={720}
        height={460}
        priority
        className="h-auto w-full"
      />
    </div>
  );
}
