import { BedroomWall } from "@/components/BedroomWall";
import { getProjectsForArchive } from "@/lib/projects";

export default function Page() {
  return <BedroomWall projects={getProjectsForArchive()} />;
}
