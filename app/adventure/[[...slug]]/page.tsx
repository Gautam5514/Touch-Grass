import AdventureRouter from "@/components/AdventureRouter";

// One static shell serves every /adventure/<id>/ and /adventure/<id>/complete/ URL.
// Hosting must rewrite /adventure/* to this page (see render.yaml and scripts/serve.mjs).
export function generateStaticParams() {
  return [{ slug: [] }];
}

export default function Page() {
  return <AdventureRouter />;
}
