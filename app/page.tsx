import { BedroomWall } from "@/components/BedroomWall";
import {
  computeWallLayouts,
  sortProjectsByYearDesc,
} from "@/lib/bedroomWallLayout";
import { projects } from "@/lib/projects";

const wallLayouts = computeWallLayouts(projects);
const projectsByYearDesc = sortProjectsByYearDesc(projects);

export default function Page() {
  return (
    <BedroomWall
      projects={projects}
      wallLayouts={wallLayouts}
      projectsByYearDesc={projectsByYearDesc}
    />
  );
}
