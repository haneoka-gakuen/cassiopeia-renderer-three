import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  StreamDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
} from "three";
import { OUR_NOTES_LIVE_GEOMETRY } from "@haneoka/cassiopeia-plugin-our-notes";
import type { RenderSimultaneousLine } from "@haneoka/cassiopeia-plugin-our-notes";
import { StageProjector } from "./stageGeometry";

/** One ordered draw for LivePairNoteLineView's fixed-height white planes. */
export class SimultaneousLineLayer {
  readonly group = new Group();

  private readonly projector: StageProjector;
  private readonly layout = new Object3D();
  private readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  private capacity = 0;
  private readonly material = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    toneMapped: false,
  });

  constructor(projector: StageProjector) {
    this.projector = projector;
    // The pair line is a single flat plane, so one unculled pass preserves its
    // pixels while avoiding Three's transparent DoubleSide back/front draws.
    this.material.forceSinglePass = true;
    this.group.name = "OurNotesSimultaneousLines";
    this.mesh = new Mesh(new BufferGeometry(), this.material);
    this.mesh.geometry.setAttribute("position", new BufferAttribute(new Float32Array(9), 3));
    this.mesh.geometry.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1));
    this.mesh.geometry.setDrawRange(0, 0);
    this.mesh.renderOrder = OUR_NOTES_LIVE_GEOMETRY.sortingOrders.simultaneousLine;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  beginWarmup(): () => void {
    const visible = this.mesh.visible,
      count = this.mesh.geometry.drawRange.count;
    this.mesh.visible = true;
    this.mesh.geometry.setDrawRange(0, 3);
    return () => {
      this.mesh.visible = visible;
      this.mesh.geometry.setDrawRange(0, count);
    };
  }

  update(lines: ReadonlyArray<RenderSimultaneousLine> | undefined): void {
    const required = lines?.length ?? 0;
    this.mesh.visible = required > 0;
    if (!required) return;
    if (required > this.capacity) {
      this.capacity = Math.max(16, 2 ** Math.ceil(Math.log2(required)));
      this.mesh.geometry.dispose();
      const geometry = (this.mesh.geometry = new BufferGeometry());
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(this.capacity * 12), 3).setUsage(StreamDrawUsage),
      );
      const indices = new Uint32Array(this.capacity * 6);
      for (let line = 0; line < this.capacity; line++) {
        const vertex = line * 4,
          offset = line * 6;
        indices[offset] = vertex;
        indices[offset + 1] = vertex + 2;
        indices[offset + 2] = vertex + 1;
        indices[offset + 3] = vertex + 2;
        indices[offset + 4] = vertex + 3;
        indices[offset + 5] = vertex + 1;
      }
      geometry.setIndex(new BufferAttribute(indices, 1));
    }
    const positions = this.mesh.geometry.getAttribute("position") as BufferAttribute;
    let count = 0;
    for (const line of lines ?? []) {
      if (line.visible === false || line.rightCenter <= line.leftCenter) continue;

      if (line.leftApproach !== undefined || line.rightApproach !== undefined) {
        const leftProgress = this.projector.viewProgress(line.leftApproach ?? line.approach);
        const rightProgress = this.projector.viewProgress(line.rightApproach ?? line.approach);
        const left = this.projector.laneEdgeToXAtViewProgress(line.leftCenter, leftProgress);
        const right = this.projector.laneEdgeToXAtViewProgress(line.rightCenter, rightProgress);
        const leftY = this.projector.yAtViewProgress(leftProgress);
        const rightY = this.projector.yAtViewProgress(rightProgress);
        this.layout.position.set((left + right) / 2, (leftY + rightY) / 2, 0);
        this.layout.rotation.z = Math.atan2(rightY - leftY, right - left);
        this.layout.scale.set(
          Math.hypot(right - left, rightY - leftY),
          OUR_NOTES_LIVE_GEOMETRY.simultaneousLineSize[1],
          1,
        );
      } else {
        const viewProgress = this.projector.viewProgress(line.approach);
        const left = this.projector.laneEdgeToXAtViewProgress(line.leftCenter, viewProgress);
        const right = this.projector.laneEdgeToXAtViewProgress(line.rightCenter, viewProgress);
        this.layout.position.set((left + right) / 2, this.projector.yAtViewProgress(viewProgress), 0);
        // SetProgress scales only SpriteRenderer.size.x. The serialized 0.025
        // Unity-unit Y size remains fixed at every approach position.
        this.layout.scale.set(right - left, OUR_NOTES_LIVE_GEOMETRY.simultaneousLineSize[1], 1);
        this.layout.rotation.z = 0;
      }
      this.layout.updateMatrix();
      const matrix = this.layout.matrix.elements;
      for (let vertex = 0; vertex < 4; vertex++) {
        const x = vertex % 2 ? 0.5 : -0.5,
          y = vertex < 2 ? 0.5 : -0.5;
        positions.setXYZ(
          count * 4 + vertex,
          matrix[0]! * x + matrix[4]! * y + matrix[12]!,
          matrix[1]! * x + matrix[5]! * y + matrix[13]!,
          matrix[2]! * x + matrix[6]! * y + matrix[14]!,
        );
      }
      count++;
    }

    this.mesh.visible = count > 0;
    this.mesh.geometry.setDrawRange(0, count * 6);
    positions.clearUpdateRanges();
    positions.addUpdateRange(0, count * 12);
    positions.needsUpdate = true;
  }

  dispose(): void {
    this.group.clear();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
