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
  const allLayouts = computeWallLayouts(projects);
  const layoutBySlug = new Map(
    projects.map((project, index) => [project.slug, allLayouts[index]!]),
  );
  const wallProjects = projects.filter(
    (project) => project.archivalStamp !== "NEEDS_VIDEO",
  );
  const wallLayouts = wallProjects.map(
    (project) => layoutBySlug.get(project.slug)!,
  );
  const projectsByYearDesc = sortProjectsByYearDesc(projects);
  const wallLayoutDebug = getWallDebugOverlayData(wallProjects, wallLayouts);

  return (
    <BedroomWall
      projects={wallProjects}
      wallLayouts={wallLayouts}
      projectsByYearDesc={projectsByYearDesc}
      wallLayoutDebug={wallLayoutDebug}
    />
  );
}
