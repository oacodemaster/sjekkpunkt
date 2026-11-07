/** Every Holio page sits in the .holio scope: system-ui and grey-blue, no Sjekkpunkt tokens. */
export default function HolioLayout({ children }: { children: React.ReactNode }) {
  return <div className="holio">{children}</div>;
}
