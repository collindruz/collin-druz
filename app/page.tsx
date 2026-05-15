import { BedroomWall } from "@/components/BedroomWall";
import { projects } from "@/lib/projects";

export default function Page() {
  return <BedroomWall projects={projects} />;
}
