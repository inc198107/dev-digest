"use client";

import { useParams } from "next/navigation";
import { ConventionsView } from "./_components/ConventionsView";

/**
 * Route /repos/:repoId/conventions (Skills Lab → Conventions). Thin route entry: reads the repo id
 * and renders the extractor view.
 * @returns The conventions page.
 */
export default function ConventionsPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ConventionsView repoId={repoId} />;
}
