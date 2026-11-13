export interface SampleSite {
  id: string;
  name: string;
  host: string;
  blurb: string;
  mark: string;
  rootPath: string;
}

export const SAMPLES: SampleSite[] = [
  {
    id: "northwind",
    name: "Northwind Archive",
    host: "northwind.example",
    blurb: "The files say yes. The contract says no.",
    mark: "Files vs terms",
    rootPath: "/samples/northwind",
  },
  {
    id: "lumen",
    name: "Lumen Health",
    host: "lumen.example",
    blurb: "Files and contract agree. The privacy terms changed.",
    mark: "Policy changed",
    rootPath: "/samples/lumen",
  },
  {
    id: "kindred",
    name: "Kindred Press",
    host: "kindred.example",
    blurb: "Training is allowed if you give credit.",
    mark: "Credit required",
    rootPath: "/samples/kindred",
  },
  {
    id: "pinnacle",
    name: "Pinnacle",
    host: "pinnacle.example",
    blurb: "A long contract. Cancellation is by certified mail.",
    mark: "Narrow scrape",
    rootPath: "/samples/pinnacle",
  },
  {
    id: "sable",
    name: "Sable Ferry",
    host: "sable.example",
    blurb: "A long contract. The training ban sits past Nano's excerpt.",
    mark: "Past Nano",
    rootPath: "/samples/sable",
  },
];

export function sampleById(id: string): SampleSite | undefined {
  return SAMPLES.find((sample) => sample.id === id);
}

export function absoluteSampleRoot(origin: string, sample: SampleSite): string {
  return `${origin.replace(/\/$/, "")}${sample.rootPath}`;
}
