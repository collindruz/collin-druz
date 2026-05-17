import { BedroomWall } from "@/components/BedroomWall";
import {
  computeWallLayouts,
  getWallDebugOverlayData,
  sortProjectsByYearDesc,
} from "@/lib/bedroomWallLayout";
import { projects } from "@/lib/projects";

const wallLayouts = computeWallLayouts(projects);
const projectsByYearDesc = sortProjectsByYearDesc(projects);
const wallLayoutDebug = getWallDebugOverlayData(projects, wallLayouts);

export default function Page() {
  return (
    <BedroomWall
      projects={projects}
      wallLayouts={wallLayouts}
      projectsByYearDesc={projectsByYearDesc}
      wallLayoutDebug={wallLayoutDebug}
    />
  );
}
