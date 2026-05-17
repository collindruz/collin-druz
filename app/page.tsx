import { BedroomWall } from "@/components/BedroomWall";
import {
  computeWallLayouts,
  getWallDebugOverlayData,
  sortProjectsByYearDesc,
} from "@/lib/bedroomWallLayout";
import { projects } from "@/lib/projects";

/**
 * Recompute wall layouts per request (not at module load). Otherwise static prerender + Turbopack
 * module caching can freeze `computeWallLayouts` output until a full rebuild — “invisible” layout edits.
 */
export const dynamic = "force-dynamic";

export default function Page() {
  const wallLayouts = computeWallLayouts(projects);
  const projectsByYearDesc = sortProjectsByYearDesc(projects);
  const wallLayoutDebug = getWallDebugOverlayData(projects, wallLayouts);

  return (
    <BedroomWall
      projects={projects}
      wallLayouts={wallLayouts}
      projectsByYearDesc={projectsByYearDesc}
      wallLayoutDebug={wallLayoutDebug}
    />
  );
}
